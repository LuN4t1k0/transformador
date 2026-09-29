const test = require('node:test');
const assert = require('node:assert/strict');
const { createPseudonymizer } = require('../packages/template-engine/src/assistant/pseudonymize');
const { evaluateTemplate } = require('../packages/template-engine/src/assistant/evaluate');
const { isValidRut } = require('../packages/packs/chile/rut');
const { validateTemplateConfig } = require('../packages/template-engine/src/schema');
const { runAssistant } = require('../apps/api/src/assistant/agent');
const { createAssistantService } = require('../apps/api/src/assistant/service');

const inputHeaders = ['RUT', 'Nombre completo', 'AFP', 'Monto', 'Fecha'];
const people = [
  ['12.345.678-5', 'PÉREZ SOTO JUAN CARLOS', 'Capital', 1000, new Date(Date.UTC(2024, 4, 3))],
  ['9.876.543-3', 'DE LA FUENTE ROJAS ANA', 'Modelo', 2500, new Date(Date.UTC(2024, 4, 4))],
  ['10.231.091-8', 'SOTO DÍAZ PEDRO', 'Capital', 300, new Date(Date.UTC(2024, 4, 5))],
  ['11.111.111-1', 'ROJAS PÉREZ MARÍA', 'Capital', 800, new Date(Date.UTC(2024, 4, 6))]
];
const input = { headers: inputHeaders, rows: people.map((values, index) => ({ rowNumber: index + 2, values: Object.fromEntries(inputHeaders.map((header, column) => [header, values[column]])) })) };
const outputHeaders = ['RUT', 'PATERNO', 'CODIGO AFP', 'MONTO'];
const output = {
  headers: outputHeaders,
  rows: people.map(([rut, name, afp, amount], index) => ({
    rowNumber: index + 2,
    values: { RUT: rut.replace(/\./g, ''), PATERNO: name.startsWith('DE LA FUENTE') ? 'DE LA FUENTE' : name.split(' ')[0], 'CODIGO AFP': afp === 'Capital' ? '03' : '08', MONTO: amount }
  }))
};
const currentTemplate = validateTemplateConfig({
  name: 'Borrador',
  columns: [
    { id: 'rut', outputName: 'RUT', source: { type: 'COLUMN', column: 'RUT' }, transformations: [], validations: [] },
    { id: 'paterno', outputName: 'PATERNO', source: { type: 'EMPTY' }, transformations: [], validations: [] },
    { id: 'afp', outputName: 'CODIGO AFP', source: { type: 'COLUMN', column: 'AFP' }, transformations: [], validations: [] },
    { id: 'monto', outputName: 'MONTO', source: { type: 'COLUMN', column: 'Monto' }, transformations: [], validations: [] }
  ]
});

test('pseudonymizes identifiers and names consistently, keeps numbers, dates and categories', () => {
  const pseudo = createPseudonymizer({ secret: Buffer.from('fixed-secret-for-tests') });
  const rows = pseudo.rows(inputHeaders, input.rows);
  const fakeRut = rows[0].values.RUT;
  assert.notEqual(fakeRut, '12.345.678-5');
  assert.match(fakeRut, /^\d{1,2}\.\d{3}\.\d{3}-[\dK]$/, 'keeps the way it is written');
  assert.equal(isValidRut(fakeRut), true, 'still a valid RUT');
  assert.equal(pseudo.text('12345678-5').replace(/\D/g, ''), fakeRut.replace(/\D/g, ''), 'same RUT written differently gets the same fake');

  const name = rows[1].values['Nombre completo'];
  assert.match(name, /^DE LA [A-Z]+ [A-Z]+ [A-Z]+$/, 'particles stay, words keep case and count');
  assert.equal(name.split(' ')[3].length, 'ROJAS'.length);
  assert.equal(rows[3].values['Nombre completo'].split(' ')[0], name.split(' ')[3], 'the same surname gets the same fake everywhere');
  assert.equal(rows[0].values['Nombre completo'].includes('PÉREZ'), false);

  assert.deepEqual(rows.map((row) => row.values.AFP), ['Capital', 'Modelo', 'Capital', 'Capital'], 'categories are not personal data');
  assert.equal(rows[1].values.Monto, 2500);
  assert.equal(rows[1].values.Fecha.getTime(), Date.UTC(2024, 4, 4));

  assert.equal(pseudo.reveal(rows[0].values['Nombre completo']), 'PÉREZ SOTO JUAN CARLOS');
  assert.deepEqual(pseudo.revealDeep({ type: 'CONSTANT', value: name.split(' ')[2] }), { type: 'CONSTANT', value: 'FUENTE' });
});

test('fake words never collide with real words, and explanations keep their real words', () => {
  for (let run = 0; run < 3000; run += 1) {
    const pseudo = createPseudonymizer();
    const rows = pseudo.rows(['RUT', 'Nombre', 'AFP'], [
      { values: { RUT: '12.345.678-5', Nombre: 'ANA', AFP: 'Capital' } },
      { values: { RUT: '9.876.543-3', Nombre: 'EVA', AFP: 'Capital' } },
      { values: { RUT: '10.231.091-8', Nombre: 'ANA', AFP: 'Capital' } }
    ]);
    const fakes = rows.map((row) => row.values.Nombre);
    assert.ok(!fakes.includes('RUT') && !fakes.includes('AFP'), `fake «${fakes}» collides with a header`);
    assert.equal(pseudo.reveal('Listo: RUT sin puntos y códigos de AFP para ANA.'), 'Listo: RUT sin puntos y códigos de AFP para ANA.');
    assert.equal(pseudo.reveal(fakes[0]), 'ANA', 'an exact value is still restored');
  }
});

test('scores each destination column against the paired example rows', () => {
  const pairs = input.rows.map((row, index) => ({ input: row, output: output.rows[index] }));
  const evaluation = evaluateTemplate(currentTemplate, pairs, outputHeaders);
  const byName = Object.fromEntries(evaluation.columns.map((column) => [column.outputName, column]));
  assert.equal(byName.MONTO.rate, 1);
  assert.equal(byName.RUT.rate, 0, 'dots make it different');
  assert.equal(byName['CODIGO AFP'].mismatches[0].expected, '03');
  assert.equal(evaluation.overall, 0.25);
});

// A scripted model: returns the given turns in order and records what it was sent.
function fakeProvider(turns) {
  const sent = [];
  return {
    model: 'fake',
    sent,
    async generate(request) {
      sent.push(JSON.parse(JSON.stringify(request.contents)));
      const next = turns.shift();
      return { content: { role: 'model', parts: next }, usage: { promptTokens: 100, outputTokens: 20 } };
    }
  };
}

const call = (template, explanation) => ({ functionCall: { name: 'propose_template', args: { template_json: typeof template === 'string' ? template : JSON.stringify(template), explanation } } });

test('the agent validates, scores and returns the best proposal; real data never reaches the model', async () => {
  const good = {
    output: { format: 'XLSX', sheetName: 'DATOS' },
    columns: [
      { id: 'rut', outputName: 'RUT', source: { type: 'COLUMN', column: 'RUT' }, transformations: [{ type: 'RUT_FORMAT', format: 'NO_DOTS_DASH' }], validations: [{ type: 'VALID_RUT' }] },
      { id: 'paterno', outputName: 'PATERNO', source: { type: 'NAME_PART', column: 'Nombre completo', order: 'SURNAMES_FIRST', part: 'PATERNAL' } },
      { id: 'afp', outputName: 'CODIGO AFP', source: { type: 'MAP', input: { type: 'COLUMN', column: 'AFP' }, entries: [{ from: 'Capital', to: '03' }, { from: 'Modelo', to: '08' }], otherwise: { mode: 'KEEP' } } },
      { id: 'monto', outputName: 'MONTO', source: { type: 'COLUMN', column: 'Monto' } }
    ]
  };
  const partial = { ...good, columns: good.columns.map((column) => (column.id === 'afp' ? { ...column, source: { type: 'COLUMN', column: 'AFP' } } : column)) };
  const provider = fakeProvider([
    [call('{not json')],
    [call({ ...good, columns: [{ id: 'x', outputName: 'X', source: { type: 'MAGIC' } }] })],
    [call(partial, 'Formato de RUT y apellido paterno.')],
    [call(good, 'Tabla de equivalencias para la AFP.')],
    [{ text: 'Listo: RUT sin puntos, apellido paterno desde el nombre completo y códigos de AFP.' }]
  ]);

  const result = await runAssistant({ provider, template: currentTemplate, input, output, instruction: 'Capital es 03 y Modelo 08' });
  assert.equal(result.turns, 5);
  assert.equal(result.before.overall, 0.25);
  assert.equal(result.after.overall, 1);
  assert.deepEqual(result.proposal.columns.map((column) => column.source.type), ['COLUMN', 'NAME_PART', 'MAP', 'COLUMN']);
  assert.equal(result.explanation, 'Listo: RUT sin puntos, apellido paterno desde el nombre completo y códigos de AFP.');
  assert.deepEqual(result.usage, { promptTokens: 500, outputTokens: 100 });

  const replies = provider.sent.at(-1).flatMap((content) => content.parts).filter((part) => part.functionResponse).map((part) => part.functionResponse.response);
  assert.match(replies[0].errors[0], /not valid JSON/);
  assert.equal(replies[1].valid, false);
  assert.deepEqual(replies[2].toFix.map((column) => column.outputName), ['CODIGO AFP']);
  assert.equal(replies[3].overallMatch, '100%');

  const everything = JSON.stringify(provider.sent);
  for (const secret of ['12.345.678-5', '12345678-5', 'PÉREZ', 'FUENTE', 'JUAN', 'MARÍA']) assert.equal(everything.includes(secret), false, `${secret} must not be sent`);
  assert.ok(everything.includes('Capital') && everything.includes('2500'), 'categories and amounts are sent');
});

test('the service is disabled without a key, reads dates and records only metadata', async () => {
  await assert.rejects(createAssistantService({}).propose({}, { id: 'u' }), { status: 503, code: 'ASSISTANT_DISABLED' });
  const events = [];
  const provider = fakeProvider([[{ text: 'Sin cambios.' }]]);
  const service = createAssistantService({ provider, audit: { record: async (event) => events.push(event) } });
  assert.deepEqual(service.status(), { enabled: true, model: 'fake', maxRows: 15 });
  const rows = input.rows.map((row) => ({ ...row, values: { ...row.values, Fecha: { $date: row.values.Fecha.toISOString() } } }));
  const result = await service.propose({ template: { ...currentTemplate, name: '' }, input: { headers: inputHeaders, rows }, output, instruction: 'nada' }, { id: 'u1' });
  assert.equal(result.proposal, null);
  assert.equal(events[0].eventType, 'TEMPLATE_ASSISTANT_USED');
  assert.equal(JSON.stringify(events).includes('PÉREZ'), false);
  assert.deepEqual(Object.keys(events[0].metadata).sort(), ['durationMs', 'inputRows', 'model', 'outputRows', 'outputTokens', 'promptTokens', 'proposed', 'pseudonymized', 'turns']);
});

test('explains which Gemini quota ran out and how long to wait', () => {
  const { quotaMessage } = require('../apps/api/src/assistant/gemini');
  const quota = (quotaId, retryDelay) => ({ error: { details: [
    { '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaId, quotaValue: '20', quotaDimensions: { model: 'gemini-x' } }] },
    ...(retryDelay ? [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay }] : [])
  ] } });

  const minute = quotaMessage(quota('GenerateRequestsPerMinutePerProjectPerModel-FreeTier', '37.2s'), 'gemini-x');
  assert.equal(minute.waitSeconds, 38);
  assert.match(minute.message, /20 solicitudes por minuto/);
  assert.match(minute.message, /38 segundos/);

  const daily = quotaMessage(quota('GenerateRequestsPerDayPerProjectPerModel-FreeTier'), 'gemini-x', new Date('2026-09-29T15:00:00Z'));
  assert.match(daily.message, /cuota diaria de Gemini para gemini-x \(20 solicitudes por día\)/);
  assert.match(daily.message, /cerca de las 04:00\sa\.\sm\.\shora de Chile/);

  assert.match(quotaMessage({}, 'gemini-x').message, /Espera un minuto/);
});

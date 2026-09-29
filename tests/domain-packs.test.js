const test = require('node:test');
const assert = require('node:assert/strict');
const { registerPack, clearPacks, listPacks, isSensitiveColumn, maskSensitive } = require('../packages/template-engine/src/packs');
const { enabledPackIds, registerEnabledPacks } = require('../packages/packs');
const { validateTemplateConfig } = require('../packages/template-engine/src/schema');
const { transformRow } = require('../packages/template-engine/src/engine');
const { describeIssue, describeIssueHint } = require('../packages/template-engine/src/issues');
const { detectSemanticType } = require('../packages/detectors/src/semantic');
const { detectFormat } = require('../packages/template-engine/src/infer');
const { seedTemplates } = require('../packages/shared/templates');

const rutColumn = { id: 'rut', outputName: 'RUT', source: { type: 'COLUMN', column: 'RUT' }, transformations: [{ type: 'RUT_FORMAT', format: 'NO_DOTS_DASH' }], validations: [{ type: 'VALID_RUT' }] };

function withPacks(packs, run) {
  const previous = listPacks();
  clearPacks();
  packs.forEach(registerPack);
  try {
    return run();
  } finally {
    clearPacks();
    previous.forEach(registerPack);
  }
}

test('which packs are enabled comes from DOMAIN_PACKS', () => {
  assert.deepEqual(enabledPackIds(undefined), ['chile']);
  assert.deepEqual(enabledPackIds('none'), []);
  assert.deepEqual(enabledPackIds(' chile '), ['chile']);
  assert.throws(() => registerEnabledPacks('peru'), /Unknown domain pack: peru/);
});

test('with the Chile pack, RUT formats, validations, detectors, masking and seeds are available', () => {
  const template = validateTemplateConfig({ name: 'T', columns: [rutColumn] });
  assert.deepEqual(transformRow({ RUT: '12.345.678-5' }, template).output, { RUT: '12345678-5' });
  const invalid = transformRow({ RUT: '12.345.678-9' }, template).issues[0];
  assert.equal(describeIssue(invalid), 'RUT con dígito verificador inválido');
  assert.match(describeIssueHint(invalid), /dígito verificador/);
  assert.equal(detectSemanticType('RUT', ['12.345.678-5', '9.876.543-3']).type, 'CHILEAN_RUT');
  assert.equal(isSensitiveColumn(rutColumn), true);
  assert.equal(maskSensitive(rutColumn, '12.345.678-5'), '12.•••.•••-5');
  assert.deepEqual(seedTemplates().map((seed) => seed.slug), ['planvital-pagex']);
});

test('the core alone knows nothing about RUT', () => {
  withPacks([], () => {
    assert.throws(() => validateTemplateConfig({ name: 'T', columns: [rutColumn] }), /transformación no es válida/);
    assert.throws(() => validateTemplateConfig({ name: 'T', columns: [{ ...rutColumn, transformations: [] }] }), /validación no es válida/);
    assert.notEqual(detectSemanticType('RUT', ['12.345.678-5', '9.876.543-3']).type, 'CHILEAN_RUT');
    assert.equal(detectFormat(['12.345.678-5', '9.876.543-3']).pack, null);
    assert.equal(isSensitiveColumn(rutColumn), false);
    assert.deepEqual(seedTemplates(), []);
    assert.equal(describeIssue({ code: 'INVALID_RUT', message: 'Invalid Chilean RUT' }), 'Invalid Chilean RUT');
  });
});

test('a new pack plugs in formats and validations without touching the core', () => {
  const emailPack = {
    id: 'email',
    transformations: {
      EMAIL_DOMAIN: {
        normalize: (transformation) => ({ type: 'EMAIL_DOMAIN' }),
        apply: (value) => (String(value || '').includes('@') ? String(value).split('@')[1].toLowerCase() : null),
        conversionIssue: { code: 'INVALID_EMAIL', message: 'Not an email' }
      }
    },
    validations: { CORPORATE_EMAIL: { validate: (value) => (value === 'gmail.com' ? { severity: 'error', code: 'NOT_CORPORATE', message: 'Personal email' } : null) } },
    issues: { messages: { INVALID_EMAIL: 'No es un correo', NOT_CORPORATE: 'Debe ser un correo de empresa' } }
  };
  withPacks([emailPack], () => {
    const template = validateTemplateConfig({
      name: 'Correos',
      columns: [{ id: 'd', outputName: 'DOMINIO', source: { type: 'COLUMN', column: 'Correo' }, transformations: [{ type: 'EMAIL_DOMAIN' }], validations: [{ type: 'CORPORATE_EMAIL' }] }]
    });
    assert.equal(transformRow({ Correo: 'Ana@Empresa.CL' }, template).output.DOMINIO, 'empresa.cl');
    assert.deepEqual(transformRow({ Correo: 'ana' }, template).issues.map(describeIssue), ['No es un correo']);
    assert.deepEqual(transformRow({ Correo: 'x@gmail.com' }, template).issues.map(describeIssue), ['Debe ser un correo de empresa']);
  });
});

const test = require('node:test');
const assert = require('node:assert/strict');
const { planVitalPagexTemplate } = require('../packages/shared/templates');
const { validateTemplateConfig, TemplateValidationError } = require('../packages/template-engine/src/schema');

function column(overrides = {}) {
  return { id: 'c1', outputName: 'RUT', required: true, source: { type: 'COLUMN', column: 'RUT' }, transformations: [], validations: [], ...overrides };
}

function config(overrides = {}) {
  return { name: 'Prueba', output: { format: 'XLSX', sheetName: 'DATOS' }, columns: [column()], ...overrides };
}

test('normalizes the legacy PlanVital seed into the current schema', () => {
  const result = validateTemplateConfig(planVitalPagexTemplate);
  assert.equal(result.output.format, 'XLSX');
  assert.equal(result.columns.length, 17);
  assert.deepEqual(result.columns.map((c) => c.position), Array.from({ length: 17 }, (_, i) => i + 1));
  assert.deepEqual(result.columns[0].aliases, []);
});

test('fills output defaults per format and strips unknown properties', () => {
  const result = validateTemplateConfig(config({
    output: { format: 'DELIMITED', delimiter: '|', evil: 'x' },
    columns: [column({ extra: 'x', source: { type: 'COLUMN', column: 'RUT', code: 'process.exit()' } })]
  }));
  assert.deepEqual(result.output, { format: 'DELIMITED', delimiter: '|', extension: 'csv', includeHeaders: true, encoding: 'UTF-8', lineEnding: 'CRLF' });
  assert.deepEqual(result.columns[0].source, { type: 'COLUMN', column: 'RUT' });
  assert.equal('extra' in result.columns[0], false);
});

test('accepts every supported source and transformation', () => {
  const result = validateTemplateConfig(config({
    output: { format: 'FIXED_WIDTH' },
    columns: [
      column({ id: 'a', outputName: 'A', source: { type: 'CONSTANT', value: '01' }, fixedWidth: { length: 2, align: 'RIGHT', padChar: '0' } }),
      column({ id: 'b', outputName: 'B', source: { type: 'CONCAT', separator: ' ', parts: [{ type: 'COLUMN', column: 'X' }, { type: 'CONSTANT', value: 'Y' }] }, fixedWidth: { length: 10 } }),
      column({
        id: 'c',
        outputName: 'C',
        source: { type: 'SPLIT_WORD_RANGE', column: 'N', start: 2 },
        transformations: [
          { type: 'TEXT', operation: 'REMOVE_ACCENTS' },
          { type: 'DATE_FORMAT', inputFormat: 'AUTO', outputFormat: 'YYYYMMDD' },
          { type: 'NUMBER', fixedDecimals: 2, decimalSeparator: ',' },
          { type: 'RUT_FORMAT', format: 'DV' }
        ],
        validations: [{ type: 'VALID_RUT' }],
        fixedWidth: { length: 5 }
      })
    ]
  }));
  assert.deepEqual(result.columns[1].fixedWidth, { length: 10, align: 'LEFT', padChar: ' ' });
  assert.equal(result.output.includeHeaders, false);
});

test('rejects unsafe or inconsistent templates with readable errors', () => {
  const cases = [
    [config({ name: '' }), /nombre/],
    [config({ columns: [] }), /al menos una columna/],
    [config({ columns: [column(), column({ id: 'c2' })] }), /repetido/],
    [config({ columns: [column(), column({ outputName: 'OTRA' })] }), /identificador/],
    [config({ columns: [column({ source: { type: 'SCRIPT', code: 'x' } })] }), /origen/],
    [config({ columns: [column({ transformations: [{ type: 'EVAL', code: '1' }] })] }), /transformación/],
    [config({ columns: [column({ transformations: [{ type: 'DATE_FORMAT', outputFormat: 'dd.mm' }] })] }), /fecha/],
    [config({ output: { format: 'PDF' } }), /formato de salida/],
    [config({ output: { format: 'FIXED_WIDTH' } }), /largo/],
    [config({ columns: Array.from({ length: 201 }, (_, i) => column({ id: `c${i}`, outputName: `C${i}` })) }), /200/]
  ];
  for (const [input, message] of cases) {
    assert.throws(() => validateTemplateConfig(input), (error) => error instanceof TemplateValidationError && message.test(error.message), String(message));
  }
});

test('column order in the array defines positions, ignoring stale position values', () => {
  const result = validateTemplateConfig(config({
    columns: [
      column({ id: 'a', outputName: 'A', position: 5 }),
      column({ id: 'b', outputName: 'B' }),
      column({ id: 'c', outputName: 'C', position: 1 })
    ]
  }));
  assert.deepEqual(result.columns.map((c) => `${c.position}${c.outputName}`), ['1A', '2B', '3C']);
});

const planVitalPagexTemplate = {
  name: 'PlanVital - PAGEX',
  input: {
    sheet: 'RESUMEN',
    headerRow: 1
  },
  output: {
    format: 'xlsx',
    sheetName: 'DATOS'
  },
  columns: [
    {
      id: 'rut',
      position: 1,
      outputName: 'RUT',
      source: { type: 'COLUMN', column: 'RUT' },
      semanticType: 'CHILEAN_RUT',
      required: true,
      transformations: [{ type: 'RUT_FORMAT', format: 'NO_DOTS_NO_DASH' }],
      validations: [{ type: 'VALID_RUT' }]
    },
    {
      id: 'apellido_paterno',
      position: 2,
      outputName: 'APELLIDO PATERNO',
      source: { type: 'SPLIT_WORD', column: 'Nombre completo', index: 0 },
      required: true,
      transformations: [
        { type: 'TEXT', operation: 'NORMALIZE_SPACES' },
        { type: 'TEXT', operation: 'UPPERCASE' }
      ]
    },
    {
      id: 'apellido_materno',
      position: 3,
      outputName: 'APELLIDO MATERNO',
      source: { type: 'SPLIT_WORD', column: 'Nombre completo', index: 1 },
      required: true,
      transformations: [
        { type: 'TEXT', operation: 'NORMALIZE_SPACES' },
        { type: 'TEXT', operation: 'UPPERCASE' }
      ]
    },
    {
      id: 'nombre',
      position: 4,
      outputName: 'NOMBRE',
      source: { type: 'SPLIT_WORD_RANGE', column: 'Nombre completo', start: 2 },
      required: true,
      transformations: [
        { type: 'TEXT', operation: 'NORMALIZE_SPACES' },
        { type: 'TEXT', operation: 'UPPERCASE' }
      ]
    },
    {
      id: 'numero_licencia',
      position: 5,
      outputName: 'N.º LICENCIA',
      source: { type: 'EMPTY' },
      required: false,
      transformations: []
    },
    {
      id: 'periodo',
      position: 6,
      outputName: 'PERIODO',
      source: { type: 'COLUMN', column: 'Periodo' },
      required: true,
      transformations: [{ type: 'DATE_FORMAT', inputFormat: 'YYYYMM', outputFormat: 'DD/MM/YYYY' }]
    },
    {
      id: 'fecha_inicio',
      position: 7,
      outputName: 'FEC. INICIO',
      source: { type: 'COLUMN', column: 'Fecha Inicio' },
      required: true,
      transformations: [{ type: 'DATE_FORMAT', inputFormat: 'DD-MM-YYYY', outputFormat: 'DD/MM/YYYY' }]
    },
    {
      id: 'fecha_fin',
      position: 8,
      outputName: 'FEC. FIN',
      source: { type: 'COLUMN', column: 'Fecha Término' },
      required: true,
      transformations: [{ type: 'DATE_FORMAT', inputFormat: 'DD-MM-YYYY', outputFormat: 'DD/MM/YYYY' }]
    },
    {
      id: 'dias_licencia',
      position: 9,
      outputName: 'DIAS LICENCIA',
      source: { type: 'COLUMN', column: 'dias_licencia' },
      required: true,
      transformations: [{ type: 'NUMBER', integer: true }],
      validations: [{ type: 'INTEGER' }]
    },
    {
      id: 'imponible',
      position: 10,
      outputName: 'IMPONIBLE',
      source: { type: 'COLUMN', column: 'Remuneracion' },
      required: true,
      transformations: [{ type: 'NUMBER', integer: true }],
      validations: [{ type: 'INTEGER' }]
    },
    {
      id: 'imponible_dias_licencia',
      position: 11,
      outputName: 'IMPONIBLE DIAS LICENCIA',
      source: { type: 'COLUMN', column: 'base_utilizada' },
      required: true,
      transformations: [{ type: 'NUMBER', integer: true }],
      validations: [{ type: 'INTEGER' }]
    },
    {
      id: 'imponible_liquidacion',
      position: 12,
      outputName: 'IMPONIBLE LIQUIDACION DE SUELDO',
      source: { type: 'COLUMN', column: 'monto_rem_dias' },
      required: true,
      transformations: [{ type: 'NUMBER', integer: true }],
      validations: [{ type: 'INTEGER' }]
    },
    {
      id: 'diez_por_ciento',
      position: 13,
      outputName: '10%',
      source: { type: 'COLUMN', column: 'aporte_pension' },
      required: true,
      transformations: [{ type: 'NUMBER', integer: true }],
      validations: [{ type: 'INTEGER' }]
    },
    {
      id: 'total',
      position: 14,
      outputName: 'TOTAL',
      source: { type: 'COLUMN', column: 'total_aporte_afp' },
      required: true,
      transformations: [{ type: 'NUMBER', integer: true }],
      validations: [{ type: 'INTEGER' }]
    },
    {
      id: 'afp_origen',
      position: 15,
      outputName: 'AFP ORIGEN',
      source: { type: 'COLUMN', column: 'AFP' },
      required: true,
      transformations: [{ type: 'TEXT', operation: 'NORMALIZE_SPACES' }]
    },
    {
      id: 'afp_actual',
      position: 16,
      outputName: 'AFP ACTUAL',
      source: { type: 'COLUMN', column: 'AFP' },
      required: true,
      transformations: [{ type: 'TEXT', operation: 'NORMALIZE_SPACES' }]
    },
    {
      id: 'dias_trabajados',
      position: 17,
      outputName: 'DIAS TRABAJADOS',
      source: { type: 'COLUMN', column: 'dias_pagados' },
      required: true,
      transformations: [{ type: 'NUMBER', integer: true }],
      validations: [{ type: 'INTEGER' }]
    }
  ]
};

module.exports = { planVitalPagexTemplate };

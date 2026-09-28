export const job = {
  id: 'job_pagex_042',
  fileName: 'EjemploPagex.xlsx',
  fileSize: '18 KB',
  expiresAt: 'Hoy, 17:20',
  status: 'READY',
  sheet: 'RESUMEN',
  processedRows: 3,
  totalRows: 3,
  progress: 100
};

export const sheets = [
  { name: 'RESUMEN', range: 'A1:AG4', rows: 3, columns: 33, status: 'selected' },
  { name: 'DETALLE_CADENAS', range: 'A1:AB40', rows: 39, columns: 28, status: 'available' }
];

export const columns = [
  { header: 'RUT', physical: 'STRING', semantic: 'CHILEAN_RUT', confidence: '0.99', evidence: '2/2 DV validos' },
  { header: 'Nombre completo', physical: 'STRING', semantic: 'PERSON_NAME', confidence: '0.76', evidence: 'header + patron texto' },
  { header: 'Remuneracion', physical: 'INTEGER', semantic: 'CURRENCY', confidence: '0.92', evidence: '3/3 numericos' },
  { header: 'Periodo', physical: 'INTEGER', semantic: 'YEAR_MONTH', confidence: '0.99', evidence: '3/3 YYYYMM' },
  { header: 'Fecha Inicio', physical: 'DATE', semantic: 'DATE', confidence: '0.94', evidence: '3/3 DD-MM-YYYY' },
  { header: 'Fecha Termino', physical: 'DATE', semantic: 'DATE', confidence: '0.94', evidence: '3/3 DD-MM-YYYY' },
  { header: 'AFP', physical: 'STRING', semantic: 'AFP', confidence: '0.98', evidence: 'valor conocido' },
  { header: 'dias_licencia', physical: 'INTEGER', semantic: 'GENERIC_NUMBER', confidence: '0.90', evidence: '3/3 enteros' }
];

export const mappings = [
  { output: 'RUT', source: 'RUT', type: 'CHILEAN_RUT', required: true, state: 'OK' },
  { output: 'APELLIDO PATERNO', source: 'Nombre completo [palabra 1]', type: 'SURNAME', required: true, state: 'CONFIRMAR' },
  { output: 'APELLIDO MATERNO', source: 'Nombre completo [palabra 2]', type: 'SURNAME', required: true, state: 'CONFIRMAR' },
  { output: 'NOMBRE', source: 'Nombre completo [desde palabra 3]', type: 'PERSON_NAME', required: true, state: 'CONFIRMAR' },
  { output: 'N.º LICENCIA', source: 'Vacio', type: 'LICENSE_NUMBER', required: false, state: 'FALTANTE' },
  { output: 'PERIODO', source: 'Periodo', type: 'DATE', required: true, state: 'OK' },
  { output: 'FEC. INICIO', source: 'Fecha Inicio', type: 'DATE', required: true, state: 'OK' },
  { output: 'TOTAL', source: 'total_aporte_afp', type: 'GENERIC_NUMBER', required: true, state: 'OK' }
];

export const previewRows = [
  { input: '10.231.091-8', output: '102310918', column: 'RUT', rule: 'RUT sin puntos ni guion' },
  { input: '201510', output: '01/10/2015', column: 'PERIODO', rule: 'YYYYMM a DD/MM/YYYY' },
  { input: 'NEIRA QUINCHAHUAL MARIA', output: 'NEIRA | QUINCHAHUAL | MARIA', column: 'NOMBRE', rule: 'Split configurable' }
];

export const validation = {
  mode: 'STRICT',
  rows: 3,
  valid: 3,
  warnings: 2,
  errors: 0,
  items: [
    { severity: 'warning', row: '-', column: 'N.º LICENCIA', code: 'MISSING_SOURCE', message: 'Sin columna origen directa' },
    { severity: 'warning', row: '-', column: 'NOMBRE', code: 'REVIEW_SPLIT', message: 'Separacion requiere revision' }
  ]
};

import { calculateDv } from '@previley-transformer/transformations/src/rut.js';

// Fictional workbook standing in for the analysis worker. Headers follow the PAGEX file in docs/SDD.md;
// every person and RUT here is invented. Rows live only in this module and are never persisted.

function rut(body, dv = calculateDv(body)) {
  return `${body.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}-${dv}`;
}

const resumenHeaders = [
  'RUT',
  'Nombre completo',
  'Remuneracion',
  'Cod.',
  'Periodo',
  'Fecha Inicio',
  'Fecha Termino',
  'AFP',
  'dias_licencia',
  'dias_pagados',
  'base_utilizada',
  'monto_rem_dias',
  'aporte_pension',
  'comision_afp',
  'total_aporte_afp'
];

function resumenRow([rutValue, name, salary, period, start, end, licenseDays, paidDays]) {
  const perDay = Math.round(salary / 30);
  const amount = perDay * paidDays;
  const pension = Math.round(amount * 0.1);
  return {
    RUT: rutValue,
    'Nombre completo': name,
    Remuneracion: String(salary),
    'Cod.': '1',
    Periodo: period,
    'Fecha Inicio': start,
    'Fecha Termino': end,
    AFP: 'PlanVital',
    dias_licencia: String(licenseDays),
    dias_pagados: String(paidDays),
    base_utilizada: String(salary),
    monto_rem_dias: String(amount),
    aporte_pension: String(pension),
    comision_afp: String(Math.round(amount * 0.0116)),
    total_aporte_afp: String(pension)
  };
}

const resumenRows = [
  [rut('12345678'), 'SOTO PEREZ JUAN CARLOS', 850000, '202405', '03-05-2024', '09-05-2024', 7, 23],
  [rut('15678901'), 'MUÑOZ ROJAS ANA MARIA', 1120000, '202405', '13-05-2024', '26-05-2024', 14, 16],
  [rut('9876543'), 'GONZALEZ DIAZ PEDRO', 640000, '202405', '20-05-2024', '24-05-2024', 5, 25],
  [rut('17654321', '0'), 'FUENTES VERA CAMILA', 980000, '202405', '06-05-2024', '15-05-2024', 10, 20],
  [rut('20111222'), 'DE LA FUENTE TORO LUIS', 720000, '202405', '01-05-2024', '30-05-2024', 30, 0],
  [rut('13579246'), 'ARAYA  SILVA  JOSEFA', 1350000, '202405', '27-05-2024', '31-05-2024', 5, 25]
].map(resumenRow);

const detalleHeaders = ['RUT', 'Periodo', 'Cod.', 'dias_pagados', 'monto_rem_dias', 'comision_afp'];

const detalleRows = resumenRows.map((row) => Object.fromEntries(detalleHeaders.map((header) => [header, row[header]])));

function columnLetter(count) {
  let letters = '';
  for (let n = count; n > 0; n = Math.floor((n - 1) / 26)) {
    letters = String.fromCharCode(65 + ((n - 1) % 26)) + letters;
  }
  return letters;
}

function describeSheet(name, headers, rows) {
  return {
    name,
    range: `A1:${columnLetter(headers.length)}${rows.length + 1}`,
    rowCount: rows.length,
    columnCount: headers.length,
    headers
  };
}

const sheets = {
  RESUMEN: { headers: resumenHeaders, rows: resumenRows },
  DETALLE_CADENAS: { headers: detalleHeaders, rows: detalleRows }
};

export function analyzeSampleWorkbook() {
  return Object.entries(sheets).map(([name, sheet]) => describeSheet(name, sheet.headers, sheet.rows));
}

export function getSampleRows(sheetName) {
  return sheets[sheetName]?.rows || [];
}

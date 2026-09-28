// User-facing descriptions of validation issue codes, shared by the worker (rejects file) and the web.
const ISSUE_MESSAGES = {
  REQUIRED: 'Falta un valor obligatorio',
  INVALID_RUT: 'RUT con dígito verificador inválido',
  INVALID_INTEGER: 'Debe ser un número entero',
  TOO_LONG: 'Supera el largo de la columna',
  INVALID_DATE: 'No se reconoce como fecha',
  INVALID_NUMBER: 'No se reconoce como número',
  INVALID_RUT_FORMAT: 'No se reconoce como RUT',
  DIVISION_BY_ZERO: 'División por cero'
};

// What a valid value looks like, so users know how to fix the cell.
const ISSUE_HINTS = {
  REQUIRED: 'Esta celda no puede venir vacía.',
  INVALID_RUT: 'Revisa el dígito verificador (lo que va después del guion).',
  INVALID_INTEGER: 'Escribe solo números, sin letras ni símbolos.',
  TOO_LONG: 'Acorta el valor o pide que se amplíe el largo de la columna en la plantilla.',
  INVALID_DATE: 'Usa una fecha real, por ejemplo 03-05-2024 o 2024-05-03.',
  INVALID_NUMBER: 'Usa un número como 1.234.567 o 1234,50, sin letras.',
  INVALID_RUT_FORMAT: 'Usa un RUT como 12.345.678-5 o 12345678-5.',
  DIVISION_BY_ZERO: 'El divisor de este cálculo vale 0 en esta fila; revisa el valor o usa una condición para esos casos.'
};

function describeIssue(issue) {
  return ISSUE_MESSAGES[issue.code] || issue.message || issue.code;
}

function describeIssueHint(issue) {
  return ISSUE_HINTS[issue.code] || '';
}

module.exports = { ISSUE_MESSAGES, ISSUE_HINTS, describeIssue, describeIssueHint };

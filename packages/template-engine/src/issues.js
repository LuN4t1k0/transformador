const { packIssueText } = require('./packs');

// User-facing descriptions of validation issue codes, shared by the worker (rejects file) and the web.
const ISSUE_MESSAGES = {
  REQUIRED: 'Falta un valor obligatorio',
  INVALID_INTEGER: 'Debe ser un número entero',
  TOO_LONG: 'Supera el largo de la columna',
  INVALID_DATE: 'No se reconoce como fecha',
  INVALID_NUMBER: 'No se reconoce como número',
  DIVISION_BY_ZERO: 'División por cero'
};

// What a valid value looks like, so users know how to fix the cell. Domain packs add their own codes.
const ISSUE_HINTS = {
  REQUIRED: 'Esta celda no puede venir vacía.',
  INVALID_INTEGER: 'Escribe solo números, sin letras ni símbolos.',
  TOO_LONG: 'Acorta el valor o pide que se amplíe el largo de la columna en la plantilla.',
  INVALID_DATE: 'Usa una fecha real, por ejemplo 03-05-2024 o 2024-05-03.',
  INVALID_NUMBER: 'Usa un número como 1.234.567 o 1234,50, sin letras.',
  DIVISION_BY_ZERO: 'El divisor de este cálculo vale 0 en esta fila; revisa el valor o usa una condición para esos casos.'
};

function describeIssue(issue) {
  return ISSUE_MESSAGES[issue.code] || packIssueText('messages', issue.code) || issue.message || issue.code;
}

function describeIssueHint(issue) {
  return ISSUE_HINTS[issue.code] || packIssueText('hints', issue.code) || '';
}

module.exports = { ISSUE_MESSAGES, ISSUE_HINTS, describeIssue, describeIssueHint };

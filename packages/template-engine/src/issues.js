// User-facing descriptions of validation issue codes, shared by the worker (rejects file) and the web.
const ISSUE_MESSAGES = {
  REQUIRED: 'Falta un valor obligatorio',
  INVALID_RUT: 'RUT con dígito verificador inválido',
  INVALID_INTEGER: 'Debe ser un número entero',
  TOO_LONG: 'Supera el largo de la columna',
  INVALID_DATE: 'No se reconoce como fecha',
  INVALID_NUMBER: 'No se reconoce como número',
  INVALID_RUT_FORMAT: 'No se reconoce como RUT'
};

function describeIssue(issue) {
  return ISSUE_MESSAGES[issue.code] || issue.message || issue.code;
}

module.exports = { ISSUE_MESSAGES, describeIssue };

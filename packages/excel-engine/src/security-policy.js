const dangerousExtensions = new Set(['.xlsm', '.xltm']);

function inspectWorkbookMetadata(metadata, limits) {
  const issues = [];

  if (metadata.extension && dangerousExtensions.has(metadata.extension.toLowerCase())) {
    issues.push({ severity: 'error', code: 'MACRO_ENABLED_FILE', message: 'Macro-enabled workbooks are not accepted' });
  }

  if (metadata.fileSizeBytes > limits.maxFileSizeBytes) {
    issues.push({ severity: 'error', code: 'FILE_TOO_LARGE', message: 'File exceeds configured size limit' });
  }

  if (metadata.sheetCount > limits.maxSheets) {
    issues.push({ severity: 'error', code: 'TOO_MANY_SHEETS', message: 'Workbook exceeds configured sheet limit' });
  }

  return issues;
}

module.exports = { inspectWorkbookMetadata };

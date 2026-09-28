const { inspectWorkbookMetadata } = require('./security-policy');
const workbook = require('./workbook');

module.exports = { inspectWorkbookMetadata, ...workbook };

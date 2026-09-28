const { detectPhysicalType } = require('./physical');
const { detectSemanticType } = require('./semantic');

function analyzeColumn(header, values) {
  return {
    header,
    physical: detectPhysicalType(values),
    semantic: detectSemanticType(header, values)
  };
}

module.exports = { analyzeColumn, detectPhysicalType, detectSemanticType };

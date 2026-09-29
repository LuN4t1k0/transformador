const { packFormats, packValidationTypes } = require('../packs');
const { DATE_OUTPUT_FORMATS } = require('../../../transformations/src/date');

// What the assistant may write: the template JSON format, limited to the operations the schema accepts.
function templateSpec() {
  const packTransformations = packFormats()
    .map((format) => `- {"type":"${format.transformation}","${format.option.key}": one of ${format.option.choices.map((choice) => `"${choice.value}" (${choice.label})`).join(', ')}}`)
    .join('\n');
  const validations = ['INTEGER', ...packValidationTypes()].map((type) => `"${type}"`).join(', ');

  return `TEMPLATE JSON FORMAT (anything else is rejected by the validator)
{
  "name": string,
  "output": { "format": "XLSX", "sheetName": "DATOS" } | { "format": "DELIMITED", "delimiter": ";"|","|"|"|"\\t", "extension": "csv"|"txt", "includeHeaders": bool } | { "format": "FIXED_WIDTH", ... },
  "columns": [ COLUMN, ... ],          // output columns, in file order
  "rowSteps": ROW_STEPS                // optional
}

COLUMN = { "id": unique short id, "outputName": header in the output file, "required": bool, "source": SOURCE, "transformations": [TRANSFORMATION...], "validations": [{"type": ${validations}}] }
Keep the id of an existing column when you change it. A column may only reference columns that come BEFORE it.

OPERAND (a value used by a function):
  {"type":"COLUMN","column": input header} | {"type":"OUTPUT","columnId": id of an earlier column} | {"type":"NUMBER","value": n} | {"type":"TEXT","value": "..."} | {"type":"EMPTY"}

SOURCE (where the column value comes from):
- {"type":"COLUMN","column": input header}
- {"type":"CONSTANT","value": "text"}
- {"type":"EMPTY"}
- {"type":"NAME_PART","column": input header with a full name,"order":"SURNAMES_FIRST"|"NAMES_FIRST","part":"PATERNAL"|"MATERNAL"|"SURNAMES"|"NAMES"|"FIRST_NAME"}  (Spanish names: two surnames, compound surnames handled)
- {"type":"SPLIT_WORD","column": header,"index": 0-based word,"delimiter": optional} | {"type":"SPLIT_WORD_RANGE","column": header,"start": n,"end": optional}
- {"type":"CONCAT","separator": " ","parts":[{"type":"COLUMN","column": h} | {"type":"CONSTANT","value":"x"}]}
- {"type":"TEMPLATE","text":"{Input header} literal {@Earlier output column name}"}
- {"type":"CALC","op":"SUM"|"SUBTRACT"|"MULTIPLY"|"DIVIDE"|"AVERAGE"|"MIN"|"MAX","operands":[OPERAND, OPERAND...],"round":{"mode":"ROUND"|"FLOOR"|"CEIL"|"NONE","decimals": n}}
  {"type":"CALC","op":"PERCENT","value": percent number,"operands":[OPERAND]} | {"type":"CALC","op":"ABS","operands":[OPERAND]}
- {"type":"CASE","cases":[{"match":"ALL"|"ANY","conditions":[{"left":OPERAND,"op":"EQ"|"NEQ"|"GT"|"GTE"|"LT"|"LTE"|"CONTAINS"|"STARTS_WITH"|"ENDS_WITH"|"IN"|"EMPTY"|"NOT_EMPTY","right":OPERAND}],"result":OPERAND}],"otherwise":OPERAND}
  (IN compares with a TEXT of comma separated values; text comparisons ignore case and accents)
- {"type":"MAP","input":OPERAND,"entries":[{"from":"a","to":"b"}],"otherwise":{"mode":"KEEP"|"EMPTY"} | {"mode":"TEXT","value":"x"}}
- {"type":"COALESCE","operands":[OPERAND, OPERAND, ...]}   first non-empty
- {"type":"DATE_CALC","op":"DAYS_BETWEEN"|"ADD_DAYS"|"ADD_MONTHS"|"YEAR"|"MONTH"|"DAY"|"START_OF_MONTH"|"END_OF_MONTH"|"TODAY","operands":[OPERAND...],"inclusive": bool}
- {"type":"ROW_NUMBER","start": 1}

TRANSFORMATION (applied in order to the source value):
- {"type":"TEXT","operation":"UPPERCASE"|"LOWERCASE"|"TITLE_CASE"|"TRIM"|"NORMALIZE_SPACES"|"REMOVE_ACCENTS"|"DIGITS_ONLY"}
- {"type":"DATE_FORMAT","inputFormat":"AUTO","outputFormat": one of ${DATE_OUTPUT_FORMATS.map((format) => `"${format}"`).join(', ')}}
- {"type":"NUMBER","integer": true} | {"type":"NUMBER","fixedDecimals": n,"decimalSeparator":"."|","}
- {"type":"REPLACE","find":"x","replace":"y"} | {"type":"PAD","length": n,"char":"0","side":"LEFT"|"RIGHT"} | {"type":"SUBSTRING","start": 1-based,"length": n}
${packTransformations}

ROW_STEPS (optional, whole rows): {"fillDown":[input headers],"filter":{"mode":"KEEP"|"EXCLUDE","match":"ALL"|"ANY","conditions":[...]},"dedupe":{"columnIds":[ids],"keep":"FIRST"|"LAST"},"group":{"columnIds":[ids],"aggregates":[{"columnId": id,"op":"SUM"|"COUNT"|"AVERAGE"|"MIN"|"MAX"|"FIRST"|"LAST"|"CONCAT"}]},"sort":[{"columnId": id,"direction":"ASC"|"DESC"}]}`;
}

module.exports = { templateSpec };

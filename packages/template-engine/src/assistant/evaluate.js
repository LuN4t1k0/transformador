const { transformRow } = require('../engine');
const { comparable } = require('../infer');
const { normalizeHeader } = require('../mapping');

// How well a template reproduces the destination example: for each destination column, the share of paired
// rows whose value matches (same loose comparison as learning by example) and a few mismatches to explain why.
function evaluateTemplate(template, pairs, outputHeaders, { maxMismatches = 3 } = {}) {
  const byName = new Map(template.columns.map((column) => [normalizeHeader(column.outputName), column]));
  const outputs = pairs.map((pair) => {
    try {
      return transformRow(pair.input.values, template).output;
    } catch {
      return {};
    }
  });

  const columns = outputHeaders.map((header) => {
    const column = byName.get(normalizeHeader(header));
    if (!column) return { outputName: header, status: 'MISSING', compared: 0, matches: 0, rate: 0, mismatches: [] };
    let compared = 0;
    let matches = 0;
    const mismatches = [];
    pairs.forEach((pair, index) => {
      const expected = pair.output.values[header];
      const target = comparable(expected);
      if (!target) return;
      compared += 1;
      const got = outputs[index][column.outputName];
      if (comparable(got) === target) matches += 1;
      else if (mismatches.length < maxMismatches) mismatches.push({ row: index + 1, expected, got: got ?? null });
    });
    return { outputName: header, status: compared ? 'COMPARED' : 'NO_DATA', compared, matches, rate: compared ? matches / compared : 0, mismatches };
  });

  const scored = columns.filter((column) => column.status !== 'NO_DATA');
  const overall = scored.length ? scored.reduce((sum, column) => sum + column.rate, 0) / scored.length : 0;
  return { columns, overall };
}

module.exports = { evaluateTemplate };

const { validateTemplateConfig, TemplateValidationError } = require('../../../../packages/template-engine/src/schema');
const { alignRows } = require('../../../../packages/template-engine/src/infer');
const { createPseudonymizer } = require('../../../../packages/template-engine/src/assistant/pseudonymize');
const { evaluateTemplate } = require('../../../../packages/template-engine/src/assistant/evaluate');
const { templateSpec } = require('../../../../packages/template-engine/src/assistant/spec');

// The template assistant: an AI model proposes a template with a single tool, `propose_template`. Each proposal
// is validated by the schema and scored against the destination example, and that feedback goes back to the
// model so it can correct itself. Only pseudonymized rows are sent; the best valid proposal is returned for the
// user to review. The model never runs conversions.

const MAX_ROWS = 15;
const MAX_TURNS = 6;

const TOOLS = [
  {
    name: 'propose_template',
    description: 'Proposes a complete template. Returns validation errors, or how many destination example rows each column reproduces, with some mismatches.',
    parameters: {
      type: 'object',
      properties: {
        template_json: { type: 'string', description: 'The complete template as a JSON string, following the TEMPLATE JSON FORMAT.' },
        explanation: { type: 'string', description: 'In Spanish, one or two sentences about what changed in this proposal.' }
      },
      required: ['template_json']
    }
  }
];

function systemPrompt() {
  return `You build data transformation templates for a spreadsheet conversion tool used by non-technical people.
The user gives an input spreadsheet sample, usually a destination example (what the file must look like), the current template and optional instructions.

How to work:
- Call propose_template with a complete template. The reply tells you validation errors or, per destination column, how many example rows match and some mismatches (expected vs got). Fix and call again.
- Start from the current template: keep columns that already match, fix the rest, follow the user's instructions.
- When there are no row pairs (the reply says columns can only be validated), you cannot verify values: keep the current transformations and formats (dates, numbers, text case) unless the user asks otherwise, and only fill columns whose source is empty or clearly wrong.
- In your final answer mention only what you actually changed.
- With a destination example, the output columns must be exactly its headers, in the same order.
- Example values are pseudonymized (names and identifiers replaced by invented ones, used consistently). Treat them as real values; never try to guess the originals.
- Prefer simple sources (a column) over complex ones; use rules only when the example needs them.
- Percentages: Excel stores 0,69% as the number 0.0069 and only displays it with a percent format. The data lists the columns shown as percentages. When a destination column is shown as a percentage and the output is Excel, keep the number and set "cellFormat": "PERCENT" on that column (never convert it to text, never multiply by 100). For text outputs (DELIMITED, FIXED_WIDTH) use {"type":"NUMBER","percent":true,...} to write "0,69%".
- When every column matches, or you cannot improve anymore, stop calling the tool and answer in Spanish, for a non-technical user, in under 120 words and in plain text (no Markdown): what you changed and what they should double-check.

${templateSpec()}`;
}

function display(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value ?? null;
}

function sampleRows(rows, pseudo, headers) {
  return pseudo.rows(headers, rows).map((row) => Object.fromEntries(headers.map((header) => [header, display(row.values[header])])));
}

// The evaluation as the model sees it: pseudonymized mismatches, columns grouped by result.
function feedback(evaluation, pseudo) {
  if (!evaluation) return { note: 'No destination example: the template was only validated.' };
  const hide = (value) => (typeof value === 'string' ? pseudo.text(value) : display(value));
  return {
    overallMatch: `${Math.round(evaluation.overall * 100)}%`,
    perfect: evaluation.columns.filter((column) => column.status === 'COMPARED' && column.rate === 1).map((column) => column.outputName),
    missing: evaluation.columns.filter((column) => column.status === 'MISSING').map((column) => column.outputName),
    toFix: evaluation.columns
      .filter((column) => column.status === 'COMPARED' && column.rate < 1)
      .map((column) => ({ outputName: column.outputName, matched: `${column.matches}/${column.compared}`, mismatches: column.mismatches.map((item) => ({ exampleRow: item.row, expected: hide(item.expected), got: hide(item.got) })) }))
  };
}

async function runAssistant({ provider, template, input, output = null, instruction = '', maxTurns = MAX_TURNS }) {
  const pseudo = createPseudonymizer();
  const inputRows = (input.rows || []).slice(0, MAX_ROWS);
  const outputRows = (output?.rows || []).slice(0, MAX_ROWS);
  const alignment = output ? alignRows({ headers: input.headers, rows: inputRows }, outputRows, output.headers) : { mode: 'NONE', pairs: [] };
  const pairs = alignment.pairs;
  const evaluate = (candidate) => (output && pairs.length ? evaluateTemplate(candidate, pairs, output.headers) : null);
  const before = evaluate(template);

  // Both files go through the same pseudonymizer so shared values get the same fake value.
  const context = {
    input: { headers: input.headers, rows: sampleRows(inputRows, pseudo, input.headers) },
    destinationExample: output ? { headers: output.headers, rows: sampleRows(outputRows, pseudo, output.headers) } : null,
    shownAsPercentage: {
      input: input.percentHeaders || [],
      destination: output?.percentHeaders || [],
      note: 'These columns store fractions (0.0069) that Excel displays as percentages (0,69%).'
    },
    rowPairs: pairs.length
      ? pairs.map((pair) => ({ destinationRow: outputRows.indexOf(pair.output) + 1, inputRow: inputRows.indexOf(pair.input) + 1 }))
      : 'The examples do not share rows: columns can only be checked for validity.',
    currentTemplate: pseudo.hideDeep({ output: template.output, columns: template.columns, ...(template.rowSteps ? { rowSteps: template.rowSteps } : {}) }),
    currentResult: feedback(before, pseudo),
    instruction: instruction || '(none)'
  };

  const contents = [{ role: 'user', parts: [{ text: `Data (JSON):\n${JSON.stringify(context)}` }] }];
  const usage = { promptTokens: 0, outputTokens: 0 };
  let best = null;
  let turns = 0;
  let explanation = '';
  let lastExplanation = '';

  function handleProposal(args) {
    let parsed;
    try {
      parsed = JSON.parse(args.template_json);
    } catch (error) {
      return { valid: false, errors: [`template_json is not valid JSON: ${error.message}`] };
    }
    const candidate = { ...pseudo.revealDeep(parsed), name: template.name || 'Borrador', description: template.description, destination: template.destination, process: template.process, ...(template.parameters ? { parameters: template.parameters } : {}) };
    let valid;
    try {
      valid = validateTemplateConfig(candidate);
    } catch (error) {
      if (!(error instanceof TemplateValidationError)) throw error;
      return { valid: false, errors: [pseudo.text(error.message)] };
    }
    const evaluation = evaluate(valid);
    const score = evaluation ? evaluation.overall : 1;
    if (!best || score >= best.score) best = { template: valid, evaluation, score };
    if (args.explanation) lastExplanation = args.explanation;
    return { valid: true, ...feedback(evaluation, pseudo) };
  }

  while (turns < maxTurns) {
    turns += 1;
    const { content, usage: used } = await provider.generate({ system: systemPrompt(), contents, tools: TOOLS });
    usage.promptTokens += used.promptTokens;
    usage.outputTokens += used.outputTokens;
    contents.push(content);
    const calls = content.parts.filter((part) => part.functionCall);
    if (!calls.length) {
      explanation = content.parts.filter((part) => part.text).map((part) => part.text).join('\n').trim();
      break;
    }
    contents.push({
      role: 'user',
      parts: calls.map((part) => ({ functionResponse: { name: part.functionCall.name, response: part.functionCall.name === 'propose_template' ? handleProposal(part.functionCall.args || {}) : { error: 'Unknown tool' } } }))
    });
  }

  return {
    proposal: best?.template || null,
    before,
    after: best?.evaluation || null,
    explanation: pseudo.reveal(explanation || lastExplanation),
    turns,
    usage,
    alignment: alignment.mode
  };
}

module.exports = { runAssistant, systemPrompt, TOOLS, MAX_ROWS };

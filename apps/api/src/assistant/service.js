const { HttpError } = require('../http');
const { validateTemplateConfig, TemplateValidationError } = require('../../../../packages/template-engine/src/schema');
const { runAssistant, MAX_ROWS } = require('./agent');
const { AssistantProviderError } = require('./gemini');

// Dates travel from the web tagged as { $date }; everything else must be a plain cell value.
function decodeCell(value) {
  if (value && typeof value === 'object' && typeof value.$date === 'string') {
    const date = new Date(value.$date);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) return typeof value === 'string' ? value.slice(0, 500) : value;
  return null;
}

function readSample(sample, label) {
  if (!sample) return null;
  const headers = Array.isArray(sample.headers) ? sample.headers.filter((header) => typeof header === 'string').slice(0, 200) : [];
  if (!headers.length) throw new HttpError(400, 'INVALID_SAMPLE', `Faltan los encabezados de ${label}.`);
  const rows = (Array.isArray(sample.rows) ? sample.rows : []).slice(0, MAX_ROWS).map((row, index) => ({
    rowNumber: Number.isInteger(row?.rowNumber) ? row.rowNumber : index + 2,
    values: Object.fromEntries(headers.map((header) => [header, decodeCell(row?.values?.[header])]))
  }));
  const percentHeaders = (Array.isArray(sample.percentHeaders) ? sample.percentHeaders : []).filter((header) => headers.includes(header));
  return { headers, rows, percentHeaders };
}

function createAssistantService({ provider = null, audit = { record: async () => {} } }) {
  return {
    status() {
      return { enabled: Boolean(provider), model: provider?.model || null, maxRows: MAX_ROWS };
    },

    // Body: { template, input: { headers, rows }, output?: { headers, rows }, instruction? }. Rows are the
    // requester's own samples; only a pseudonymized version is sent to the model.
    async propose(body, user) {
      if (!provider) throw new HttpError(503, 'ASSISTANT_DISABLED', 'El asistente no está configurado (falta GEMINI_API_KEY en el servidor).');
      const input = readSample(body?.input, 'el Excel de origen');
      if (!input) throw new HttpError(400, 'INVALID_SAMPLE', 'Carga un Excel de origen para usar el asistente.');
      const output = readSample(body?.output, 'el ejemplo de destino');
      const instruction = typeof body?.instruction === 'string' ? body.instruction.trim().slice(0, 2000) : '';

      let template;
      try {
        template = validateTemplateConfig({ ...body?.template, name: body?.template?.name || 'Borrador' });
      } catch (error) {
        if (error instanceof TemplateValidationError) throw new HttpError(400, error.code, `La plantilla actual tiene un problema: ${error.message}`);
        throw error;
      }

      const startedAt = Date.now();
      let result;
      try {
        result = await runAssistant({ provider, template, input, output, instruction });
      } catch (error) {
        if (error instanceof AssistantProviderError) throw new HttpError(502, error.code, error.message);
        throw error;
      }

      // Metadata only: never the rows, the instruction or the proposal.
      await audit.record({
        userId: user?.id,
        eventType: 'TEMPLATE_ASSISTANT_USED',
        metadata: {
          model: provider.model,
          turns: result.turns,
          promptTokens: result.usage.promptTokens,
          outputTokens: result.usage.outputTokens,
          inputRows: input.rows.length,
          outputRows: output?.rows.length || 0,
          pseudonymized: true,
          proposed: Boolean(result.proposal),
          durationMs: Date.now() - startedAt
        }
      });
      return { ...result, model: provider.model };
    }
  };
}

module.exports = { createAssistantService };

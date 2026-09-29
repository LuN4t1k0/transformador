// Minimal client for the Gemini API (generateContent with function calling). The key stays on the server.

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

class AssistantProviderError extends Error {
  constructor(message, { status = null, retryable = false } = {}) {
    super(message);
    this.code = 'ASSISTANT_UNAVAILABLE';
    this.status = status;
    this.retryable = retryable;
  }
}

// Gemini explains a 429 in `error.details`: which quota ran out (per minute or per day, with its value) and how
// long to wait. Turns that into a message the user can act on.
function nextPacificMidnight(now) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hourCycle: 'h23', hour: 'numeric', minute: 'numeric', second: 'numeric' }).formatToParts(now).map((part) => [part.type, Number(part.value)]));
  const elapsed = ((parts.hour * 60 + parts.minute) * 60 + parts.second) * 1000;
  return new Date(now.getTime() + 24 * 3600 * 1000 - elapsed);
}

function quotaMessage(payload, modelName, now = new Date()) {
  const details = payload.error?.details || [];
  const delay = details.find((detail) => String(detail['@type']).endsWith('RetryInfo'))?.retryDelay;
  const waitSeconds = delay ? Math.ceil(parseFloat(delay)) : null;
  const violations = details.find((detail) => String(detail['@type']).endsWith('QuotaFailure'))?.violations || [];
  const daily = violations.find((violation) => /PerDay/i.test(violation.quotaId || ''));
  const perMinute = violations.find((violation) => /PerMinute/i.test(violation.quotaId || ''));
  const what = (violation) => (/token/i.test(`${violation.quotaId} ${violation.quotaMetric}`) ? 'tokens' : 'solicitudes');
  const model = daily?.quotaDimensions?.model || perMinute?.quotaDimensions?.model || modelName;
  if (daily) {
    const reset = nextPacificMidnight(now).toLocaleTimeString('es-CL', { timeZone: 'America/Santiago', hour: '2-digit', minute: '2-digit' });
    return { waitSeconds, message: `Se agotó la cuota diaria de Gemini para ${model}${daily.quotaValue ? ` (${daily.quotaValue} ${what(daily)} por día)` : ''}. Se renueva a medianoche hora del Pacífico, cerca de las ${reset} hora de Chile.` };
  }
  const wait = waitSeconds ? ` Espera unos ${waitSeconds} segundos e inténtalo de nuevo.` : ' Espera un minuto e inténtalo de nuevo.';
  if (perMinute) return { waitSeconds, message: `El asistente superó el límite por minuto de Gemini para ${model}${perMinute.quotaValue ? ` (${perMinute.quotaValue} ${what(perMinute)} por minuto)` : ''}.${wait}` };
  return { waitSeconds, message: `El asistente alcanzó su límite de uso por ahora.${wait}` };
}

// Models tried in order: when one is overloaded (503) or no longer offered (404), the next one is used.
const DEFAULT_MODELS = ['gemini-3.8-flash', 'gemini-3-flash-preview', 'gemini-3.5-flash-lite'];

function createGeminiProvider({ apiKey, model = null, fallbacks = DEFAULT_MODELS, timeoutMs = 90000, fetchImpl = fetch }) {
  const models = [...new Set([...(model ? [model] : []), ...fallbacks])];
  let current = 0;

  async function call(body, modelName) {
    let response;
    try {
      response = await fetchImpl(`${BASE_URL}/models/${encodeURIComponent(modelName)}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs)
      });
    } catch (error) {
      throw new AssistantProviderError('No pudimos comunicarnos con el asistente. Revisa la conexión e inténtalo de nuevo.', { retryable: true });
    }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const quota = response.status === 429 ? quotaMessage(payload, modelName) : null;
      // A short per-minute wait is worth retrying once; a longer one or a spent daily quota is not.
      const retryable = quota ? quota.waitSeconds !== null && quota.waitSeconds <= 15 : response.status >= 500;
      // Each model has its own quota, so a 429 also gives way to the next model.
      const switchModel = response.status === 404 || response.status === 503 || response.status === 429;
      const message = quota
        ? quota.message
        : response.status === 400 || response.status === 403
          ? `El asistente rechazó la solicitud (${payload.error?.status || response.status}). Revisa la clave GEMINI_API_KEY.`
          : 'El asistente no está disponible en este momento. Inténtalo de nuevo más tarde.';
      const error = new AssistantProviderError(message, { status: response.status, retryable });
      error.switchModel = switchModel;
      error.waitMs = quota?.waitSeconds ? quota.waitSeconds * 1000 : 2000;
      throw error;
    }
    return payload;
  }

  // Tries the current model; an overloaded or retired model gives way to the next one (and stays switched for
  // the rest of the conversation). Other temporary errors are retried once after a short pause.
  async function callWithFallback(body) {
    let retried = false;
    for (;;) {
      try {
        return await call(body, models[current]);
      } catch (error) {
        if (error.switchModel && current < models.length - 1) {
          current += 1;
          continue;
        }
        if (!error.retryable || retried) throw error;
        retried = true;
        await new Promise((resolve) => setTimeout(resolve, error.waitMs || 2000));
      }
    }
  }

  return {
    get model() {
      return models[current];
    },
    // `contents` uses Gemini's format: [{ role: 'user' | 'model', parts: [{ text } | { functionCall } | { functionResponse }] }].
    async generate({ system, contents, tools }) {
      const body = {
        systemInstruction: { parts: [{ text: system }] },
        contents,
        tools: [{ functionDeclarations: tools }],
        toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
        generationConfig: { temperature: 0.2 }
      };
      const payload = await callWithFallback(body);
      const content = payload.candidates?.[0]?.content;
      if (!content?.parts?.length) throw new AssistantProviderError('El asistente no devolvió una respuesta. Inténtalo de nuevo.');
      return {
        content: { role: 'model', parts: content.parts },
        usage: { promptTokens: payload.usageMetadata?.promptTokenCount || 0, outputTokens: (payload.usageMetadata?.candidatesTokenCount || 0) + (payload.usageMetadata?.thoughtsTokenCount || 0) }
      };
    }
  };
}

module.exports = { createGeminiProvider, AssistantProviderError, quotaMessage };

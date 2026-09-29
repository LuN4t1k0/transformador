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
      const retryable = response.status === 429 || response.status >= 500;
      const switchModel = response.status === 404 || response.status === 503;
      const message = response.status === 429
        ? 'El asistente alcanzó su límite de uso por ahora. Espera un momento e inténtalo de nuevo.'
        : response.status === 400 || response.status === 403
          ? `El asistente rechazó la solicitud (${payload.error?.status || response.status}). Revisa la clave GEMINI_API_KEY.`
          : 'El asistente no está disponible en este momento. Inténtalo de nuevo más tarde.';
      const error = new AssistantProviderError(message, { status: response.status, retryable });
      error.switchModel = switchModel;
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
        await new Promise((resolve) => setTimeout(resolve, 2000));
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

module.exports = { createGeminiProvider, AssistantProviderError };

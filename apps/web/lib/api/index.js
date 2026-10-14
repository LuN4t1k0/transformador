import { createHttpApi } from './http-api.js';

const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000';

// Production uses a same-origin /api rewrite so the backend stays on Railway's
// private network. Socket.IO remains at its conventional same-origin path.
export const api = createHttpApi(baseUrl, baseUrl === '/api' ? undefined : baseUrl);
export { ApiError } from './http-api.js';

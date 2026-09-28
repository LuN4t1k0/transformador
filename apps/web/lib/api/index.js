import { createHttpApi } from './http-api.js';

export const api = createHttpApi(process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000');
export { ApiError } from './http-api.js';

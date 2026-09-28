import { createMockApi } from './mock-api.js';

// Single entry point for pages. Replace with an HTTP + Socket.IO client once apps/api exposes the job endpoints.
export const api = createMockApi();
export { ApiError } from './mock-api.js';

import { maskSensitive } from './packs.js';

// On-screen samples hide sensitive values (e.g. RUT digits) as decided by the domain packs.
export function maskValue(column, text) {
  if (text === null || text === undefined || text === '') return text;
  return maskSensitive(column, String(text));
}

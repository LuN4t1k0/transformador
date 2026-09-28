// Mirrors the MAX_FILE_SIZE_BYTES default in packages/shared/src/config.js; the API remains the authority.
export const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;

export function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function validateExcelFile(file) {
  if (!file.name.toLowerCase().endsWith('.xlsx')) {
    return 'El archivo debe ser un Excel .xlsx. Si tienes un .xls o .csv, guárdalo como .xlsx e inténtalo de nuevo.';
  }
  if (file.size === 0) return 'El archivo está vacío.';
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return `El archivo pesa ${formatFileSize(file.size)} y el máximo permitido es ${formatFileSize(MAX_FILE_SIZE_BYTES)}.`;
  }
  return null;
}

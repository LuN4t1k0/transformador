export const MAPPING_STATUS = Object.freeze({
  OK: 'OK',
  REQUIERE_CONFIRMACION: 'REQUIERE_CONFIRMACION',
  FALTANTE: 'FALTANTE'
});

const SPLIT_TYPES = new Set(['SPLIT_WORD', 'SPLIT_WORD_RANGE']);

function normalizeHeader(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function findDetectedColumn(name, detectedColumns) {
  if (detectedColumns.includes(name)) return name;
  const target = normalizeHeader(name);
  return detectedColumns.find((detected) => normalizeHeader(detected) === target) || null;
}

export function createInitialMapping(columns, detectedColumns) {
  return Object.fromEntries(columns.map((column) => {
    const { source } = column;
    if (source.type === 'EMPTY') return [column.id, { type: 'EMPTY' }];

    const match = findDetectedColumn(source.column, detectedColumns);
    return [column.id, match ? { ...source, column: match } : { type: 'EMPTY' }];
  }));
}

// Keeps the template rule (e.g. split by words) when the user picks another origin column.
export function updateMappingEntry(column, detectedColumn) {
  if (!detectedColumn) return { type: 'EMPTY' };
  if (SPLIT_TYPES.has(column.source.type)) return { ...column.source, column: detectedColumn };
  return { type: 'COLUMN', column: detectedColumn };
}

function getConfirmationReason(column, entry, columnsByOrigin) {
  if (SPLIT_TYPES.has(entry.type)) {
    return 'Separar nombres por palabras no siempre es exacto. Confirma que el orden es apellido paterno, materno y nombres.';
  }

  const others = (columnsByOrigin.get(entry.column) || []).filter((other) => other.id !== column.id);
  if (others.length > 0) {
    const names = others.map((other) => other.outputName).join(', ');
    return `«${entry.column}» también alimenta ${names}. Confirma que ambos campos deben tener el mismo valor.`;
  }

  return null;
}

export function evaluateMapping(columns, mapping, confirmedIds) {
  const columnsByOrigin = new Map();
  for (const column of columns) {
    const entry = mapping[column.id];
    if (entry?.type !== 'COLUMN') continue;
    columnsByOrigin.set(entry.column, [...(columnsByOrigin.get(entry.column) || []), column]);
  }

  const rows = columns.map((column) => {
    const entry = mapping[column.id] || { type: 'EMPTY' };

    if (entry.type === 'EMPTY') {
      return column.required
        ? { column, entry, status: MAPPING_STATUS.FALTANTE, reason: 'Campo requerido sin columna de origen.' }
        : { column, entry, status: MAPPING_STATUS.OK, reason: null };
    }

    const reason = getConfirmationReason(column, entry, columnsByOrigin);
    if (reason && !confirmedIds.has(column.id)) {
      return { column, entry, status: MAPPING_STATUS.REQUIERE_CONFIRMACION, reason };
    }

    return { column, entry, status: MAPPING_STATUS.OK, reason, confirmed: Boolean(reason) };
  });

  const counts = {
    total: rows.length,
    ok: rows.filter((row) => row.status === MAPPING_STATUS.OK).length,
    pending: rows.filter((row) => row.status === MAPPING_STATUS.REQUIERE_CONFIRMACION).length,
    missing: rows.filter((row) => row.status === MAPPING_STATUS.FALTANTE).length
  };

  return { rows, counts, isComplete: counts.pending === 0 && counts.missing === 0 };
}

const MAPPING_STATUS = Object.freeze({
  OK: 'OK',
  REQUIERE_CONFIRMACION: 'REQUIERE_CONFIRMACION',
  FALTANTE: 'FALTANTE'
});

const SPLIT_TYPES = new Set(['SPLIT_WORD', 'SPLIT_WORD_RANGE']);
const SINGLE_COLUMN_TYPES = new Set(['COLUMN', ...SPLIT_TYPES]);

function normalizeHeader(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// Exact name first, then accent/case-insensitive name, then any known alias.
function findHeader(name, headers, aliases = []) {
  if (name && headers.includes(name)) return name;
  const byNormalized = new Map(headers.map((header) => [normalizeHeader(header), header]));
  for (const candidate of [name, ...aliases]) {
    const match = candidate ? byNormalized.get(normalizeHeader(candidate)) : null;
    if (match) return match;
  }
  return null;
}

function sourceColumns(source) {
  if (SINGLE_COLUMN_TYPES.has(source?.type)) return [source.column];
  if (source?.type === 'CONCAT') return source.parts.filter((part) => part.type === 'COLUMN').map((part) => part.column);
  if (source?.type === 'CALC') return source.operands.filter((operand) => operand.type === 'COLUMN').map((operand) => operand.column);
  return [];
}

function resolveSource(source, headers, aliases) {
  if (SINGLE_COLUMN_TYPES.has(source.type)) {
    const match = findHeader(source.column, headers, aliases);
    // Unknown names are kept so the column reports which header is missing.
    return match ? { ...source, column: match } : source;
  }
  if (source.type === 'CONCAT') {
    return {
      ...source,
      parts: source.parts.map((part) => (part.type === 'COLUMN' ? { ...part, column: findHeader(part.column, headers) || part.column } : part))
    };
  }
  if (source.type === 'CALC') {
    return {
      ...source,
      operands: source.operands.map((operand) => (operand.type === 'COLUMN' ? { ...operand, column: findHeader(operand.column, headers) || operand.column } : operand))
    };
  }
  return source;
}

function resolveTemplateForHeaders(template, headers) {
  return {
    ...template,
    columns: template.columns.map((column) => ({ ...column, source: resolveSource(column.source, headers, column.aliases || []) }))
  };
}

function getConfirmationReason(column, columnsByOrigin) {
  if (SPLIT_TYPES.has(column.source.type)) {
    return 'Separar por palabras no siempre es exacto (por ejemplo, apellidos compuestos). Revisa los ejemplos y confirma.';
  }
  if (column.source.type === 'COLUMN') {
    const others = (columnsByOrigin.get(column.source.column) || []).filter((other) => other.id !== column.id);
    if (others.length) {
      return `«${column.source.column}» también alimenta ${others.map((other) => other.outputName).join(', ')}. Confirma que deben tener el mismo valor.`;
    }
  }
  return null;
}

function evaluateColumns(columns, headers, confirmedIds) {
  const headerSet = new Set(headers);
  const columnsByOrigin = new Map();
  for (const column of columns) {
    if (column.source.type !== 'COLUMN') continue;
    columnsByOrigin.set(column.source.column, [...(columnsByOrigin.get(column.source.column) || []), column]);
  }

  const rows = columns.map((column) => {
    const { source } = column;
    const missing = sourceColumns(source).filter((name) => !headerSet.has(name));

    if (source.type === 'EMPTY' || (source.type === 'CONSTANT' && source.value === '')) {
      return column.required
        ? { column, status: MAPPING_STATUS.FALTANTE, reason: 'Campo obligatorio sin origen. Elige una columna o un valor fijo.' }
        : { column, status: MAPPING_STATUS.OK, reason: null, note: 'Quedará vacía en el archivo final.' };
    }

    if (missing.length) {
      const reason = `La columna «${missing.join('», «')}» no está en este archivo.`;
      return column.required
        ? { column, status: MAPPING_STATUS.FALTANTE, reason: `${reason} Elige otra columna de origen.` }
        : { column, status: MAPPING_STATUS.OK, reason: null, note: `${reason} Quedará vacía.` };
    }

    const reason = getConfirmationReason(column, columnsByOrigin);
    if (reason && !confirmedIds.has(column.id) && !column.reviewed) return { column, status: MAPPING_STATUS.REQUIERE_CONFIRMACION, reason };
    return { column, status: MAPPING_STATUS.OK, reason: null };
  });

  const counts = {
    total: rows.length,
    ok: rows.filter((row) => row.status === MAPPING_STATUS.OK).length,
    pending: rows.filter((row) => row.status === MAPPING_STATUS.REQUIERE_CONFIRMACION).length,
    missing: rows.filter((row) => row.status === MAPPING_STATUS.FALTANTE).length
  };

  return { rows, counts, isComplete: rows.length > 0 && counts.pending === 0 && counts.missing === 0 };
}

// How many column-based sources of a template can be found in a sheet.
function matchTemplate(template, headers) {
  let matched = 0;
  let total = 0;
  let requiredMissing = 0;
  for (const column of template.columns) {
    const names = sourceColumns(column.source);
    if (!names.length) continue;
    total += 1;
    const aliases = SINGLE_COLUMN_TYPES.has(column.source.type) ? column.aliases || [] : [];
    const found = names.every((name) => findHeader(name, headers, aliases));
    if (found) matched += 1;
    else if (column.required) requiredMissing += 1;
  }
  return { matched, total, requiredMissing };
}

function slugify(value, index) {
  const slug = normalizeHeader(value).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
  return `${slug || 'columna'}_${index + 1}`;
}

function createTemplateFromHeaders(headers, { sheet, name = 'Nueva plantilla' } = {}) {
  const used = new Map();
  return {
    name,
    input: sheet ? { sheet, headerRow: 1 } : { headerRow: 1 },
    output: { format: 'XLSX', sheetName: 'DATOS' },
    columns: headers.map((header, index) => {
      const count = (used.get(header) || 0) + 1;
      used.set(header, count);
      return {
        id: slugify(header, index),
        position: index + 1,
        outputName: count > 1 ? `${header} (${count})` : header,
        required: false,
        aliases: [],
        source: { type: 'COLUMN', column: header },
        transformations: [],
        validations: []
      };
    })
  };
}

// When saving from a job, header names the template knew before become aliases of the new version, and
// sources confirmed in the job are marked as reviewed so later jobs do not ask again.
function prepareVersionForSave(baseTemplate, workingTemplate, confirmedIds = []) {
  const confirmed = new Set(confirmedIds);
  const baseById = new Map((baseTemplate?.columns || []).map((column) => [column.id, column]));
  return {
    ...workingTemplate,
    columns: workingTemplate.columns.map((column) => {
      const base = baseById.get(column.id);
      const current = SINGLE_COLUMN_TYPES.has(column.source.type) ? column.source.column : null;
      const previous = base && SINGLE_COLUMN_TYPES.has(base.source.type) ? base.source.column : null;
      const aliases = [...new Set([...(base?.aliases || []), ...(column.aliases || []), ...(previous ? [previous] : [])])]
        .filter((alias) => alias && alias !== current);
      return { ...column, aliases, reviewed: column.reviewed === true || confirmed.has(column.id) };
    })
  };
}

module.exports = {
  MAPPING_STATUS,
  normalizeHeader,
  findHeader,
  sourceColumns,
  resolveTemplateForHeaders,
  evaluateColumns,
  matchTemplate,
  createTemplateFromHeaders,
  prepareVersionForSave
};

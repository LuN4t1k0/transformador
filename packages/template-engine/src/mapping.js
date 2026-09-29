const MAPPING_STATUS = Object.freeze({
  OK: 'OK',
  REQUIERE_CONFIRMACION: 'REQUIERE_CONFIRMACION',
  FALTANTE: 'FALTANTE'
});

const SPLIT_TYPES = new Set(['SPLIT_WORD', 'SPLIT_WORD_RANGE']);
const SINGLE_COLUMN_TYPES = new Set(['COLUMN', 'NAME_PART', ...SPLIT_TYPES]);

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

// File columns used by a source, wherever they appear: COLUMN operands, split sources and {Name} placeholders.
function sourceColumns(source) {
  const columns = [];
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (SINGLE_COLUMN_TYPES.has(node.type) && node.column) columns.push(node.column);
    if (node.type === 'TEMPLATE') for (const match of node.text.matchAll(/\{(?![@$])([^{}]+)\}/g)) columns.push(match[1].trim());
    Object.values(node).forEach(visit);
  };
  visit(source);
  return [...new Set(columns)];
}

// Returns the source with every file column reference matched to the actual headers. Top-level single-column
// sources also try the column aliases; unknown names are kept so the column reports which header is missing.
function resolveSource(source, headers, aliases) {
  const resolveName = (name, withAliases) => findHeader(name, headers, withAliases ? aliases : []) || name;
  const visit = (node, topLevel) => {
    if (!node || typeof node !== 'object') return node;
    if (Array.isArray(node)) return node.map((item) => visit(item, false));
    const next = {};
    for (const [key, value] of Object.entries(node)) next[key] = typeof value === 'object' ? visit(value, false) : value;
    if (SINGLE_COLUMN_TYPES.has(node.type) && node.column) next.column = resolveName(node.column, topLevel);
    if (node.type === 'TEMPLATE') next.text = node.text.replace(/\{(?![@$])([^{}]+)\}/g, (_, name) => `{${resolveName(name.trim(), false)}}`);
    return next;
  };
  return visit(source, true);
}

// Row steps name file columns too (fill down, filter conditions): they follow the file's spelling.
function resolveRowSteps(steps, headers) {
  if (!steps) return steps;
  return {
    ...steps,
    ...(steps.fillDown ? { fillDown: steps.fillDown.map((name) => findHeader(name, headers, []) || name) } : {}),
    ...(steps.filter ? { filter: resolveSource(steps.filter, headers, []) } : {})
  };
}

function resolveTemplateForHeaders(template, headers) {
  return {
    ...template,
    columns: template.columns.map((column) => ({ ...column, source: resolveSource(column.source, headers, column.aliases || []) })),
    ...(template.rowSteps ? { rowSteps: resolveRowSteps(template.rowSteps, headers) } : {})
  };
}

function getConfirmationReason(column, columnsByOrigin) {
  if (column.source.type === 'NAME_PART') {
    return 'Separar un nombre completo no siempre es exacto (por ejemplo, con apellidos o nombres compuestos). Revisa los ejemplos y confirma.';
  }
  if (SPLIT_TYPES.has(column.source.type)) {
    return 'Separar por palabras no siempre es exacto (por ejemplo, apellidos compuestos). Revisa los ejemplos y confirma.';
  }
  if (column.source.type === 'COLUMN') {
    // Sharing the origin is only suspicious when the values come out the same; different formats (e.g. a RUT's
    // number in one column and its check digit in another) are clearly intended.
    const sameOutput = (other) => JSON.stringify(other.transformations || []) === JSON.stringify(column.transformations || []);
    const others = (columnsByOrigin.get(column.source.column) || []).filter((other) => other.id !== column.id && sameOutput(other));
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

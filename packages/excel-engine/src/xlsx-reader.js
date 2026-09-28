const yauzl = require('yauzl');
const { SaxesParser } = require('saxes');

// Streaming .xlsx reader. The zip is opened with random access so workbook metadata, styles and shared strings
// are loaded first regardless of their order in the archive; then sheet XML is streamed row by row.
// Only shared strings are kept in memory, never whole sheets.

const DAY_MS = 24 * 60 * 60 * 1000;
const EPOCH_1900 = Date.UTC(1899, 11, 30);
const EPOCH_1904 = Date.UTC(1904, 0, 1);
const BUILTIN_DATE_FORMATS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58]);
const DEFAULT_MAX_UNCOMPRESSED_BYTES = 500 * 1024 * 1024;

class XlsxFormatError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function openZip(filePath) {
  return new Promise((resolve, reject) => {
    yauzl.open(filePath, { lazyEntries: true, autoClose: false, strictFileNames: false }, (error, zipfile) => {
      if (error) reject(new XlsxFormatError('INVALID_WORKBOOK', error.message));
      else resolve(zipfile);
    });
  });
}

function listEntries(zipfile) {
  return new Promise((resolve, reject) => {
    const entries = new Map();
    zipfile.on('entry', (entry) => {
      entries.set(entry.fileName.replace(/^\/+/, ''), entry);
      zipfile.readEntry();
    });
    zipfile.on('end', () => resolve(entries));
    zipfile.on('error', (error) => reject(new XlsxFormatError('INVALID_WORKBOOK', error.message)));
    zipfile.readEntry();
  });
}

function openEntryStream(zipfile, entry) {
  return new Promise((resolve, reject) => {
    zipfile.openReadStream(entry, (error, stream) => {
      if (error) reject(new XlsxFormatError('INVALID_WORKBOOK', error.message));
      else resolve(stream);
    });
  });
}

// Streams an XML entry through a SAX parser. `setup(parser, emit)` registers handlers; emitted items are yielded
// as soon as each chunk is parsed, so callers can stop early.
async function* parseXml(zipfile, entry, setup) {
  const stream = await openEntryStream(zipfile, entry);
  stream.setEncoding('utf8');
  const parser = new SaxesParser();
  const ready = [];
  let parseError = null;
  parser.on('error', (error) => {
    parseError = error;
  });
  setup(parser, (item) => ready.push(item));

  try {
    for await (const chunk of stream) {
      parser.write(chunk);
      if (parseError) throw new XlsxFormatError('INVALID_WORKBOOK', `XML inválido en ${entry.fileName}`);
      while (ready.length) yield ready.shift();
    }
    parser.close();
    while (ready.length) yield ready.shift();
  } finally {
    stream.destroy();
  }
}

async function consumeXml(zipfile, entry, setup) {
  // eslint-disable-next-line no-unused-vars
  for await (const _ of parseXml(zipfile, entry, setup)) { /* handlers collect state */ }
}

function localName(name) {
  const index = name.indexOf(':');
  return index >= 0 ? name.slice(index + 1) : name;
}

function attribute(node, name) {
  for (const [key, value] of Object.entries(node.attributes)) {
    if (localName(key) === name) return value;
  }
  return undefined;
}

function isDateFormatCode(code) {
  const cleaned = String(code)
    .replace(/"[^"]*"/g, '')
    .replace(/\\./g, '')
    .replace(/\[(?!h+\]|m+\]|s+\])[^\]]*\]/gi, '')
    .replace(/General/gi, '');
  return /[dy]/i.test(cleaned) || /h/i.test(cleaned);
}

function columnIndex(ref) {
  let index = 0;
  for (const char of ref) {
    const code = char.charCodeAt(0);
    if (code < 65 || code > 90) break;
    index = index * 26 + (code - 64);
  }
  return index - 1;
}

function resolveTarget(target) {
  if (target.startsWith('/')) return target.slice(1);
  const parts = ['xl'];
  for (const segment of target.split('/')) {
    if (segment === '..') parts.pop();
    else if (segment && segment !== '.') parts.push(segment);
  }
  return parts.join('/');
}

async function readWorkbookMeta(zipfile, entries) {
  const workbookEntry = entries.get('xl/workbook.xml');
  if (!workbookEntry) throw new XlsxFormatError('INVALID_WORKBOOK', 'Falta xl/workbook.xml');

  const sheets = [];
  let date1904 = false;
  await consumeXml(zipfile, workbookEntry, (parser) => {
    parser.on('opentag', (node) => {
      const name = localName(node.name);
      if (name === 'workbookPr') date1904 = ['1', 'true'].includes(attribute(node, 'date1904'));
      if (name === 'sheet') sheets.push({ name: attribute(node, 'name'), relId: attribute(node, 'id'), state: attribute(node, 'state') || 'visible' });
    });
  });

  const targets = new Map();
  const relsEntry = entries.get('xl/_rels/workbook.xml.rels');
  if (relsEntry) {
    await consumeXml(zipfile, relsEntry, (parser) => {
      parser.on('opentag', (node) => {
        if (localName(node.name) === 'Relationship') targets.set(attribute(node, 'Id'), resolveTarget(attribute(node, 'Target')));
      });
    });
  }

  return {
    date1904,
    sheets: sheets.map((sheet, index) => ({ ...sheet, path: targets.get(sheet.relId) || `xl/worksheets/sheet${index + 1}.xml` }))
  };
}

function isPercentFormatCode(code) {
  return /%/.test(String(code).replace(/"[^"]*"/g, '').replace(/\\./g, ''));
}

// Returns the cellXfs indexes that display dates and percentages.
async function readStyles(zipfile, entries) {
  const entry = entries.get('xl/styles.xml');
  const dateStyles = new Set();
  const percentStyles = new Set();
  if (!entry) return { dateStyles, percentStyles };

  const customFormats = new Map();
  let inCellXfs = false;
  let xfIndex = 0;
  await consumeXml(zipfile, entry, (parser) => {
    parser.on('opentag', (node) => {
      const name = localName(node.name);
      if (name === 'numFmt') customFormats.set(Number(attribute(node, 'numFmtId')), attribute(node, 'formatCode'));
      if (name === 'cellXfs') inCellXfs = true;
      if (name === 'xf' && inCellXfs) {
        const id = Number(attribute(node, 'numFmtId') || 0);
        if (BUILTIN_DATE_FORMATS.has(id) || (customFormats.has(id) && isDateFormatCode(customFormats.get(id)))) dateStyles.add(xfIndex);
        else if (id === 9 || id === 10 || (customFormats.has(id) && isPercentFormatCode(customFormats.get(id)))) percentStyles.add(xfIndex);
        xfIndex += 1;
      }
    });
    parser.on('closetag', (node) => {
      if (localName(node.name) === 'cellXfs') inCellXfs = false;
    });
  });
  return { dateStyles, percentStyles };
}

async function readSharedStrings(zipfile, entries) {
  const entry = entries.get('xl/sharedStrings.xml');
  const strings = [];
  if (!entry) return strings;

  let current = null;
  let inText = false;
  let inPhonetic = false;
  await consumeXml(zipfile, entry, (parser) => {
    parser.on('opentag', (node) => {
      const name = localName(node.name);
      if (name === 'si') current = '';
      if (name === 'rPh') inPhonetic = true;
      if (name === 't' && !inPhonetic) inText = true;
    });
    parser.on('text', (text) => {
      if (inText && current !== null) current += text;
    });
    parser.on('closetag', (node) => {
      const name = localName(node.name);
      if (name === 't') inText = false;
      if (name === 'rPh') inPhonetic = false;
      if (name === 'si') {
        strings.push(current);
        current = null;
      }
    });
  });
  return strings;
}

function cellValue(cell, context) {
  const { type, style, text } = cell;
  if (type === 'inlineStr') return cell.inline;
  if (text === null) return null;
  if (type === 's') return context.sharedStrings[Number(text)] ?? null;
  if (type === 'str') return text;
  if (type === 'b') return text === '1';
  if (type === 'e') return null;
  if (type === 'd') {
    const date = new Date(text);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const number = Number(text);
  if (!Number.isFinite(number)) return text;
  if (context.dateStyles.has(style)) return new Date((context.date1904 ? EPOCH_1904 : EPOCH_1900) + Math.round(number * DAY_MS));
  return number;
}

function sheetRowParser(context) {
  return (parser, emit) => {
    // <cols> precedes <sheetData>: every emitted row shares the set of hidden column indexes.
    const hiddenColumns = new Set();
    let row = null;
    let cell = null;
    let target = null;
    let lastRow = 0;
    let nextColumn = 0;

    parser.on('opentag', (node) => {
      const name = localName(node.name);
      if (name === 'col' && ['1', 'true'].includes(attribute(node, 'hidden'))) {
        const min = Number(attribute(node, 'min'));
        const max = Math.min(Number(attribute(node, 'max')), min + 1000);
        for (let column = min; column <= max; column += 1) hiddenColumns.add(column - 1);
      } else if (name === 'row') {
        const number = Number(attribute(node, 'r')) || lastRow + 1;
        row = { number, cells: [], hiddenColumns };
        lastRow = number;
        nextColumn = 0;
      } else if (name === 'c' && row) {
        const ref = attribute(node, 'r');
        const column = ref ? columnIndex(ref) : nextColumn;
        nextColumn = column + 1;
        cell = { column, type: attribute(node, 't') || 'n', style: Number(attribute(node, 's') || 0), text: null, inline: '' };
      } else if (cell && name === 'v') {
        target = 'v';
        cell.text = '';
      } else if (cell && name === 't') {
        target = 't';
      }
    });
    parser.on('text', (text) => {
      if (!cell) return;
      if (target === 'v') cell.text += text;
      else if (target === 't') cell.inline += text;
    });
    parser.on('closetag', (node) => {
      const name = localName(node.name);
      if (name === 'v' || name === 't') target = null;
      else if (name === 'c' && cell && row) {
        const value = cellValue(cell, context);
        row.cells[cell.column] = value;
        // Percent cells keep their numeric value; callers that need the displayed text (headers) use this list.
        if (typeof value === 'number' && context.percentStyles.has(cell.style)) (row.percent ||= []).push(cell.column);
        cell = null;
      } else if (name === 'row' && row) {
        emit(row);
        row = null;
      }
    });
  };
}

// Opens a workbook and returns its sheet list plus a function to stream any sheet's rows.
async function openWorkbook(filePath, { maxUncompressedBytes = DEFAULT_MAX_UNCOMPRESSED_BYTES } = {}) {
  const zipfile = await openZip(filePath);
  try {
    const entries = await listEntries(zipfile);
    const total = [...entries.values()].reduce((sum, entry) => sum + entry.uncompressedSize, 0);
    if (total > maxUncompressedBytes) {
      throw new XlsxFormatError('TOO_LARGE_UNCOMPRESSED', 'El archivo descomprimido es demasiado grande para procesarlo.');
    }
    const meta = await readWorkbookMeta(zipfile, entries);
    const [{ dateStyles, percentStyles }, sharedStrings] = await Promise.all([readStyles(zipfile, entries), readSharedStrings(zipfile, entries)]);
    const context = { dateStyles, percentStyles, sharedStrings, date1904: meta.date1904 };

    return {
      sheets: meta.sheets.map(({ name, state }) => ({ name, state })),
      async* rows(sheetName) {
        const sheet = meta.sheets.find((candidate) => candidate.name === sheetName);
        const entry = sheet && entries.get(sheet.path);
        if (!entry) return;
        yield* parseXml(zipfile, entry, sheetRowParser(context));
      },
      close() {
        zipfile.close();
      }
    };
  } catch (error) {
    zipfile.close();
    throw error;
  }
}

module.exports = { openWorkbook, XlsxFormatError, isDateFormatCode };

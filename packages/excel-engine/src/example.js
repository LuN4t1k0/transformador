const ExcelJS = require('exceljs');

// Builds a sample input workbook for a template: the headers the template expects, one example row and
// an instructions sheet. Helps users prepare files that the template recognizes on the first try.

const { sourceColumns: sourceHeaders } = require('../../template-engine/src/mapping');

const DATE_EXAMPLES = {
  AUTO: '03-05-2024',
  'DD-MM-YYYY': '03-05-2024',
  'DD/MM/YYYY': '03/05/2024',
  'YYYY-MM-DD': '2024-05-03',
  YYYYMMDD: '20240503',
  YYYYMM: '202405',
  EXCEL_SERIAL: new Date(Date.UTC(2024, 4, 3))
};

function describeExpected(column) {
  const transformation = (column.transformations || []).find((item) => ['RUT_FORMAT', 'DATE_FORMAT', 'NUMBER'].includes(item.type));
  if (['CALC', 'DATE_CALC'].includes(column.source.type)) return { example: column.source.type === 'CALC' ? 1234567 : '03-05-2024', text: 'Se usa en un cálculo' };
  if (['CASE', 'MAP', 'COALESCE', 'TEMPLATE'].includes(column.source.type)) return { example: 'Valor de ejemplo', text: 'Se usa en una regla de la plantilla' };
  if (column.source.type.startsWith('SPLIT')) return { example: 'PÉREZ SOTO JUAN CARLOS', text: 'Nombre completo: apellido paterno, apellido materno y nombres, separados por espacios' };
  if (transformation?.type === 'RUT_FORMAT') return { example: '12.345.678-5', text: 'RUT con dígito verificador (con o sin puntos)' };
  if (transformation?.type === 'DATE_FORMAT') {
    const example = DATE_EXAMPLES[transformation.inputFormat || 'AUTO'];
    return { example, text: `Fecha${transformation.inputFormat === 'YYYYMM' ? ' como año y mes (AAAAMM)' : ''}` };
  }
  if (transformation?.type === 'NUMBER') {
    return transformation.integer
      ? { example: 1234567, text: 'Número entero' }
      : { example: 1234.5, text: 'Número (puede tener decimales)' };
  }
  return { example: 'Texto de ejemplo', text: 'Texto' };
}

async function buildExampleWorkbook(template) {
  const headers = new Map();
  for (const column of template.columns) {
    for (const header of sourceHeaders(column.source)) {
      const entry = headers.get(header) || { header, required: false, usedBy: [], expected: describeExpected(column) };
      entry.required = entry.required || column.required;
      entry.usedBy.push(column.outputName);
      headers.set(header, entry);
    }
  }
  const entries = [...headers.values()];

  const workbook = new ExcelJS.Workbook();
  const data = workbook.addWorksheet(template.input?.sheet || 'Datos');
  data.addRow(entries.map((entry) => entry.header)).font = { bold: true };
  data.addRow(entries.map((entry) => entry.expected.example));
  data.columns.forEach((column, index) => {
    column.width = Math.max(14, entries[index].header.length + 4);
  });

  const help = workbook.addWorksheet('Instrucciones');
  help.addRow([`Excel de ejemplo para la plantilla «${template.name}»`]).font = { bold: true, size: 13 };
  help.addRow(['Copia tus datos en la hoja de datos manteniendo los encabezados de la primera fila. La segunda fila es solo un ejemplo: bórrala.']);
  help.addRow([]);
  help.addRow(['Columna del Excel', 'Obligatoria', 'Qué debe contener', 'Se usa para']).font = { bold: true };
  for (const entry of entries) help.addRow([entry.header, entry.required ? 'Sí' : 'No', entry.expected.text, entry.usedBy.join(', ')]);
  help.columns = [{ width: 28 }, { width: 12 }, { width: 60 }, { width: 50 }];

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

module.exports = { buildExampleWorkbook };

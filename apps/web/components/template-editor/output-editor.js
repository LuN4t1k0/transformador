'use client';

import { FileSpreadsheet, FileText, Rows3 } from 'lucide-react';
import { inputClass } from './source-editor';

const FORMATS = [
  { value: 'XLSX', label: 'Excel (.xlsx)', description: 'Una hoja con encabezados.', icon: FileSpreadsheet },
  { value: 'DELIMITED', label: 'Texto delimitado', description: 'CSV o TXT con separador: ; , | o tabulación.', icon: FileText },
  { value: 'FIXED_WIDTH', label: 'Texto de ancho fijo', description: 'Cada columna ocupa un número fijo de caracteres.', icon: Rows3 }
];

const labelClass = 'mb-1 block text-xs font-medium text-ink-500';

function defaultsFor(format, current) {
  if (format === 'XLSX') return { format, sheetName: current.sheetName || 'DATOS' };
  const text = {
    extension: current.extension || (format === 'DELIMITED' ? 'csv' : 'txt'),
    includeHeaders: format === 'DELIMITED',
    encoding: current.encoding || 'UTF-8',
    lineEnding: current.lineEnding || 'CRLF'
  };
  return format === 'DELIMITED' ? { format, delimiter: current.delimiter || ';', ...text } : { format, ...text };
}

export function OutputEditor({ template, onChange }) {
  const { output } = template;

  function setOutput(changes) {
    onChange({ ...template, output: { ...output, ...changes } });
  }

  function setFormat(format) {
    const columns = format === 'FIXED_WIDTH'
      ? template.columns.map((column) => ({ ...column, fixedWidth: column.fixedWidth || { length: Math.max(1, Math.min(50, column.outputName.length + 5)), align: 'LEFT', padChar: ' ' } }))
      : template.columns.map(({ fixedWidth, ...column }) => column);
    onChange({ ...template, output: defaultsFor(format, output), columns });
  }

  const totalWidth = template.columns.reduce((sum, column) => sum + (column.fixedWidth?.length || 0), 0);

  return (
    <div className="space-y-5">
      <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Formato del archivo">
        {FORMATS.map(({ value, label, description, icon: Icon }) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={output.format === value}
            className={`flex items-start gap-3 rounded-lg border p-3 text-left ${output.format === value ? 'border-cobalt-500 bg-cobalt-50' : 'border-ink-200 bg-white hover:bg-ink-50'}`}
            onClick={() => output.format !== value && setFormat(value)}
          >
            <Icon className="mt-0.5 shrink-0 text-cobalt-600" size={18} aria-hidden="true" />
            <span>
              <span className="block text-sm font-semibold text-ink-900">{label}</span>
              <span className="mt-0.5 block text-xs text-ink-500">{description}</span>
            </span>
          </button>
        ))}
      </div>

      {output.format === 'XLSX' ? (
        <div className="max-w-xs">
          <label className={labelClass} htmlFor="output-sheet">Nombre de la hoja</label>
          <input id="output-sheet" maxLength={31} className={inputClass} value={output.sheetName} onChange={(event) => setOutput({ sheetName: event.target.value })} />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {output.format === 'DELIMITED' ? (
            <div>
              <label className={labelClass} htmlFor="output-delimiter">Separador</label>
              <select id="output-delimiter" className={inputClass} value={output.delimiter} onChange={(event) => setOutput({ delimiter: event.target.value })}>
                <option value=";">Punto y coma ( ; )</option>
                <option value=",">Coma ( , )</option>
                <option value="|">Barra ( | )</option>
                <option value={'\t'}>Tabulación</option>
              </select>
            </div>
          ) : null}
          <div>
            <label className={labelClass} htmlFor="output-extension">Extensión</label>
            <select id="output-extension" className={inputClass} value={output.extension} onChange={(event) => setOutput({ extension: event.target.value })}>
              <option value="csv">.csv</option>
              <option value="txt">.txt</option>
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="output-encoding">Codificación</label>
            <select id="output-encoding" className={inputClass} value={output.encoding} onChange={(event) => setOutput({ encoding: event.target.value })}>
              <option value="UTF-8">UTF-8</option>
              <option value="LATIN1">Latin-1 (ISO-8859-1)</option>
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="output-eol">Fin de línea</label>
            <select id="output-eol" className={inputClass} value={output.lineEnding} onChange={(event) => setOutput({ lineEnding: event.target.value })}>
              <option value="CRLF">Windows (CRLF)</option>
              <option value="LF">Unix (LF)</option>
            </select>
          </div>
          <label className="inline-flex items-center gap-2 text-sm text-ink-700 sm:col-span-2">
            <input type="checkbox" className="h-4 w-4 accent-cobalt-600" checked={output.includeHeaders} onChange={(event) => setOutput({ includeHeaders: event.target.checked })} />
            Incluir una primera línea con los nombres de columna
          </label>
        </div>
      )}

      {output.format === 'FIXED_WIDTH' ? (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-ink-900">Largo de cada columna <span className="font-normal text-ink-500">· total {totalWidth} caracteres por línea</span></h3>
          <div className="overflow-x-auto rounded-lg border border-ink-200">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead className="bg-ink-50 text-xs text-ink-500">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">Columna</th>
                  <th scope="col" className="w-24 px-3 py-2 font-medium">Largo</th>
                  <th scope="col" className="w-32 px-3 py-2 font-medium">Alinear</th>
                  <th scope="col" className="w-32 px-3 py-2 font-medium">Rellenar con</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {template.columns.map((column, index) => {
                  const setWidth = (changes) => {
                    const columns = [...template.columns];
                    columns[index] = { ...column, fixedWidth: { ...column.fixedWidth, ...changes } };
                    onChange({ ...template, columns });
                  };
                  return (
                    <tr key={column.id}>
                      <th scope="row" className="px-3 py-1.5 font-medium text-ink-900">{column.outputName}</th>
                      <td className="px-3 py-1.5">
                        <input aria-label={`Largo de ${column.outputName}`} type="number" min={1} max={1000} className={inputClass} value={column.fixedWidth?.length ?? 10} onChange={(event) => setWidth({ length: Math.max(1, Math.min(1000, Number(event.target.value) || 1)) })} />
                      </td>
                      <td className="px-3 py-1.5">
                        <select aria-label={`Alineación de ${column.outputName}`} className={inputClass} value={column.fixedWidth?.align || 'LEFT'} onChange={(event) => setWidth({ align: event.target.value })}>
                          <option value="LEFT">Izquierda</option>
                          <option value="RIGHT">Derecha</option>
                        </select>
                      </td>
                      <td className="px-3 py-1.5">
                        <select aria-label={`Relleno de ${column.outputName}`} className={inputClass} value={column.fixedWidth?.padChar ?? ' '} onChange={(event) => setWidth({ padChar: event.target.value })}>
                          <option value=" ">Espacios</option>
                          <option value="0">Ceros</option>
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}

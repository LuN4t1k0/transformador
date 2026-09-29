'use client';

import { FileSpreadsheet, FileText, Rows3 } from 'lucide-react';
import { inputClass } from './source-editor';

const FORMATS = [
  { value: 'XLSX', label: 'Excel (.xlsx)', description: 'Una hoja con encabezados.', icon: FileSpreadsheet },
  { value: 'DELIMITED', label: 'Texto delimitado', description: 'CSV o TXT con separador: ; , | o tabulación.', icon: FileText },
  { value: 'FIXED_WIDTH', label: 'Texto de ancho fijo', description: 'Cada columna ocupa un número fijo de caracteres.', icon: Rows3 }
];

const labelClass = 'mb-1 block text-xs font-medium text-ink-500';

// Design options survive a format change; splitting into sheets only exists for Excel.
function designOf(format, current) {
  const design = {};
  for (const key of ['fileName', 'headerLines', 'footerLines', 'totals']) if (current[key]) design[key] = current[key];
  if (current.split) design.split = format === 'XLSX' ? current.split : { ...current.split, mode: 'FILES' };
  return design;
}

function defaultsFor(format, current) {
  if (format === 'XLSX') return { format, sheetName: current.sheetName || 'DATOS', ...designOf(format, current) };
  const text = {
    extension: current.extension || (format === 'DELIMITED' ? 'csv' : 'txt'),
    includeHeaders: format === 'DELIMITED',
    encoding: current.encoding || 'UTF-8',
    lineEnding: current.lineEnding || 'CRLF'
  };
  return format === 'DELIMITED' ? { format, delimiter: current.delimiter || ';', ...text, ...designOf(format, current) } : { format, ...text, ...designOf(format, current) };
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
    onChange({ ...template, output: defaultsFor(format, output), columns: format === 'XLSX' ? columns : columns.map(({ cellFormat, ...column }) => column) });
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
        <div className="space-y-3">
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
          <label className="inline-flex items-center gap-2 self-end pb-2 text-sm text-ink-700 sm:col-span-2 lg:col-span-3">
            <input type="checkbox" className="h-4 w-4 accent-cobalt-600" checked={output.includeHeaders} onChange={(event) => setOutput({ includeHeaders: event.target.checked })} />
            Incluir una primera línea con los nombres de columna
          </label>
        </div>
        <details className="rounded-lg border border-ink-200">
          <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-ink-700 hover:bg-ink-50">Opciones avanzadas del archivo</summary>
          <div className="grid gap-3 border-t border-ink-100 p-3 sm:grid-cols-3">
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
          <p className="text-xs text-ink-500 sm:col-span-3">Cámbialas solo si el destino lo pide (por ejemplo, sistemas antiguos que exigen Latin-1 o fin de línea Unix).</p>
          </div>
        </details>
        </div>
      )}

      {output.format === 'FIXED_WIDTH' ? (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-ink-900">Largo de cada columna <span className="font-normal text-ink-500">· total {totalWidth} caracteres por línea</span></h3>
          <div className="relative overflow-x-auto rounded-lg border border-ink-200">
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

      <OutputDesignEditor template={template} onChange={onChange} />
    </div>
  );
}

const VARIABLES = [
  ['{archivo}', 'nombre del Excel de entrada'],
  ['{plantilla}', 'nombre de la plantilla'],
  ['{fecha}', 'fecha de proceso (DD-MM-AAAA)'],
  ['{fecha:YYYYMMDD}', 'fecha en otro formato'],
  ['{hoja}', 'hoja de origen'],
  ['{grupo}', 'valor de la división'],
  ['{filas}', 'filas escritas'],
  ['{total:COLUMNA}', 'suma de una columna'],
  ['{$Parámetro}', 'valor de un parámetro']
];

const TOTAL_OPTIONS = [
  { value: '', label: '—' },
  { value: 'SUM', label: 'Suma' },
  { value: 'COUNT', label: 'Cantidad' },
  { value: 'AVERAGE', label: 'Promedio' },
  { value: 'MIN', label: 'Mínimo' },
  { value: 'MAX', label: 'Máximo' }
];

const CELL_FORMATS = [
  { value: '', label: 'Como sale (texto o número)' },
  { value: 'NUMBER', label: 'Número entero (1.234)' },
  { value: 'NUMBER_2', label: 'Número con 2 decimales' },
  { value: 'PERCENT', label: 'Porcentaje (0,1 → 10%)' },
  { value: 'DATE', label: 'Fecha' },
  { value: 'TEXT', label: 'Texto' }
];

function DesignSection({ title, description, children }) {
  return (
    <div className="space-y-2 border-t border-ink-100 pt-4">
      <div>
        <h3 className="text-sm font-semibold text-ink-900">{title}</h3>
        {description ? <p className="text-xs text-ink-500">{description}</p> : null}
      </div>
      {children}
    </div>
  );
}

function LinesInput({ id, label, lines = [], onChange }) {
  return (
    <div>
      <label className={labelClass} htmlFor={id}>{label}</label>
      <textarea
        id={id}
        rows={Math.max(2, lines.length)}
        className="w-full rounded-md border border-ink-200 px-2 py-1.5 font-mono text-sm"
        value={lines.join('\n')}
        placeholder="Una línea por renglón. Ej: H{fecha:YYYYMMDD}{filas|6}"
        onChange={(event) => onChange(event.target.value ? event.target.value.split('\n').slice(0, 10) : undefined)}
      />
    </div>
  );
}

// File name, texts around the table, totals row, splitting and Excel cell formats.
function OutputDesignEditor({ template, onChange }) {
  const { output, columns } = template;
  const setOutput = (key, value) => {
    const next = { ...output };
    if (value === undefined || value === null || value === '') delete next[key];
    else next[key] = value;
    onChange({ ...template, output: next });
  };
  const totalOf = new Map((output.totals?.columns || []).map((total) => [total.columnId, total.op]));
  const setTotal = (columnId, op) => {
    const others = (output.totals?.columns || []).filter((total) => total.columnId !== columnId);
    const next = op ? [...others, { columnId, op }] : others;
    setOutput('totals', next.length ? { label: output.totals?.label ?? 'TOTAL', columns: columns.filter((column) => next.some((total) => total.columnId === column.id)).map((column) => next.find((total) => total.columnId === column.id)) } : undefined);
  };
  const isExcel = output.format === 'XLSX';

  return (
    <div className="space-y-4">
      <DesignSection title="Nombre del archivo" description="Déjalo vacío para usar «{archivo}-{plantilla}».">
        <input aria-label="Nombre del archivo" maxLength={150} className={`${inputClass} font-mono`} value={output.fileName || ''} placeholder="{archivo}-{plantilla}" onChange={(event) => setOutput('fileName', event.target.value)} />
        <details className="text-xs text-ink-500">
          <summary className="cursor-pointer font-medium text-cobalt-700">Variables disponibles</summary>
          <ul className="mt-1 grid gap-x-4 gap-y-0.5 sm:grid-cols-2">
            {VARIABLES.map(([name, description]) => <li key={name}><code className="font-mono text-ink-900">{name}</code> {description}</li>)}
            <li className="sm:col-span-2">Agrega <code className="font-mono text-ink-900">|8</code> para fijar el largo: los números se rellenan con ceros y los textos con espacios (ej. <code className="font-mono text-ink-900">{'{filas|8}'}</code>).</li>
          </ul>
        </details>
      </DesignSection>

      <DesignSection title="Encabezado y pie" description={isExcel ? 'Filas de texto antes de la tabla (títulos) y después de ella.' : 'Líneas antes y después de los datos, como un registro de control con la cantidad de filas y los totales.'}>
        <div className="grid gap-3 sm:grid-cols-2">
          <LinesInput id="output-header-lines" label="Antes de la tabla" lines={output.headerLines} onChange={(lines) => setOutput('headerLines', lines)} />
          <LinesInput id="output-footer-lines" label="Después de la tabla" lines={output.footerLines} onChange={(lines) => setOutput('footerLines', lines)} />
        </div>
      </DesignSection>

      <DesignSection title="Fila de totales" description="Una fila al final con la suma, cantidad, promedio, mínimo o máximo de las columnas que elijas.">
        <div className="max-w-xs">
          <label className={labelClass} htmlFor="output-totals-label">Texto de la fila</label>
          <input id="output-totals-label" maxLength={60} className={inputClass} value={output.totals?.label ?? 'TOTAL'} disabled={!output.totals} onChange={(event) => setOutput('totals', { ...output.totals, label: event.target.value })} />
        </div>
        <div className="flex flex-wrap gap-2">
          {columns.map((column) => (
            <label key={column.id} className="inline-flex items-center gap-1.5 rounded-md border border-ink-200 px-2 py-1 text-xs text-ink-700">
              {column.outputName}
              <select aria-label={`Total de ${column.outputName}`} className="h-7 rounded border border-ink-200 bg-white px-1 text-xs" value={totalOf.get(column.id) || ''} onChange={(event) => setTotal(column.id, event.target.value)}>
                {TOTAL_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
          ))}
        </div>
      </DesignSection>

      <DesignSection title="Dividir el archivo" description="Una parte por cada valor de una columna, por ejemplo una por AFP o por sucursal.">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <select aria-label="Columna para dividir" className="h-9 rounded-md border border-ink-200 bg-white px-2 text-sm" value={output.split?.columnId || ''} onChange={(event) => setOutput('split', event.target.value ? { columnId: event.target.value, mode: output.split?.mode || (isExcel ? 'SHEETS' : 'FILES') } : undefined)}>
            <option value="">No dividir</option>
            {columns.map((column) => <option key={column.id} value={column.id}>Por {column.outputName}</option>)}
          </select>
          {output.split ? (
            <select aria-label="Cómo dividir" className="h-9 rounded-md border border-ink-200 bg-white px-2 text-sm" value={output.split.mode} onChange={(event) => setOutput('split', { ...output.split, mode: event.target.value })}>
              {isExcel ? <option value="SHEETS">Una hoja por valor, en un solo Excel</option> : null}
              <option value="FILES">Un archivo por valor, en un .zip</option>
            </select>
          ) : null}
        </div>
      </DesignSection>

      {isExcel ? (
        <DesignSection title="Formato de celdas en Excel" description="Guarda números y fechas como valores reales, para que se puedan sumar y filtrar en Excel.">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {columns.map((column, index) => (
              <label key={column.id} className="flex items-center justify-between gap-2 rounded-md border border-ink-200 px-2 py-1 text-xs text-ink-700">
                <span className="truncate">{column.outputName}</span>
                <select
                  aria-label={`Formato de celda de ${column.outputName}`}
                  className="h-7 max-w-[60%] rounded border border-ink-200 bg-white px-1 text-xs"
                  value={column.cellFormat || ''}
                  onChange={(event) => {
                    const next = [...columns];
                    const { cellFormat, ...rest } = column;
                    next[index] = event.target.value ? { ...rest, cellFormat: event.target.value } : rest;
                    onChange({ ...template, columns: next });
                  }}
                >
                  {CELL_FORMATS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
            ))}
          </div>
        </DesignSection>
      ) : null}
    </div>
  );
}

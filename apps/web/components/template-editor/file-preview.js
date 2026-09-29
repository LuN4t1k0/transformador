'use client';

import { useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { formatFixedWidthValue } from '@previley-transformer/template-engine/src/run.js';
import { maskValue } from '../../lib/preview';
import { formatCell } from '../../lib/template-editor';
import { describeIssue, describeIssueHint } from '../../lib/templates';

// Spreadsheet column letters: A…Z, AA…
function columnLetter(index) {
  let letters = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) letters = String.fromCharCode(65 + ((n - 1) % 26)) + letters;
  return letters;
}

// Mapping status of each output column as a dot and a tint: ready, needs a look, missing.
const COLUMN_STATUS = {
  OK: { dot: 'bg-mint-600', cell: '', label: 'lista' },
  REQUIERE_CONFIRMACION: { dot: 'bg-amber-400', cell: 'bg-amber-50', label: 'por revisar' },
  FALTANTE: { dot: 'bg-rose-600', cell: 'bg-rose-50 text-rose-700', label: 'sin origen' }
};

function cellText(column, value) {
  const text = formatCell(value, column);
  return maskValue(column, text);
}

function escapeDelimited(text, delimiter) {
  return /["\r\n]/.test(text) || text.includes(delimiter) ? `"${text.replace(/"/g, '""')}"` : text;
}

function TextPreview({ lines }) {
  return (
    <pre className="overflow-x-auto rounded-lg border border-ink-200 bg-ink-900 p-3 font-mono text-xs leading-5 text-white">
      {lines.join('\n')}
    </pre>
  );
}

function FixedWidthRuler({ columns }) {
  let start = 1;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
      {columns.map((column) => {
        const end = start + column.fixedWidth.length - 1;
        const label = `${column.outputName}: ${start}–${end}`;
        start = end + 1;
        return <span key={column.id} className="rounded bg-ink-100 px-1.5 py-0.5 font-mono text-ink-700">{label}</span>;
      })}
    </div>
  );
}

function DesignSummary({ design, output }) {
  if (!design) return null;
  const parts = design.parts || [];
  return (
    <div className="space-y-0.5 text-xs text-ink-500">
      <p>Archivo: <span className="font-mono text-ink-900">{design.fileName}</span></p>
      {parts.length ? (
        <p>
          {output.split.mode === 'SHEETS' ? `${parts.length} ${parts.length === 1 ? 'hoja' : 'hojas'}` : `${parts.length} ${parts.length === 1 ? 'archivo' : 'archivos'} dentro del .zip`} con estas filas de ejemplo:{' '}
          {parts.map((part) => `${part.fileName || part.name} (${part.rows})`).join(', ')}. La tabla muestra todas las filas; el encabezado y los totales, los de la primera parte.
        </p>
      ) : null}
    </div>
  );
}

// `columnStatus` (Map outputName → OK | REQUIERE_CONFIRMACION | FALTANTE) marks each column's mapping state.
// `selectedColumn` (a column id) is highlighted; with `onSelectColumn`, clicking a header selects that column.
export function FilePreview({ template, results, sampleCount = results.length, design = null, columnStatus = null, selectedColumn = null, onSelectColumn = null }) {
  const [asText, setAsText] = useState(false);
  const { columns, output } = template;
  const rowValues = results.map((result) => columns.map((column) => cellText(column, result.output[column.outputName])));
  const totalsValues = design?.totalsRow ? columns.map((column) => cellText(column, design.totalsRow.output[column.outputName])) : null;
  const headerLines = design?.headerLines || [];
  const footerLines = design?.footerLines || [];
  // One line per problem: columns sharing the same issue on the same rows are listed together.
  const issueGroups = (() => {
    const byColumn = new Map();
    for (const result of results) {
      for (const issue of result.issues) {
        const key = `${issue.column}|${issue.code}`;
        const entry = byColumn.get(key) || { column: issue.column, issue, rows: [] };
        entry.rows.push(result.rowNumber);
        byColumn.set(key, entry);
      }
    }
    const groups = new Map();
    for (const entry of byColumn.values()) {
      const key = `${entry.issue.code}|${entry.rows.join(',')}`;
      const group = groups.get(key) || { key, issue: entry.issue, rows: entry.rows, columns: [] };
      group.columns.push(entry.column);
      groups.set(key, group);
    }
    return [...groups.values()];
  })();

  let body;
  if (output.format === 'FIXED_WIDTH') {
    const line = (values) => values.map((value, index) => formatFixedWidthValue(value, columns[index].fixedWidth)).join('');
    const lines = [...headerLines, ...(output.includeHeaders ? [line(columns.map((column) => column.outputName))] : []), ...rowValues.map(line), ...(totalsValues ? [line(totalsValues)] : []), ...footerLines];
    body = (
      <>
        <TextPreview lines={lines} />
        <FixedWidthRuler columns={columns} />
      </>
    );
  } else if (output.format === 'DELIMITED' && asText) {
    const delimiter = output.delimiter;
    const line = (values) => values.map((value) => escapeDelimited(value, delimiter)).join(delimiter === '\t' ? '\t' : delimiter);
    body = <TextPreview lines={[...headerLines, ...(output.includeHeaders ? [line(columns.map((column) => column.outputName))] : []), ...rowValues.map(line), ...(totalsValues ? [line(totalsValues)] : []), ...footerLines]} />;
  } else {
    const statusOf = (column) => COLUMN_STATUS[columnStatus?.get(column.outputName)] || null;
    body = (
      <div className="overflow-x-auto rounded-md border border-ink-200 bg-white">
        {headerLines.length ? <div className="border-b border-ink-100 bg-white px-3 py-1.5 font-mono text-xs text-ink-700">{headerLines.map((text, index) => <p key={index}>{text || ' '}</p>)}</div> : null}
        <table className="w-full border-collapse text-left font-mono text-[13.5px]">
          <thead>
            <tr aria-hidden="true" className="bg-ink-50 text-[11px] text-ink-400">
              <th className="sticky left-0 w-10 border-b border-r border-ink-200 bg-ink-50" />
              {columns.map((column, index) => <th key={column.id} className="border-b border-r border-ink-100 px-3 py-0.5 text-center font-normal">{columnLetter(index)}</th>)}
            </tr>
            <tr className="font-sans text-[13px] text-ink-900">
              <th scope="col" className="sticky left-0 w-10 border-b border-r border-ink-200 bg-ink-50 px-2"><span className="sr-only">Fila del Excel</span></th>
              {columns.map((column) => {
                const status = statusOf(column);
                const isSelected = column.id === selectedColumn;
                const label = (
                  <span className="inline-flex items-center gap-1.5">
                    {status ? <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${status.dot}`} /> : null}
                    {column.outputName}
                    {status && status.label !== 'lista' ? <span className="sr-only">, {status.label}</span> : null}
                  </span>
                );
                return (
                  <th key={column.id} scope="col" aria-selected={onSelectColumn ? isSelected : undefined} className={`whitespace-nowrap border-b border-r border-ink-200 px-3 py-2 font-bold ${isSelected ? 'bg-amber-100 shadow-[inset_0_-3px_0_#e8b04b]' : status?.cell || 'bg-white'}`}>
                    {onSelectColumn ? (
                      <button type="button" className="rounded-sm text-left hover:underline" title="Editar esta columna" onClick={() => onSelectColumn(column.id)}>{label}</button>
                    ) : label}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {results.map((result, rowIndex) => (
              <tr key={result.rowNumber}>
                <th scope="row" className="sticky left-0 border-b border-r border-ink-200 bg-ink-50 px-2 py-1.5 text-right text-[11px] font-normal tabular-nums text-ink-400" title={result.rowNumbers?.length > 1 ? `Agrupa las filas ${result.rowNumbers.join(', ')}` : `Fila ${result.rowNumber} del Excel`}>
                  {result.rowNumbers?.length > 1 ? `${result.rowNumber}+${result.rowNumbers.length - 1}` : result.rowNumber}
                </th>
                {columns.map((column, columnIndex) => {
                  const hasError = result.issues.some((issue) => issue.column === column.outputName && issue.severity === 'error');
                  const status = statusOf(column);
                  const tint = column.id === selectedColumn ? 'bg-amber-50' : status?.cell || '';
                  return (
                    <td key={column.id} className={`whitespace-nowrap border-b border-r border-ink-100 px-3 py-1.5 ${hasError ? 'bg-rose-50 text-rose-700' : `${tint} text-ink-900`}`}>
                      {rowValues[rowIndex][columnIndex] || <span className="text-ink-300">—</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          {totalsValues ? (
            <tfoot className="bg-ink-50">
              <tr>
                <th scope="row" className="sticky left-0 border-r border-t border-ink-200 bg-ink-50 px-2 py-1.5 text-[11px] font-normal text-ink-400">Tot.</th>
                {totalsValues.map((value, index) => <td key={columns[index].id} className="whitespace-nowrap border-r border-t border-ink-200 px-3 py-1.5 font-semibold text-ink-900">{value}</td>)}
              </tr>
            </tfoot>
          ) : null}
        </table>
        {footerLines.length ? <div className="border-t border-ink-100 bg-white px-3 py-1.5 font-mono text-xs text-ink-700">{footerLines.map((text, index) => <p key={index}>{text || ' '}</p>)}</div> : null}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <DesignSummary design={design} output={output} />
      {output.format === 'DELIMITED' ? (
        <div className="flex gap-1 text-sm" role="group" aria-label="Modo de vista">
          <button type="button" aria-pressed={!asText} className={`rounded-md px-2.5 py-1 ${!asText ? 'bg-cobalt-50 font-medium text-cobalt-700' : 'text-ink-500 hover:bg-ink-50'}`} onClick={() => setAsText(false)}>Tabla</button>
          <button type="button" aria-pressed={asText} className={`rounded-md px-2.5 py-1 ${asText ? 'bg-cobalt-50 font-medium text-cobalt-700' : 'text-ink-500 hover:bg-ink-50'}`} onClick={() => setAsText(true)}>Texto del archivo</button>
        </div>
      ) : null}

      {body}

      {issueGroups.length ? (
        <ul className="space-y-1 text-sm">
          {issueGroups.map((group) => (
            <li key={group.key} className="flex flex-wrap items-center gap-x-2 text-rose-700">
              <AlertCircle size={14} aria-hidden="true" />
              <span className="font-medium">{group.columns.join(', ')}:</span>
              <span>{describeIssue(group.issue)}.</span>
              <span className="text-ink-500">{describeIssueHint(group.issue)} Filas {group.rows.join(', ')}.</span>
            </li>
          ))}
        </ul>
      ) : null}

      <p className="text-xs text-ink-500">
        Primeras {sampleCount} filas de la hoja, con los datos sensibles enmascarados. Al generar se procesan y validan todas las filas; las que tengan errores se excluyen y se informan.
      </p>
    </div>
  );
}

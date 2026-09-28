'use client';

import { useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { formatFixedWidthValue } from '@previley-transformer/template-engine/src/run.js';
import { maskRut } from '../../lib/preview';
import { formatCell, isRutColumn } from '../../lib/template-editor';
import { describeIssue, describeIssueHint } from '../../lib/templates';

function cellText(column, value) {
  const text = formatCell(value);
  return isRutColumn(column) && text ? maskRut(text) : text;
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

export function FilePreview({ template, results }) {
  const [asText, setAsText] = useState(false);
  const { columns, output } = template;
  const rowValues = results.map((result) => columns.map((column) => cellText(column, result.output[column.outputName])));
  const issuesByRow = results.filter((result) => result.issues.length);

  let body;
  if (output.format === 'FIXED_WIDTH') {
    const line = (values) => values.map((value, index) => formatFixedWidthValue(value, columns[index].fixedWidth)).join('');
    const lines = [...(output.includeHeaders ? [line(columns.map((column) => column.outputName))] : []), ...rowValues.map(line)];
    body = (
      <>
        <TextPreview lines={lines} />
        <FixedWidthRuler columns={columns} />
      </>
    );
  } else if (output.format === 'DELIMITED' && asText) {
    const delimiter = output.delimiter;
    const line = (values) => values.map((value) => escapeDelimited(value, delimiter)).join(delimiter === '\t' ? '\t' : delimiter);
    body = <TextPreview lines={[...(output.includeHeaders ? [line(columns.map((column) => column.outputName))] : []), ...rowValues.map(line)]} />;
  } else {
    body = (
      <div className="overflow-x-auto rounded-lg border border-ink-200">
        <table className="w-full text-left text-sm">
          <thead className="bg-ink-50 text-xs text-ink-500">
            <tr>
              <th scope="col" className="sticky left-0 bg-ink-50 px-3 py-2 font-medium">Fila</th>
              {columns.map((column) => <th key={column.id} scope="col" className="whitespace-nowrap px-3 py-2 font-medium">{column.outputName}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {results.map((result, rowIndex) => (
              <tr key={result.rowNumber}>
                <th scope="row" className="sticky left-0 bg-white px-3 py-1.5 text-xs font-normal tabular-nums text-ink-400">{result.rowNumber}</th>
                {columns.map((column, columnIndex) => {
                  const hasError = result.issues.some((issue) => issue.column === column.outputName && issue.severity === 'error');
                  return (
                    <td key={column.id} className={`whitespace-nowrap px-3 py-1.5 ${hasError ? 'bg-rose-50 text-rose-700' : 'text-ink-900'}`}>
                      {rowValues[rowIndex][columnIndex] || <span className="text-ink-300">—</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {output.format === 'DELIMITED' ? (
        <div className="flex gap-1 text-sm" role="group" aria-label="Modo de vista">
          <button type="button" aria-pressed={!asText} className={`rounded-md px-2.5 py-1 ${!asText ? 'bg-cobalt-50 font-medium text-cobalt-700' : 'text-ink-500 hover:bg-ink-50'}`} onClick={() => setAsText(false)}>Tabla</button>
          <button type="button" aria-pressed={asText} className={`rounded-md px-2.5 py-1 ${asText ? 'bg-cobalt-50 font-medium text-cobalt-700' : 'text-ink-500 hover:bg-ink-50'}`} onClick={() => setAsText(true)}>Texto del archivo</button>
        </div>
      ) : null}

      {body}

      {issuesByRow.length ? (
        <ul className="space-y-1 text-sm">
          {issuesByRow.map((result) => (
            <li key={result.rowNumber} className="flex flex-wrap items-center gap-x-2 text-rose-700">
              <AlertCircle size={14} aria-hidden="true" />
              <span className="font-medium">Fila {result.rowNumber}:</span>
              {result.issues.map((issue) => `${issue.column} — ${describeIssue(issue)}. ${describeIssueHint(issue)}`.trim()).join(' · ')}
            </li>
          ))}
        </ul>
      ) : null}

      <p className="text-xs text-ink-500">
        Primeras {results.length} filas de la hoja, con el RUT enmascarado. Al generar se procesan y validan todas las filas; las que tengan errores se excluyen y se informan.
      </p>
    </div>
  );
}

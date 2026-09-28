'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import { api } from '../../lib/api';
import { maskRut } from '../../lib/preview';
import { describeIssue } from '../../lib/templates';
import { Notice } from '../panel';

function isRutColumn(column) {
  return column.semanticType === 'CHILEAN_RUT';
}

function displayValue(value, column) {
  if (value === null || value === undefined || value === '') return <span className="text-ink-400">—</span>;
  return isRutColumn(column) ? maskRut(value) : String(value);
}

function sourceValue(result, entry) {
  return entry.type === 'EMPTY' ? null : result.input[entry.column];
}

export function PreviewSection({ job, template }) {
  const [state, setState] = useState({ rows: null, error: null });
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    let active = true;
    api.previewJob(job.id)
      .then(({ rows }) => active && setState({ rows, error: null }))
      .catch((error) => active && setState({ rows: null, error }));
    return () => {
      active = false;
    };
  }, [job.id, job.mapping, job.selectedSheet]);

  if (state.error) {
    return <Notice tone="danger" icon={AlertCircle} role="alert">{state.error.message}</Notice>;
  }
  if (!state.rows) {
    return (
      <p className="flex items-center gap-2 text-sm text-ink-500">
        <Loader2 size={16} className="animate-spin" aria-hidden="true" />
        Generando vista previa…
      </p>
    );
  }

  const result = state.rows[Math.min(selectedIndex, state.rows.length - 1)];
  const columns = [...template.columns].sort((a, b) => a.position - b.position);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Filas de muestra">
        {state.rows.map((row, index) => {
          const errorCount = row.issues.filter((issue) => issue.severity === 'error').length;
          const isSelected = index === selectedIndex;
          return (
            <button
              key={row.rowNumber}
              type="button"
              role="tab"
              aria-selected={isSelected}
              className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-sm font-medium ${
                isSelected ? 'border-cobalt-500 bg-cobalt-50 text-cobalt-700' : 'border-ink-200 bg-white text-ink-700 hover:bg-ink-50'
              }`}
              onClick={() => setSelectedIndex(index)}
            >
              Fila {row.rowNumber}
              {errorCount ? (
                <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-semibold text-white">
                  <span className="sr-only">con errores: </span>{errorCount}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="mt-3 overflow-x-auto rounded-lg border border-ink-200" role="tabpanel">
        <table className="w-full min-w-[560px] text-left text-sm">
          <caption className="sr-only">Comparación de entrada y salida para la fila {result.rowNumber}</caption>
          <thead className="bg-ink-50 text-xs text-ink-500">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">Columna destino</th>
              <th scope="col" className="px-3 py-2 font-medium">Valor de origen</th>
              <th scope="col" className="px-3 py-2 font-medium">Resultado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {columns.map((column) => {
              const entry = job.mapping[column.id] || { type: 'EMPTY' };
              const issues = result.issues.filter((issue) => issue.column === column.outputName);
              const hasError = issues.some((issue) => issue.severity === 'error');

              return (
                <tr key={column.id} className={hasError ? 'bg-rose-50/70' : undefined}>
                  <th scope="row" className="px-3 py-2 font-medium text-ink-900">{column.outputName}</th>
                  <td className="px-3 py-2 text-ink-500">{displayValue(sourceValue(result, entry), column)}</td>
                  <td className="px-3 py-2">
                    <span className={hasError ? 'text-rose-700' : 'font-medium text-ink-900'}>{displayValue(result.output[column.outputName], column)}</span>
                    {issues.map((issue) => (
                      <span key={issue.code} className="mt-0.5 flex items-center gap-1 text-xs text-rose-700">
                        <AlertCircle size={12} aria-hidden="true" />
                        {describeIssue(issue)}
                      </span>
                    ))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-ink-500">
        Se muestran {state.rows.length} filas de muestra con el RUT enmascarado. La validación completa se hace sobre todas las filas al transformar.
      </p>
    </div>
  );
}

import { AlertTriangle, CheckCircle2, Info, Table2 } from 'lucide-react';
import { createInitialMapping, evaluateMapping } from '../../lib/mapping';
import { Notice } from '../panel';

function getSheetFit(template, sheet) {
  const mapping = createInitialMapping(template.columns, sheet.headers);
  const { counts } = evaluateMapping(template.columns, mapping, new Set());
  return template.columns.filter((column) => column.required).length - counts.missing;
}

const PHYSICAL_TYPES = { STRING: 'Texto', INTEGER: 'Entero', DECIMAL: 'Decimal', DATE: 'Fecha', BOOLEAN: 'Sí/No', EMPTY: 'Vacía' };
const SEMANTIC_TYPES = { CHILEAN_RUT: 'RUT', EMAIL: 'Email', YEAR_MONTH: 'Periodo AAAAMM', AFP: 'AFP', GENERIC_NUMBER: 'Número', GENERIC_TEXT: '—' };

function DetectedColumns({ sheet }) {
  if (!sheet?.columns?.length) return null;

  return (
    <details className="mt-4 rounded-lg border border-ink-200">
      <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-ink-700 hover:bg-ink-50">
        Columnas detectadas en «{sheet.name}» ({sheet.columns.length})
      </summary>
      <div className="overflow-x-auto border-t border-ink-200">
        <table className="w-full min-w-[480px] text-left text-sm">
          <thead className="bg-ink-50 text-xs text-ink-500">
            <tr>
              <th scope="col" className="w-10 px-3 py-2 font-medium">#</th>
              <th scope="col" className="px-3 py-2 font-medium">Encabezado</th>
              <th scope="col" className="px-3 py-2 font-medium">Tipo</th>
              <th scope="col" className="px-3 py-2 font-medium">Contenido detectado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {sheet.columns.map((column) => (
              <tr key={column.position}>
                <td className="px-3 py-1.5 tabular-nums text-ink-400">{column.position}</td>
                <td className="px-3 py-1.5 font-medium text-ink-900">{column.header}</td>
                <td className="px-3 py-1.5 text-ink-700">{PHYSICAL_TYPES[column.physical.type] || column.physical.type}</td>
                <td className="px-3 py-1.5 text-ink-700">
                  {SEMANTIC_TYPES[column.semantic.type] || column.semantic.type}
                  {column.semantic.type !== 'GENERIC_TEXT' ? (
                    <span className="ml-1 text-xs tabular-nums text-ink-400">{Math.round(column.semantic.confidence * 100)}%</span>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export function SheetSection({ job, template, onSelect, isBusy }) {
  const requiredTotal = template.columns.filter((column) => column.required).length;
  const hasProgress = job.confirmedIds.length > 0;

  return (
    <div>
      <div className="grid gap-2" role="radiogroup" aria-label="Hoja de origen">
        {job.sheets.map((sheet) => {
          const isSelected = sheet.name === job.selectedSheet;
          const fit = getSheetFit(template, sheet);

          return (
            <button
              key={sheet.name}
              type="button"
              role="radio"
              aria-checked={isSelected}
              disabled={isBusy}
              className={`flex w-full items-start gap-3 rounded-lg border p-4 text-left disabled:cursor-wait ${
                isSelected ? 'border-cobalt-500 bg-cobalt-50' : 'border-ink-200 bg-white hover:bg-ink-50'
              }`}
              onClick={() => !isSelected && onSelect(sheet.name)}
            >
              <Table2 className="mt-0.5 shrink-0 text-cobalt-600" size={20} aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-sm font-semibold text-ink-900">{sheet.name}</span>
                  <span className="text-xs text-ink-500">Rango {sheet.range}</span>
                  {sheet.name === template.input.sheet ? <span className="text-xs font-medium text-cobalt-700">Sugerida por la plantilla</span> : null}
                </span>
                <span className="mt-1 block text-sm text-ink-500">
                  {sheet.rowCount} filas · {sheet.columnCount} columnas
                </span>
                <span className={`mt-1 block text-xs ${fit === requiredTotal ? 'text-mint-600' : 'text-amber-700'}`}>
                  {fit} de {requiredTotal} campos requeridos encontrados automáticamente
                </span>
                {sheet.warnings?.length ? (
                  <span className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-amber-700">
                    {sheet.warnings.map((warning) => (
                      <span key={warning.code} className="inline-flex items-center gap-1">
                        <AlertTriangle size={12} aria-hidden="true" />
                        {warning.message}
                      </span>
                    ))}
                  </span>
                ) : null}
              </span>
              {isSelected ? <CheckCircle2 className="shrink-0 text-cobalt-600" size={18} aria-hidden="true" /> : null}
            </button>
          );
        })}
      </div>

      <DetectedColumns sheet={job.sheets.find((sheet) => sheet.name === job.selectedSheet)} />

      <div className="mt-4">
        <Notice tone="info" icon={Info}>
          {hasProgress
            ? 'Cambiar de hoja vuelve a sugerir el mapeo y descarta las confirmaciones que hiciste.'
            : 'La hoja elegida aplica solo a este job; no modifica la plantilla.'}
        </Notice>
      </div>
    </div>
  );
}

import { CheckCircle2, Info, Table2 } from 'lucide-react';
import { createInitialMapping, evaluateMapping } from '../../lib/mapping';
import { Notice } from '../panel';

function getSheetFit(template, sheet) {
  const mapping = createInitialMapping(template.columns, sheet.headers);
  const { counts } = evaluateMapping(template.columns, mapping, new Set());
  return template.columns.filter((column) => column.required).length - counts.missing;
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
              </span>
              {isSelected ? <CheckCircle2 className="shrink-0 text-cobalt-600" size={18} aria-hidden="true" /> : null}
            </button>
          );
        })}
      </div>

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

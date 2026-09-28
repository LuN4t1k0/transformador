'use client';

import { ArrowDownUp, CopyMinus, Filter, Layers, Plus, ArrowDownToLine, X } from 'lucide-react';
import { ConditionRow, defaultCondition } from './rule-editors';
import { pickerInputClass } from './operand-picker';

const addButton = 'inline-flex h-9 items-center gap-1 rounded-md border border-ink-200 px-2 text-sm font-medium text-ink-700 hover:bg-ink-50 disabled:opacity-40';
const removeButton = 'flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-ink-200 text-ink-500 hover:bg-ink-50 disabled:opacity-40';
const selectClass = 'h-9 rounded-md border border-ink-200 bg-white px-2 text-sm text-ink-900';

export const AGGREGATE_OPTIONS = [
  { value: 'FIRST', label: 'Primer valor' },
  { value: 'LAST', label: 'Último valor' },
  { value: 'SUM', label: 'Suma' },
  { value: 'AVERAGE', label: 'Promedio' },
  { value: 'MIN', label: 'Mínimo' },
  { value: 'MAX', label: 'Máximo' },
  { value: 'COUNT', label: 'Cantidad de filas' },
  { value: 'CONCAT', label: 'Lista de valores distintos' }
];

function StepCard({ icon: Icon, title, description, enabled, onToggle, children }) {
  return (
    <section className={`rounded-lg border ${enabled ? 'border-cobalt-200 bg-white' : 'border-ink-200 bg-ink-50/40'}`}>
      <label className="flex cursor-pointer items-start gap-3 p-3">
        <input type="checkbox" className="mt-0.5 h-4 w-4 accent-cobalt-600" checked={enabled} onChange={(event) => onToggle(event.target.checked)} />
        <Icon size={16} className="mt-0.5 shrink-0 text-ink-500" aria-hidden="true" />
        <span>
          <span className="block text-sm font-semibold text-ink-900">{title}</span>
          <span className="block text-xs text-ink-500">{description}</span>
        </span>
      </label>
      {enabled ? <div className="space-y-3 border-t border-ink-100 p-3">{children}</div> : null}
    </section>
  );
}

// Toggle buttons to pick several columns (file headers or template columns).
function ColumnChips({ label, options, selected, onChange }) {
  const chosen = new Set(selected);
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((option) => {
        const isOn = chosen.has(option.value);
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={isOn}
            className={`rounded-full border px-2.5 py-1 text-xs font-medium ${isOn ? 'border-cobalt-600 bg-cobalt-50 text-cobalt-700' : 'border-ink-200 bg-white text-ink-700 hover:bg-ink-50'}`}
            onClick={() => onChange(isOn ? selected.filter((value) => value !== option.value) : [...selected, option.value])}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

// Steps over whole rows: fill down, filter, remove duplicates, group and sort, applied in that order.
export function RowStepsEditor({ steps = {}, columns, headers, suggestions = [], onChange }) {
  const fileColumns = headers || suggestions;
  const columnOptions = columns.map((column) => ({ value: column.id, label: column.outputName }));
  const firstId = columns[0]?.id;
  const set = (key, value) => {
    const next = { ...steps };
    if (value === undefined) delete next[key];
    else next[key] = value;
    onChange(Object.keys(next).length ? next : undefined);
  };
  const pickerProps = { headers, suggestions, outputColumns: columns, outputLabel: 'Columnas de esta plantilla', allowText: true };
  const filter = steps.filter;
  const group = steps.group;
  const aggregateOf = new Map((group?.aggregates || []).map((item) => [item.columnId, item.op]));

  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-500">Se aplican en este orden, después de calcular las columnas. Las filas con errores se rechazan antes de quitar duplicados, agrupar u ordenar.</p>

      <StepCard
        icon={ArrowDownToLine}
        title="Rellenar hacia abajo"
        description="Completa celdas vacías con el valor de la fila de arriba. Útil cuando el Excel escribe un dato solo en la primera fila de cada bloque."
        enabled={Boolean(steps.fillDown)}
        onToggle={(on) => set('fillDown', on ? fileColumns.slice(0, 1) : undefined)}
      >
        {fileColumns.length ? (
          <ColumnChips label="Columnas del Excel a rellenar" options={fileColumns.map((name) => ({ value: name, label: name }))} selected={steps.fillDown || []} onChange={(value) => set('fillDown', value)} />
        ) : (
          <input
            aria-label="Columnas del Excel a rellenar"
            className={pickerInputClass}
            placeholder="Nombres de columnas del Excel, separados por coma"
            defaultValue={(steps.fillDown || []).join(', ')}
            onBlur={(event) => set('fillDown', event.target.value.split(',').map((name) => name.trim()).filter(Boolean))}
          />
        )}
      </StepCard>

      <StepCard
        icon={Filter}
        title="Filtrar filas"
        description="Deja fuera filas que no deben ir en el archivo, como títulos, subtotales o registros de otro periodo. No se validan ni se rechazan."
        enabled={Boolean(filter)}
        onToggle={(on) => set('filter', on ? { mode: 'EXCLUDE', match: 'ALL', conditions: [defaultCondition(headers)] } : undefined)}
      >
        {filter ? (
          <>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <select aria-label="Qué hacer con las filas" className={selectClass} value={filter.mode} onChange={(event) => set('filter', { ...filter, mode: event.target.value })}>
                <option value="EXCLUDE">Quitar las filas que</option>
                <option value="KEEP">Mantener solo las filas que</option>
              </select>
              <select aria-label="Tipo de coincidencia del filtro" className={selectClass} value={filter.match} onChange={(event) => set('filter', { ...filter, match: event.target.value })}>
                <option value="ALL">cumplan todas las condiciones</option>
                <option value="ANY">cumplan alguna condición</option>
              </select>
            </div>
            {filter.conditions.map((condition, index) => (
              <ConditionRow
                key={index}
                idPrefix={`row-filter-${index}`}
                condition={condition}
                pickerProps={pickerProps}
                canRemove={filter.conditions.length > 1}
                onChange={(changes) => set('filter', { ...filter, conditions: filter.conditions.map((current, position) => (position === index ? { ...current, ...changes } : current)) })}
                onRemove={() => set('filter', { ...filter, conditions: filter.conditions.filter((_, position) => position !== index) })}
              />
            ))}
            <button type="button" className={addButton} disabled={filter.conditions.length >= 10} onClick={() => set('filter', { ...filter, conditions: [...filter.conditions, defaultCondition(headers)] })}>
              <Plus size={15} aria-hidden="true" />
              Otra condición
            </button>
          </>
        ) : null}
      </StepCard>

      <StepCard
        icon={CopyMinus}
        title="Quitar duplicados"
        description="Deja una sola fila por cada valor repetido de las columnas que elijas (por ejemplo, un RUT)."
        enabled={Boolean(steps.dedupe)}
        onToggle={(on) => set('dedupe', on ? { columnIds: firstId ? [firstId] : [], keep: 'FIRST' } : undefined)}
      >
        {steps.dedupe ? (
          <>
            <p className="text-xs font-medium text-ink-500">Filas iguales en</p>
            <ColumnChips label="Columnas que identifican un duplicado" options={columnOptions} selected={steps.dedupe.columnIds} onChange={(columnIds) => set('dedupe', { ...steps.dedupe, columnIds })} />
            <select aria-label="Fila a conservar" className={selectClass} value={steps.dedupe.keep} onChange={(event) => set('dedupe', { ...steps.dedupe, keep: event.target.value })}>
              <option value="FIRST">Conservar la primera que aparece</option>
              <option value="LAST">Conservar la última que aparece</option>
            </select>
          </>
        ) : null}
      </StepCard>

      <StepCard
        icon={Layers}
        title="Agrupar y resumir"
        description="Junta las filas que comparten valores (por ejemplo, una fila por RUT) y resume las demás columnas: suma, promedio, cantidad…"
        enabled={Boolean(group)}
        onToggle={(on) => set('group', on ? { columnIds: firstId ? [firstId] : [], aggregates: [] } : undefined)}
      >
        {group ? (
          <>
            <p className="text-xs font-medium text-ink-500">Una fila por cada</p>
            <ColumnChips
              label="Columnas para agrupar"
              options={columnOptions}
              selected={group.columnIds}
              onChange={(columnIds) => set('group', { columnIds, aggregates: group.aggregates.filter((item) => !columnIds.includes(item.columnId)) })}
            />
            <div className="divide-y divide-ink-100 rounded-md border border-ink-200">
              {columns.filter((column) => !group.columnIds.includes(column.id) && column.source?.type !== 'ROW_NUMBER').map((column) => (
                <div key={column.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5">
                  <span className="text-sm text-ink-900">{column.outputName}</span>
                  <select
                    aria-label={`Resumen de ${column.outputName}`}
                    className="h-8 rounded-md border border-ink-200 bg-white px-2 text-sm"
                    value={aggregateOf.get(column.id) || 'FIRST'}
                    onChange={(event) => {
                      const others = group.aggregates.filter((item) => item.columnId !== column.id);
                      set('group', { ...group, aggregates: event.target.value === 'FIRST' ? others : [...others, { columnId: column.id, op: event.target.value }] });
                    }}
                  >
                    {AGGREGATE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </>
        ) : null}
      </StepCard>

      <StepCard
        icon={ArrowDownUp}
        title="Ordenar"
        description="Ordena el archivo final por una o más columnas. Los números y fechas se ordenan por su valor."
        enabled={Boolean(steps.sort)}
        onToggle={(on) => set('sort', on && firstId ? [{ columnId: firstId, direction: 'ASC' }] : undefined)}
      >
        {(steps.sort || []).map((key, index) => (
          <div key={index} className="flex flex-wrap items-center gap-2">
            <span className="w-16 text-sm text-ink-500">{index === 0 ? 'Por' : 'luego por'}</span>
            <select aria-label={`Ordenar por ${index + 1}`} className={`${selectClass} min-w-0 flex-1`} value={key.columnId} onChange={(event) => set('sort', steps.sort.map((current, position) => (position === index ? { ...current, columnId: event.target.value } : current)))}>
              {columnOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            <select aria-label={`Dirección ${index + 1}`} className={selectClass} value={key.direction} onChange={(event) => set('sort', steps.sort.map((current, position) => (position === index ? { ...current, direction: event.target.value } : current)))}>
              <option value="ASC">De menor a mayor (A→Z)</option>
              <option value="DESC">De mayor a menor (Z→A)</option>
            </select>
            <button type="button" aria-label={`Quitar orden ${index + 1}`} className={removeButton} disabled={steps.sort.length === 1} onClick={() => set('sort', steps.sort.filter((_, position) => position !== index))}>
              <X size={15} aria-hidden="true" />
            </button>
          </div>
        ))}
        {steps.sort ? (
          <button
            type="button"
            className={addButton}
            disabled={steps.sort.length >= 5 || steps.sort.length >= columns.length}
            onClick={() => set('sort', [...steps.sort, { columnId: columns.find((column) => !steps.sort.some((key) => key.columnId === column.id))?.id || firstId, direction: 'ASC' }])}
          >
            <Plus size={15} aria-hidden="true" />
            Otro criterio
          </button>
        ) : null}
      </StepCard>
    </div>
  );
}

// One line under the preview explaining what the row steps did with the sample rows.
export function RowStepsNote({ preview, sampleCount }) {
  if (!preview) return null;
  const { stats, excluded } = preview;
  const parts = [
    excluded.length ? `${excluded.length} ${excluded.length === 1 ? 'fila quedó fuera' : 'filas quedaron fuera'} por el filtro (${excluded.map((row) => row.rowNumber).join(', ')})` : null,
    stats.duplicateRows ? `${stats.duplicateRows} ${stats.duplicateRows === 1 ? 'duplicada quitada' : 'duplicadas quitadas'}` : null,
    preview.results.some((row) => row.rowNumbers?.length > 1) ? 'filas agrupadas' : null
  ].filter(Boolean);
  if (!parts.length) return null;
  return <p className="mb-2 text-xs text-ink-500">Con las {sampleCount} filas de ejemplo: {parts.join(' · ')}.</p>;
}

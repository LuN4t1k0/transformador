'use client';

import { useState } from 'react';
import { AlertCircle, ArrowDown, ArrowUp, Check, CheckCircle2, ChevronDown, Copy, LayoutList, ListFilter, Plus, Rows3, Trash2 } from 'lucide-react';
import { maskValue } from '../../lib/preview';
import { createColumn, duplicateColumn, formatCell, moveColumn, splitColumn, splitNameColumn } from '../../lib/template-editor';
import { describeIssue, describeSource, describeTransformations } from '../../lib/templates';
import { StatusPill } from '../status-pill';
import { FormatEditor } from './format-editor';
import { defaultCalc } from './calc-editor';
import { convertSource } from './source-editor';
import { inputClass, SourceEditor } from './source-editor';
import { useTemplateParameters } from './parameters-context';

const iconButton = 'flex h-8 w-8 items-center justify-center rounded-md text-ink-500 hover:bg-ink-100 hover:text-ink-900 disabled:opacity-30 disabled:hover:bg-transparent';

function sourceSample(values, source) {
  if (!values) return null;
  if (source.type === 'COLUMN' || source.type === 'NAME_PART' || source.type.startsWith('SPLIT')) return values[source.column];
  if (source.type === 'CONSTANT') return source.value;
  if (source.type === 'CONCAT') return source.parts.map((part) => (part.type === 'COLUMN' ? formatCell(values[part.column]) : part.value)).filter(Boolean).join(source.separator);
  if (['CALC', 'CASE', 'MAP', 'COALESCE', 'TEMPLATE', 'DATE_CALC', 'ROW_NUMBER'].includes(source.type)) return 'regla';
  if (source.type === 'PARAM') return 'parámetro';
  return null;
}

function SampleLine({ column, sample }) {
  if (!sample) return null;
  const mask = (value) => maskValue(column, formatCell(value, column));
  const input = mask(sourceSample(sample.values, column.source));
  const output = mask(sample.result.output[column.outputName]);
  const issues = sample.result.issues.filter((issue) => issue.column === column.outputName);

  return (
    <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs">
      <span className="text-ink-400">Ejemplo:</span>
      <span className="max-w-[40ch] truncate text-ink-500">{input || '—'}</span>
      <span className="text-ink-400" aria-hidden="true">→</span>
      <span className="sr-only">resultado</span>
      <span className={`max-w-[40ch] truncate font-mono ${issues.some((issue) => issue.severity === 'error') ? 'text-rose-700' : 'font-semibold text-ink-900'}`}>{output || '—'}</span>
      {issues.map((issue) => (
        <span key={issue.code} className="inline-flex items-center gap-1 text-rose-700">
          <AlertCircle size={12} aria-hidden="true" />
          {describeIssue(issue)}
        </span>
      ))}
    </p>
  );
}

function FixedWidthEditor({ idPrefix, column, onChange }) {
  const fixedWidth = column.fixedWidth || { length: 10, align: 'LEFT', padChar: ' ' };
  const set = (changes) => onChange({ ...column, fixedWidth: { ...fixedWidth, ...changes } });
  const labelClass = 'mb-1 block text-xs font-medium text-ink-500';

  return (
    <div className="grid grid-cols-3 gap-2 sm:max-w-md">
      <div>
        <label className={labelClass} htmlFor={`${idPrefix}-length`}>Largo</label>
        <input id={`${idPrefix}-length`} type="number" min={1} max={1000} className={inputClass} value={fixedWidth.length} onChange={(event) => set({ length: Math.max(1, Math.min(1000, Number(event.target.value) || 1)) })} />
      </div>
      <div>
        <label className={labelClass} htmlFor={`${idPrefix}-align`}>Alinear</label>
        <select id={`${idPrefix}-align`} className={inputClass} value={fixedWidth.align} onChange={(event) => set({ align: event.target.value })}>
          <option value="LEFT">Izquierda</option>
          <option value="RIGHT">Derecha</option>
        </select>
      </div>
      <div>
        <label className={labelClass} htmlFor={`${idPrefix}-pad`}>Rellenar con</label>
        <select id={`${idPrefix}-pad`} className={inputClass} value={fixedWidth.padChar} onChange={(event) => set({ padChar: event.target.value })}>
          <option value=" ">Espacios</option>
          <option value="0">Ceros</option>
        </select>
      </div>
    </div>
  );
}

// Direct mapping from the row: pick the file column (or leave empty / use a fixed value) without opening the editor.
function InlineSourceSelect({ column, headers, outputNames, onChange, onExpand }) {
  const parameters = useTemplateParameters();
  const { source } = column;
  if (!['COLUMN', 'EMPTY'].includes(source.type)) {
    return <span className="block truncate text-xs text-ink-700" title={describeSource(source, outputNames)}>{describeSource(source, outputNames)}</span>;
  }
  const value = source.type === 'COLUMN' ? source.column : '';
  const isMissing = value && !headers.includes(value);

  return (
    <select
      aria-label={`Origen de ${column.outputName}`}
      className={`h-8 w-full min-w-0 rounded-md border bg-white px-2 text-xs ${value ? 'border-ink-200 text-ink-900' : 'border-rose-200 text-rose-700'}`}
      value={value}
      onChange={(event) => {
        const choice = event.target.value;
        if (choice === '__constant') {
          onChange({ ...column, source: { type: 'CONSTANT', value: '' }, reviewed: false }, { sourceChanged: true });
          onExpand();
        } else if (choice === '__empty') {
          onChange({ ...column, source: { type: 'EMPTY' }, reviewed: false }, { sourceChanged: true });
        } else if (choice === '__calc') {
          onChange({ ...column, source: defaultCalc(headers[0]), transformations: [], reviewed: false }, { sourceChanged: true });
          onExpand();
        } else if (choice.startsWith('__param:')) {
          onChange({ ...column, source: { type: 'PARAM', paramId: choice.slice(8) }, reviewed: false }, { sourceChanged: true });
        } else if (choice.startsWith('__rule:')) {
          onChange({ ...column, source: convertSource(source, choice.slice(7), headers), transformations: [], reviewed: false }, { sourceChanged: true });
          onExpand();
        } else if (choice === '__more') {
          onExpand();
        } else if (choice) {
          onChange({ ...column, source: { type: 'COLUMN', column: choice }, reviewed: false }, { sourceChanged: true });
        }
      }}
    >
      <option value="">{value ? 'Sin origen' : '¿De qué columna sale?'}</option>
      {isMissing ? <option value={value}>{value} (no está en el archivo)</option> : null}
      <optgroup label="Columnas de tu archivo">
        {headers.map((header) => <option key={header} value={header}>{header}</option>)}
      </optgroup>
      {parameters.length ? (
        <optgroup label="Parámetros (se piden al generar)">
          {parameters.map((parameter) => <option key={parameter.id} value={`__param:${parameter.id}`}>{parameter.name}</option>)}
        </optgroup>
      ) : null}
      <optgroup label="Otras opciones">
        <option value="__constant">Valor fijo…</option>
        <option value="__calc">Cálculo (%, suma, resta…)…</option>
        <option value="__rule:CASE">Condición (si… entonces…)…</option>
        <option value="__rule:MAP">Tabla de equivalencias…</option>
        <option value="__rule:COALESCE">Primer valor no vacío…</option>
        <option value="__rule:TEMPLATE">Texto con variables…</option>
        <option value="__rule:DATE_CALC">Operación con fechas…</option>
        <option value="__rule:ROW_NUMBER">Número correlativo</option>
        <option value="__rule:NAME_PART">Apellidos o nombres de un nombre completo…</option>
        <option value="__more">Unir o separar columnas…</option>
        {source.type !== 'EMPTY' ? <option value="__empty">Dejar vacía</option> : null}
      </optgroup>
    </select>
  );
}

// One-line summary of a column; expands into the full editor.
function CompactRow({ column, index, row, sample, headers, outputNames, flag, onToggle, onConfirm, onChange, onExpand, onFlagResolve }) {
  const status = row?.status;
  const mask = (value) => maskValue(column, formatCell(value, column));
  const output = sample ? mask(sample.result.output[column.outputName]) : '';
  const hasError = sample?.result.issues.some((issue) => issue.column === column.outputName && issue.severity === 'error');
  const tone = status === 'FALTANTE' ? 'bg-rose-50/60' : status === 'REQUIERE_CONFIRMACION' ? 'bg-amber-50/60' : 'bg-white';

  return (
    <li className={`grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-3 py-2 sm:grid-cols-[28px_minmax(0,1.2fr)_minmax(0,1.4fr)_minmax(0,1fr)_216px] ${tone}`}>
      <span className="text-right text-xs tabular-nums text-ink-400">{index + 1}</span>
      <span className="min-w-0">
        <span className="block break-words text-sm font-medium text-ink-900 sm:truncate">{column.outputName}{column.required ? <span className="ml-1 text-ink-400" title="Obligatoria">*</span> : null}</span>
        {headers ? null : <span className="block truncate text-xs text-ink-500 sm:hidden">{describeSource(column.source, outputNames)}</span>}
      </span>
      {headers ? (
        <span className="order-last col-span-full min-w-0 pl-10 sm:order-none sm:col-span-1 sm:pl-0">
          <InlineSourceSelect column={column} headers={headers} outputNames={outputNames} onChange={onChange} onExpand={onExpand} />
          {describeTransformations(column).length ? <span className="mt-0.5 block truncate text-[11px] text-ink-500">{describeTransformations(column).join(' · ')}</span> : null}
        </span>
      ) : (
        <span className="hidden min-w-0 truncate text-xs text-ink-500 sm:block" title={[describeSource(column.source, outputNames), ...describeTransformations(column)].join(' · ')}>
          {describeSource(column.source, outputNames)}{describeTransformations(column).length ? ` · ${describeTransformations(column).join(' · ')}` : ''}
        </span>
      )}
      <span className={`hidden min-w-0 truncate font-mono text-xs sm:block ${hasError ? 'text-rose-700' : 'text-ink-900'}`}>{output || <span className="text-ink-300">—</span>}</span>
      <span className="flex items-center justify-end gap-1">
        {flag && status === 'OK' ? (
          <>
            <span className="inline-flex h-6 items-center rounded-full bg-amber-50 px-2 text-xs font-semibold text-amber-700 ring-1 ring-inset ring-amber-200" title="Sugerida por un nombre de columna parecido: revisa que sea correcta">{flag}</span>
            <button type="button" className="inline-flex h-7 items-center gap-1 rounded-md border border-amber-200 bg-white px-2 text-xs font-semibold text-amber-700 hover:bg-amber-50" onClick={() => onFlagResolve(column.id)}>
              <Check size={13} aria-hidden="true" />Está bien
            </button>
          </>
        ) : null}
        {status && status !== 'OK' ? <StatusPill value={status} /> : null}
        {status === 'REQUIERE_CONFIRMACION' && onConfirm ? (
          <button type="button" className="inline-flex h-7 items-center gap-1 rounded-md border border-amber-200 bg-white px-2 text-xs font-semibold text-amber-700 hover:bg-amber-50" onClick={() => onConfirm(column.id)}>
            <Check size={13} aria-hidden="true" />Confirmar
          </button>
        ) : null}
        <button type="button" className={iconButton} aria-label={`Editar ${column.outputName}`} aria-expanded={false} onClick={onToggle}>
          <ChevronDown size={16} aria-hidden="true" />
        </button>
      </span>
      {row?.reason ? <span className="order-last col-span-full pl-10 text-xs text-ink-700">{row.reason}</span> : null}
    </li>
  );
}

// The selected column in the workbench: its first rows, from the file to the final value, next to its settings.
function SampleTable({ column, rows }) {
  const mask = (value) => maskValue(column, formatCell(value, column));
  return (
    <div className="mt-2 overflow-hidden rounded-md border border-ink-200 bg-white text-xs">
      <table className="w-full table-fixed border-collapse">
        <thead className="bg-ink-50 text-left text-ink-500">
          <tr>
            <th scope="col" className="px-2 py-1 font-medium">En tu archivo</th>
            <th scope="col" className="px-2 py-1 font-medium">En el archivo final</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ values, result }) => {
            const issues = result.issues.filter((issue) => issue.column === column.outputName);
            const hasError = issues.some((issue) => issue.severity === 'error');
            return (
              <tr key={result.rowNumber} className="border-t border-ink-100 align-top">
                <td className="truncate px-2 py-1 text-ink-500">{mask(sourceSample(values, column.source)) || '—'}</td>
                <td className={`px-2 py-1 font-mono ${hasError ? 'text-rose-700' : 'font-semibold text-ink-900'}`}>
                  <span className="block truncate">{mask(result.output[column.outputName]) || '—'}</span>
                  {issues.map((issue) => (
                    <span key={issue.code} className="flex items-center gap-1 font-sans font-normal text-rose-700">
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
  );
}

function ColumnCard({ column, index, total, row, sample, sampleRows = null, headers, suggestions, outputColumns, outputNames, isFixedWidth, isExpanded, onToggle, onChange, onMove, onDuplicate, onSplit, onSplitName, onRemove, onConfirm, collapsible = true }) {
  const idPrefix = `column-${column.id}`;
  const status = row?.status;
  const tone = status === 'FALTANTE' ? 'border-rose-200 bg-rose-50/40' : status === 'REQUIERE_CONFIRMACION' ? 'border-amber-200 bg-amber-50/40' : 'border-ink-200 bg-white';
  const formats = describeTransformations(column);

  return (
    <li className={`rounded-lg border ${tone}`}>
      <div className="flex flex-wrap items-start gap-2 p-3">
        <span className="mt-2 w-6 shrink-0 text-right text-xs tabular-nums text-ink-400">{index + 1}</span>
        <div className="min-w-0 flex-1 basis-60">
          <label className="sr-only" htmlFor={`${idPrefix}-name`}>Nombre de la columna {index + 1}</label>
          <input
            id={`${idPrefix}-name`}
            className="h-9 w-full min-w-0 rounded-md border border-transparent bg-transparent px-2 text-sm font-semibold text-ink-900 hover:border-ink-200 focus:border-ink-300 focus:bg-white"
            value={column.outputName}
            onChange={(event) => onChange({ ...column, outputName: event.target.value })}
          />
          <p className="px-2 text-xs text-ink-500">
            {describeSource(column.source, outputNames)}
            {formats.length ? ` · ${formats.join(' · ')}` : ''}
            {isFixedWidth && column.fixedWidth ? ` · ${column.fixedWidth.length} caracteres` : ''}
          </p>
          <div className="px-2">{sampleRows?.length > 1 ? <SampleTable column={column} rows={sampleRows} /> : <SampleLine column={column} sample={sample} />}</div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <label className="mr-1 inline-flex items-center gap-1.5 text-xs text-ink-700">
            <input type="checkbox" className="h-4 w-4 accent-cobalt-600" checked={column.required} onChange={(event) => onChange({ ...column, required: event.target.checked })} />
            Obligatoria
          </label>
          {status ? <StatusPill value={status} /> : null}
          <button type="button" className={iconButton} aria-label={`Subir ${column.outputName}`} disabled={index === 0} onClick={() => onMove(-1)}><ArrowUp size={15} aria-hidden="true" /></button>
          <button type="button" className={iconButton} aria-label={`Bajar ${column.outputName}`} disabled={index === total - 1} onClick={() => onMove(1)}><ArrowDown size={15} aria-hidden="true" /></button>
          <button type="button" className={iconButton} aria-label={`Duplicar ${column.outputName}`} onClick={onDuplicate}><Copy size={15} aria-hidden="true" /></button>
          <button type="button" className={`${iconButton} hover:text-rose-700`} aria-label={`Eliminar ${column.outputName}`} disabled={total === 1} onClick={onRemove}><Trash2 size={15} aria-hidden="true" /></button>
          {collapsible ? (
            <button type="button" className={iconButton} aria-label={isExpanded ? `Cerrar ${column.outputName}` : `Editar ${column.outputName}`} aria-expanded={isExpanded} onClick={onToggle}>
              <ChevronDown size={16} className={isExpanded ? 'rotate-180 transition-transform' : 'transition-transform'} aria-hidden="true" />
            </button>
          ) : null}
        </div>

        {row?.reason || row?.note ? (
          <div className="flex w-full flex-wrap items-center gap-2 pl-8 text-xs">
            <span className={row.reason ? 'text-ink-700' : 'text-ink-500'}>{row.reason || row.note}</span>
            {status === 'REQUIERE_CONFIRMACION' && onConfirm ? (
              <button type="button" className="inline-flex h-7 items-center gap-1 rounded-md border border-amber-200 bg-white px-2 font-semibold text-amber-700 hover:bg-amber-50" onClick={() => onConfirm(column.id)}>
                <Check size={13} aria-hidden="true" />
                Confirmar
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {isExpanded ? (
        <div className="space-y-4 border-t border-ink-100 bg-white px-3 py-4 sm:pl-11">
          <SourceEditor idPrefix={idPrefix} source={column.source} headers={headers} suggestions={suggestions} outputColumns={outputColumns} onChange={(source) => onChange({ ...column, source, reviewed: false }, { sourceChanged: true })} onSplitName={onSplitName} />
          {column.source.type === 'CALC'
            ? <p className="text-xs text-ink-500">El resultado de un cálculo es un número; el redondeo se define arriba.</p>
            : <FormatEditor idPrefix={idPrefix} column={column} onChange={(next) => onChange(next)} onSplit={onSplit} />}
          {isFixedWidth ? <FixedWidthEditor idPrefix={idPrefix} column={column} onChange={(next) => onChange(next)} /> : null}
        </div>
      ) : null}
    </li>
  );
}

const DOT = { OK: 'bg-mint-600', REQUIERE_CONFIRMACION: 'bg-amber-400', FALTANTE: 'bg-rose-600' };

// Editable list of output columns. `evaluation`, `sample` and `onConfirm` are optional (not available without a file).
// `flagged` (Map id → label) marks columns to double-check, e.g. suggested by a similar header name.
// `layout="workbench"`: a navigator on the left and the selected column's editor on the right, followed by
// `renderPreview()` (the live file). `selectedId` / `onSelect` keep the selection in the parent, so the preview
// can highlight and select columns too.
export function ColumnList({ columns, onChange, headers = null, suggestions = [], evaluation = null, onConfirm = null, onConfirmAll = null, sample = null, sampleRows = null, isFixedWidth = false, flagged = new Map(), onFlagResolve = () => {}, layout = 'list', selectedId = null, onSelect = () => {}, renderPreview = null }) {
  const [expandedId, setExpandedId] = useState(null);
  const [pendingOnly, setPendingOnly] = useState(false);
  const [compact, setCompact] = useState(columns.length > 8);
  const parameters = useTemplateParameters();
  // Names shown in summaries: columns by id, parameters as `param:<id>`.
  const outputNames = new Map([...columns.map((column) => [column.id, column.outputName]), ...parameters.map((parameter) => [`param:${parameter.id}`, parameter.name])]);
  const pendingIds = (evaluation?.rows || []).filter((row) => row.status === 'REQUIERE_CONFIRMACION').map((row) => row.column.id);
  const rowsById = new Map((evaluation?.rows || []).map((row) => [row.column.id, row]));
  const flaggedOk = columns.filter((column) => flagged.has(column.id) && (rowsById.get(column.id)?.status || 'OK') === 'OK').map((column) => column.id);
  const pendingCount = (evaluation ? evaluation.counts.pending + evaluation.counts.missing : 0) + flaggedOk.length;

  function replace(index, column, { sourceChanged = false } = {}) {
    const next = [...columns];
    next[index] = column;
    onChange(next, sourceChanged ? { unconfirm: column.id } : undefined);
  }

  function add() {
    const column = createColumn(columns, isFixedWidth);
    onChange([...columns, column]);
    setExpandedId(column.id);
    onSelect(column.id);
  }

  // Everything a column card can do, shared by both layouts.
  function cardProps(column, index) {
    return {
      column,
      index,
      total: columns.length,
      row: rowsById.get(column.id),
      sample,
      headers,
      suggestions,
      outputColumns: columns.slice(0, index),
      outputNames,
      isFixedWidth,
      onChange: (next, options) => replace(index, next, options),
      onMove: (delta) => onChange(moveColumn(columns, index, delta)),
      onDuplicate: () => {
        // Duplicating is explicit intent to reuse the same origin: no confirmation needed for either copy.
        const next = duplicateColumn(columns, index);
        onChange(next, { confirm: [column.id, next[index + 1].id] });
      },
      onSplit: (domain) => onChange(splitColumn(columns, index, domain)),
      onSplitName: (source) => {
        // Asked for explicitly: the three new columns need no further confirmation.
        const next = splitNameColumn(columns, index, source);
        onChange(next, { confirm: next.slice(index, index + 3).map((created) => created.id) });
      },
      onRemove: () => {
        onChange(columns.filter((_, columnIndex) => columnIndex !== index));
        onSelect(columns[index + 1]?.id || columns[index - 1]?.id || null);
      },
      onConfirm
    };
  }

  const bulkActions = (
    <>
      {flaggedOk.length > 1 ? (
        <button type="button" className="inline-flex h-9 items-center gap-1.5 rounded-md border border-amber-200 bg-white px-3 text-sm font-semibold text-amber-700 hover:bg-amber-50" onClick={() => flaggedOk.forEach(onFlagResolve)}>
          <CheckCircle2 size={15} aria-hidden="true" />
          Aceptar sugeridas ({flaggedOk.length})
        </button>
      ) : null}
      {onConfirmAll && pendingIds.length > 1 ? (
        <button type="button" className="inline-flex h-9 items-center gap-1.5 rounded-md border border-amber-200 bg-white px-3 text-sm font-semibold text-amber-700 hover:bg-amber-50" onClick={() => onConfirmAll(pendingIds)}>
          <CheckCircle2 size={15} aria-hidden="true" />
          Confirmar todas ({pendingIds.length})
        </button>
      ) : null}
    </>
  );

  if (layout === 'workbench') {
    const selectedIndex = Math.max(0, columns.findIndex((column) => column.id === selectedId));
    const selected = columns[selectedIndex];
    return (
      <div className="grid gap-5 xl:grid-cols-[248px_minmax(0,1fr)]">
        <div className="space-y-3 xl:sticky xl:top-24 xl:self-start">
          <p className="text-sm text-ink-500">{columns.length} columnas, en el orden del archivo final.</p>
          <ol aria-label="Columnas del archivo final" className="max-h-[60vh] overflow-y-auto rounded-md border border-ink-200 bg-white">
            {columns.map((column, index) => {
              const status = rowsById.get(column.id)?.status || null;
              const dot = flagged.has(column.id) && (status || 'OK') === 'OK' ? DOT.REQUIERE_CONFIRMACION : DOT[status];
              const isSelected = column.id === selected?.id;
              return (
                <li key={column.id} className="border-b border-ink-100 last:border-b-0">
                  <button
                    type="button"
                    aria-current={isSelected ? 'true' : undefined}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${isSelected ? 'bg-amber-100 font-semibold text-ink-900' : 'text-ink-700 hover:bg-ink-50'}`}
                    onClick={() => onSelect(column.id)}
                  >
                    <span className="w-5 shrink-0 text-right font-mono text-[11px] text-ink-400">{index + 1}</span>
                    <span className="min-w-0 flex-1 truncate">{column.outputName}</span>
                    {dot ? <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${dot}`} /> : null}
                  </button>
                </li>
              );
            })}
          </ol>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="inline-flex h-9 items-center gap-1.5 rounded-md border border-ink-200 bg-white px-3 text-sm font-semibold text-ink-700 hover:bg-ink-50" onClick={add}>
              <Plus size={15} aria-hidden="true" />
              Agregar columna
            </button>
            {bulkActions}
          </div>
        </div>
        <div className="min-w-0 space-y-6">
          {selected ? (
            <ul aria-label="Columna seleccionada">
              <ColumnCard key={selected.id} {...cardProps(selected, selectedIndex)} sampleRows={sampleRows} isExpanded collapsible={false} onToggle={() => {}} />
            </ul>
          ) : null}
          {renderPreview ? renderPreview() : null}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink-500">{columns.length} columnas en el archivo final, en este orden.</p>
        <div className="flex flex-wrap gap-2">
          <div className="inline-flex rounded-md border border-ink-200 p-0.5" role="group" aria-label="Vista de columnas">
            <button type="button" aria-pressed={compact} title="Vista compacta" className={`flex h-8 w-8 items-center justify-center rounded ${compact ? 'bg-cobalt-50 text-cobalt-700' : 'text-ink-500 hover:bg-ink-50'}`} onClick={() => setCompact(true)}>
              <Rows3 size={15} aria-hidden="true" /><span className="sr-only">Vista compacta</span>
            </button>
            <button type="button" aria-pressed={!compact} title="Vista detallada" className={`flex h-8 w-8 items-center justify-center rounded ${!compact ? 'bg-cobalt-50 text-cobalt-700' : 'text-ink-500 hover:bg-ink-50'}`} onClick={() => setCompact(false)}>
              <LayoutList size={15} aria-hidden="true" /><span className="sr-only">Vista detallada</span>
            </button>
          </div>
          {bulkActions}
          {evaluation || flagged.size ? (
            <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-ink-200 px-3 text-sm font-medium text-ink-700 hover:bg-ink-50">
              <input type="checkbox" className="h-4 w-4 accent-cobalt-600" checked={pendingOnly} onChange={(event) => setPendingOnly(event.target.checked)} />
              <ListFilter size={15} aria-hidden="true" />
              Solo pendientes ({pendingCount})
            </label>
          ) : null}
          <button type="button" className="inline-flex h-9 items-center gap-1.5 rounded-md border border-ink-200 bg-white px-3 text-sm font-semibold text-ink-700 hover:bg-ink-50" onClick={add}>
            <Plus size={15} aria-hidden="true" />
            Agregar columna
          </button>
        </div>
      </div>

      <ul className={compact ? 'divide-y divide-ink-100 overflow-hidden rounded-lg border border-ink-200' : 'space-y-2'}>
        {columns.map((column, index) => {
          const row = rowsById.get(column.id);
          if (pendingOnly && (row?.status || 'OK') === 'OK' && !flagged.has(column.id)) return null;
          if (compact && expandedId !== column.id) {
            return (
              <CompactRow
                key={column.id}
                column={column}
                index={index}
                row={row}
                sample={sample}
                headers={headers}
                outputNames={outputNames}
                flag={flagged.get(column.id)}
                onConfirm={onConfirm}
                onToggle={() => setExpandedId(column.id)}
                onExpand={() => setExpandedId(column.id)}
                onChange={(next, options) => replace(index, next, options)}
                onFlagResolve={onFlagResolve}
              />
            );
          }
          return (
            <ColumnCard
              key={column.id}
              {...cardProps(column, index)}
              isExpanded={expandedId === column.id}
              onToggle={() => setExpandedId(expandedId === column.id ? null : column.id)}
            />
          );
        })}
      </ul>
    </div>
  );
}

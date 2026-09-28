'use client';

import { useState } from 'react';
import { AlertCircle, ArrowDown, ArrowUp, Check, ChevronDown, Copy, ListFilter, Plus, Trash2 } from 'lucide-react';
import { maskRut } from '../../lib/preview';
import { createColumn, duplicateColumn, formatCell, isRutColumn, moveColumn } from '../../lib/template-editor';
import { describeIssue, describeSource, describeTransformations } from '../../lib/templates';
import { StatusPill } from '../status-pill';
import { FormatEditor } from './format-editor';
import { inputClass, SourceEditor } from './source-editor';

const iconButton = 'flex h-8 w-8 items-center justify-center rounded-md text-ink-500 hover:bg-ink-100 hover:text-ink-900 disabled:opacity-30 disabled:hover:bg-transparent';

function sourceSample(values, source) {
  if (!values) return null;
  if (source.type === 'COLUMN' || source.type.startsWith('SPLIT')) return values[source.column];
  if (source.type === 'CONSTANT') return source.value;
  if (source.type === 'CONCAT') return source.parts.map((part) => (part.type === 'COLUMN' ? formatCell(values[part.column]) : part.value)).filter(Boolean).join(source.separator);
  return null;
}

function SampleLine({ column, sample }) {
  if (!sample) return null;
  const mask = (value) => (isRutColumn(column) && value ? maskRut(formatCell(value)) : formatCell(value));
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

function ColumnCard({ column, index, total, row, sample, headers, suggestions, isFixedWidth, isExpanded, onToggle, onChange, onMove, onDuplicate, onRemove, onConfirm }) {
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
            {describeSource(column.source)}
            {formats.length ? ` · ${formats.join(' · ')}` : ''}
            {isFixedWidth && column.fixedWidth ? ` · ${column.fixedWidth.length} caracteres` : ''}
          </p>
          <div className="px-2"><SampleLine column={column} sample={sample} /></div>
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
          <button type="button" className={iconButton} aria-label={isExpanded ? `Cerrar ${column.outputName}` : `Editar ${column.outputName}`} aria-expanded={isExpanded} onClick={onToggle}>
            <ChevronDown size={16} className={isExpanded ? 'rotate-180 transition-transform' : 'transition-transform'} aria-hidden="true" />
          </button>
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
          <SourceEditor idPrefix={idPrefix} source={column.source} headers={headers} suggestions={suggestions} onChange={(source) => onChange({ ...column, source, reviewed: false }, { sourceChanged: true })} />
          <FormatEditor idPrefix={idPrefix} column={column} onChange={(next) => onChange(next)} />
          {isFixedWidth ? <FixedWidthEditor idPrefix={idPrefix} column={column} onChange={(next) => onChange(next)} /> : null}
        </div>
      ) : null}
    </li>
  );
}

// Editable list of output columns. `evaluation`, `sample` and `onConfirm` are optional (not available without a file).
export function ColumnList({ columns, onChange, headers = null, suggestions = [], evaluation = null, onConfirm = null, sample = null, isFixedWidth = false }) {
  const [expandedId, setExpandedId] = useState(null);
  const [pendingOnly, setPendingOnly] = useState(false);
  const rowsById = new Map((evaluation?.rows || []).map((row) => [row.column.id, row]));
  const pendingCount = evaluation ? evaluation.counts.pending + evaluation.counts.missing : 0;

  function replace(index, column, { sourceChanged = false } = {}) {
    const next = [...columns];
    next[index] = column;
    onChange(next, sourceChanged ? { unconfirm: column.id } : undefined);
  }

  function add() {
    const column = createColumn(columns, isFixedWidth);
    onChange([...columns, column]);
    setExpandedId(column.id);
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink-500">{columns.length} columnas en el archivo final, en este orden.</p>
        <div className="flex flex-wrap gap-2">
          {evaluation ? (
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

      <ul className="space-y-2">
        {columns.map((column, index) => {
          const row = rowsById.get(column.id);
          if (pendingOnly && row?.status === 'OK') return null;
          return (
            <ColumnCard
              key={column.id}
              column={column}
              index={index}
              total={columns.length}
              row={row}
              sample={sample}
              headers={headers}
              suggestions={suggestions}
              isFixedWidth={isFixedWidth}
              isExpanded={expandedId === column.id}
              onToggle={() => setExpandedId(expandedId === column.id ? null : column.id)}
              onChange={(next, options) => replace(index, next, options)}
              onMove={(delta) => onChange(moveColumn(columns, index, delta))}
              onDuplicate={() => {
                // Duplicating is explicit intent to reuse the same origin: no confirmation needed for either copy.
                const next = duplicateColumn(columns, index);
                onChange(next, { confirm: [column.id, next[index + 1].id] });
              }}
              onRemove={() => onChange(columns.filter((_, columnIndex) => columnIndex !== index))}
              onConfirm={onConfirm}
            />
          );
        })}
      </ul>
    </div>
  );
}

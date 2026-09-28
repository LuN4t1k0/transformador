'use client';

import { useState } from 'react';
import { Check, CheckCircle2, ListFilter } from 'lucide-react';
import { MAPPING_STATUS } from '../lib/mapping';
import { describeSource, describeTransformations } from '../lib/templates';
import { StatusPill } from './status-pill';

export function MappingCounts({ counts }) {
  return (
    <span className="flex flex-wrap gap-1.5">
      {counts.pending ? <StatusPill value={MAPPING_STATUS.REQUIERE_CONFIRMACION} label={`${counts.pending} por confirmar`} /> : null}
      {counts.missing ? <StatusPill value={MAPPING_STATUS.FALTANTE} label={`${counts.missing} sin origen`} /> : null}
      {!counts.pending && !counts.missing ? <StatusPill value={MAPPING_STATUS.OK} label="Todo resuelto" /> : null}
    </span>
  );
}

function MappingSummary({ counts }) {
  const percent = Math.round((counts.ok / counts.total) * 100);

  return (
    <div className="mb-4 rounded-md border border-ink-200 bg-ink-50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="font-semibold text-ink-900">{counts.ok} de {counts.total} campos listos</span>
        <MappingCounts counts={counts} />
      </div>
      <div
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink-200"
        role="progressbar"
        aria-label="Campos listos"
        aria-valuenow={counts.ok}
        aria-valuemin={0}
        aria-valuemax={counts.total}
      >
        <div className="h-full rounded-full bg-mint-600 transition-[width]" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function MappingRow({ row, detectedColumns, onChange, onConfirm }) {
  const { column, entry, status, reason } = row;
  const selectId = `mapping-${column.id}`;
  const transformations = describeTransformations(column);
  const sourceNote = describeSource(entry);
  const tone = status === MAPPING_STATUS.FALTANTE
    ? 'bg-rose-50/60'
    : status === MAPPING_STATUS.REQUIERE_CONFIRMACION ? 'bg-amber-50/60' : '';

  return (
    <li className={`grid gap-3 p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_128px] md:items-start ${tone}`}>
      <div className="min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="text-xs tabular-nums text-ink-400">{column.position}</span>
          <label htmlFor={selectId} className="text-sm font-semibold text-ink-900">{column.outputName}</label>
          {column.required ? <span className="text-xs text-ink-500">Requerido</span> : <span className="text-xs text-ink-400">Opcional</span>}
        </div>
        {transformations.length ? (
          <ul className="mt-1.5 flex flex-wrap gap-1" aria-label="Transformaciones aplicadas">
            {transformations.map((label) => (
              <li key={label} className="rounded bg-ink-100 px-1.5 py-0.5 text-xs text-ink-700">{label}</li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="min-w-0">
        <select
          id={selectId}
          className="h-10 w-full rounded-md border border-ink-200 bg-white px-3 text-sm text-ink-900"
          value={entry.type === 'EMPTY' ? '' : entry.column}
          aria-describedby={reason ? `${selectId}-reason` : undefined}
          onChange={(event) => onChange(column, event.target.value)}
        >
          <option value="">{column.required ? 'Sin origen' : 'Dejar vacía'}</option>
          {detectedColumns.map((detected) => (
            <option key={detected} value={detected}>{detected}</option>
          ))}
        </select>
        {sourceNote ? <p className="mt-1 text-xs text-ink-500">{sourceNote}</p> : null}
      </div>

      <div className="flex items-center gap-2 md:flex-col md:items-end">
        <StatusPill value={status} />
        {status === MAPPING_STATUS.REQUIERE_CONFIRMACION ? (
          <button
            type="button"
            className="inline-flex h-7 items-center gap-1 rounded-md border border-amber-200 bg-white px-2 text-xs font-semibold text-amber-700 hover:bg-amber-50"
            onClick={() => onConfirm(column.id)}
          >
            <Check size={13} aria-hidden="true" />
            Confirmar
          </button>
        ) : null}
      </div>

      {reason && status !== MAPPING_STATUS.OK ? (
        <p id={`${selectId}-reason`} className="text-xs text-ink-700 md:col-span-3">{reason}</p>
      ) : null}
    </li>
  );
}

export function MappingEditor({ evaluation, detectedColumns, onChange, onConfirm }) {
  const [showPendingOnly, setShowPendingOnly] = useState(false);
  const pendingCount = evaluation.counts.pending + evaluation.counts.missing;
  const rows = showPendingOnly
    ? evaluation.rows.filter((row) => row.status !== MAPPING_STATUS.OK)
    : evaluation.rows;

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-ink-200 px-3 text-sm font-medium text-ink-700 hover:bg-ink-50">
          <input
            type="checkbox"
            className="h-4 w-4 accent-cobalt-600"
            checked={showPendingOnly}
            onChange={(event) => setShowPendingOnly(event.target.checked)}
          />
          <ListFilter size={15} aria-hidden="true" />
          Solo pendientes ({pendingCount})
        </label>
      </div>

      <MappingSummary counts={evaluation.counts} />

      {rows.length ? (
        <ul className="divide-y divide-ink-100 overflow-hidden rounded-lg border border-ink-200">
          {rows.map((row) => (
            <MappingRow
              key={row.column.id}
              row={row}
              detectedColumns={detectedColumns}
              onChange={onChange}
              onConfirm={onConfirm}
            />
          ))}
        </ul>
      ) : (
        <div className="flex flex-col items-center rounded-lg border border-mint-100 bg-mint-50 px-4 py-8 text-center">
          <CheckCircle2 className="text-mint-600" size={24} aria-hidden="true" />
          <p className="mt-2 text-sm font-semibold text-ink-900">No quedan campos pendientes</p>
          <p className="mt-1 text-sm text-ink-500">Puedes revisar la vista previa.</p>
        </div>
      )}
    </div>
  );
}

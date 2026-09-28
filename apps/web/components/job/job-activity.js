'use client';

import { useEffect, useState } from 'react';
import { History } from 'lucide-react';
import { api } from '../../lib/api';
import { formatDateTime } from '../job-status';

const LABELS = {
  JOB_CREATED: (m) => `Subió «${m.fileName}»`,
  ANALYSIS_COMPLETED: (m) => `Análisis completado (${m.sheets} ${m.sheets === 1 ? 'hoja' : 'hojas'})`,
  ANALYSIS_FAILED: (m) => `El análisis falló (${m.code})`,
  HEADER_ROW_CHANGED: (m) => `Cambió la fila de encabezados de «${m.sheet}» a la ${m.headerRow}`,
  SHEET_SELECTED: (m) => `Eligió la hoja «${m.sheet}»`,
  TEMPLATE_APPLIED: (m) => (m.blank ? 'Creó una plantilla nueva desde el archivo' : `Aplicó la plantilla «${m.name}» v${m.version}`),
  TEMPLATE_SAVED_FROM_JOB: (m) => (m.mode === 'NEW_VERSION' ? `Guardó la versión ${m.version} de «${m.name}»` : `Guardó la plantilla nueva «${m.name}»`),
  TRANSFORM_REQUESTED: (m) => `Inició la generación (${m.rows} filas, modo ${m.mode === 'STRICT' ? 'estricto' : 'flexible'})`,
  TRANSFORM_COMPLETED: (m) => `Archivo generado: ${m.validRows} de ${m.totalRows} filas${m.rejectedRows ? `, ${m.rejectedRows} rechazadas` : ''} en ${(m.durationMs / 1000).toFixed(1)} s`,
  TRANSFORM_FAILED: (m) => `La generación falló (${m.code})`,
  JOB_CANCELLED: () => 'Canceló el proceso',
  FILE_DOWNLOADED: (m) => (m.file === 'rejects' ? 'Descargó las filas rechazadas' : 'Descargó el archivo generado'),
  FILES_PURGED: () => 'Eliminó los archivos temporales',
  JOB_EXPIRED: () => 'Los archivos expiraron y se eliminaron'
};

export function JobActivity({ job }) {
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState(null);

  useEffect(() => {
    if (!open) return undefined;
    let active = true;
    api.getJobActivity(job.id).then((list) => active && setEvents(list)).catch(() => active && setEvents([]));
    return () => {
      active = false;
    };
  }, [open, job.id, job.status, job.updatedAt]);

  return (
    <details className="rounded-lg border border-ink-200 bg-white" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-sm font-medium text-ink-700 hover:bg-ink-50">
        <History size={15} aria-hidden="true" />
        Actividad del job
      </summary>
      <ol className="space-y-2 border-t border-ink-100 px-4 py-3 text-sm">
        {!events ? <li className="text-ink-500">Cargando…</li> : null}
        {events && !events.length ? <li className="text-ink-500">Sin actividad registrada.</li> : null}
        {(events || []).map((event, index) => (
          <li key={`${event.type}-${index}`} className="flex flex-wrap gap-x-2">
            <span className="tabular-nums text-ink-400">{formatDateTime(event.createdAt)}</span>
            <span className="text-ink-900">{(LABELS[event.type] || (() => event.type))(event.metadata || {})}</span>
            {event.user ? <span className="text-ink-500">· {event.user}</span> : null}
          </li>
        ))}
      </ol>
    </details>
  );
}

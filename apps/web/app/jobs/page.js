'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, Download, History, Loader2, Repeat, Search, Trash2 } from 'lucide-react';
import { formatTime, JobStatusText } from '../../components/job-status';
import { buttonStyles, Notice } from '../../components/panel';
import { ConfirmDialog } from '../../components/confirm-dialog';
import { Shell } from '../../components/shell';
import { api } from '../../lib/api';
import { downloadBlob } from '../../lib/download';
import { ReuseUploadButton } from '../../components/reuse-upload-button';

const OPEN = new Set(['QUEUED_ANALYSIS', 'ANALYZING', 'READY', 'QUEUED_TRANSFORMATION', 'TRANSFORMING', 'VALIDATING', 'GENERATING', 'READY_TO_DOWNLOAD', 'DOWNLOADED']);
const CLOSED = new Set(['EXPIRED', 'PURGED', 'CANCELLED']);
const DOWNLOADABLE = new Set(['READY_TO_DOWNLOAD', 'DOWNLOADED']);
const FILTERS = [
  { id: 'open', label: 'Pendientes y listos', test: (job) => OPEN.has(job.status) },
  { id: 'failed', label: 'Con error', test: (job) => job.status === 'FAILED' },
  { id: 'all', label: 'Todos', test: () => true }
];
const quietLink = 'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-sm font-semibold text-cobalt-700 hover:underline';
const iconButton = 'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-ink-400 hover:bg-rose-50 hover:text-rose-700';

function dayLabel(date) {
  const day = new Date(date);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (day.toDateString() === today.toDateString()) return 'Hoy';
  if (day.toDateString() === yesterday.toDateString()) return 'Ayer';
  return day.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });
}

function groupByDay(jobs) {
  const groups = [];
  for (const job of jobs) {
    const label = dayLabel(job.createdAt);
    if (groups.at(-1)?.label !== label) groups.push({ label, jobs: [] });
    groups.at(-1).jobs.push(job);
  }
  return groups;
}

function templateLabel(job) {
  if (job.template) return `${job.template.name} v${job.template.version}`;
  return job.workingTemplate ? 'Plantilla nueva, sin guardar' : 'Sin plantilla elegida';
}

function JobRow({ job, onDownload, onDelete }) {
  const rows = job.summary?.rowSteps?.outputRows ?? job.summary?.validRows;
  return (
    <li className="flex items-center gap-3 border-b border-ink-100 py-3">
      <div className="min-w-0 flex-1">
        <Link href={`/jobs/${job.id}`} className="block truncate font-semibold text-ink-900 hover:underline">{job.fileName}</Link>
        <p className="flex flex-wrap items-center gap-x-2 text-sm text-ink-500">
          <JobStatusText status={job.status} />
          <span aria-hidden="true">·</span>
          <span className="truncate">{templateLabel(job)}</span>
          {rows !== undefined && rows !== null ? <><span aria-hidden="true">·</span><span className="tabular-nums">{rows.toLocaleString('es-CL')} filas{job.files?.rejectedRows ? `, ${job.files.rejectedRows} rechazadas` : ''}</span></> : null}
          <span aria-hidden="true">·</span>
          <span className="tabular-nums">{formatTime(job.createdAt)}</span>
        </p>
      </div>
      {DOWNLOADABLE.has(job.status) ? (
        <button type="button" className={quietLink} onClick={() => onDownload(job)}>
          <Download size={15} aria-hidden="true" />
          Descargar
        </button>
      ) : job.status === 'READY' ? (
        <Link href={`/jobs/${job.id}`} className={quietLink}>Continuar</Link>
      ) : job.status === 'FAILED' ? (
        <Link href={`/jobs/${job.id}`} className={quietLink}>Ver qué pasó</Link>
      ) : job.workingTemplate && !OPEN.has(job.status) ? (
        <ReuseUploadButton reuseFromJobId={job.id} icon={Repeat} className={quietLink}>Repetir</ReuseUploadButton>
      ) : null}
      <button type="button" className={iconButton} aria-label={`Eliminar ${job.fileName} del historial`} title="Eliminar del historial" onClick={() => onDelete(job)}>
        <Trash2 size={16} aria-hidden="true" />
      </button>
    </li>
  );
}

export default function JobsPage() {
  const [jobs, setJobs] = useState(null);
  const [error, setError] = useState(null);
  const [actionError, setActionError] = useState('');
  const [filter, setFilter] = useState('open');
  const [query, setQuery] = useState('');
  const [showClosed, setShowClosed] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  useEffect(() => {
    api.listJobs().then((list) => {
      setJobs(list);
      // With nothing pending, open on the full history instead of an empty list.
      if (!list.some((job) => OPEN.has(job.status))) setFilter('all');
    }).catch(setError);
  }, []);

  const counts = useMemo(() => Object.fromEntries(FILTERS.map((item) => [item.id, (jobs || []).filter(item.test).length])), [jobs]);
  const visible = useMemo(() => {
    const text = query.trim().toLowerCase();
    const matches = (job) => !text || job.fileName.toLowerCase().includes(text) || templateLabel(job).toLowerCase().includes(text);
    return (jobs || []).filter(FILTERS.find((item) => item.id === filter).test).filter(matches);
  }, [jobs, filter, query]);
  // Expired, purged and cancelled conversions stay available but folded: they need no action.
  const active = visible.filter((job) => !CLOSED.has(job.status));
  const closed = visible.filter((job) => CLOSED.has(job.status));

  async function download(job) {
    setActionError('');
    try {
      downloadBlob(await api.downloadJob(job.id, 'output'));
    } catch (downloadError) {
      setActionError(downloadError.message);
    }
  }

  async function deleteJob(job) {
    setActionError('');
    await api.deleteJob(job.id);
    setJobs((current) => (current || []).filter((item) => item.id !== job.id));
    setDeleteTarget(null);
  }

  async function deleteAllJobs() {
    setActionError('');
    await api.deleteAllJobs();
    setJobs([]);
    setShowClosed(false);
    setDeleteTarget(null);
  }

  return (
    <Shell>
      <div className="mx-auto max-w-5xl">
        <div className="mb-6">
          <h1 className="text-[28px] font-bold leading-tight text-ink-900">Historial</h1>
          <p className="mt-1 max-w-[62ch] text-ink-500">Tus conversiones. Guardamos solo los datos del proceso, nunca el contenido de las filas.</p>
        </div>

        {error ? (
          <Notice tone="danger" icon={AlertCircle} role="alert">No pudimos cargar el historial: {error.message}</Notice>
        ) : !jobs ? (
          <p className="flex items-center gap-2 text-sm text-ink-500"><Loader2 size={16} className="animate-spin" aria-hidden="true" />Cargando…</p>
        ) : jobs.length === 0 ? (
          <div className="flex flex-col items-center rounded-md border border-dashed border-ink-300 bg-white px-4 py-12 text-center">
            <History className="text-ink-400" size={26} aria-hidden="true" />
            <p className="mt-2 font-semibold text-ink-900">Todavía no has convertido archivos</p>
            <Link href="/" className={`${buttonStyles.primary} mt-4`}>Convertir un Excel</Link>
          </div>
        ) : (
          <>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <div role="group" aria-label="Filtrar conversiones" className="flex flex-wrap gap-2">
                {FILTERS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={filter === item.id}
                    className={`h-9 rounded-full border px-3.5 text-sm font-medium ${filter === item.id ? 'border-ink-900 bg-ink-900 text-white' : 'border-ink-200 bg-white text-ink-700 hover:bg-ink-50'}`}
                    onClick={() => setFilter(item.id)}
                  >
                    {item.label} <span className="tabular-nums opacity-70">{counts[item.id]}</span>
                  </button>
                ))}
              </div>
              <label className="relative ml-auto w-full sm:w-72">
                <span className="sr-only">Buscar por archivo o plantilla</span>
                <Search size={16} className="pointer-events-none absolute left-3 top-2.5 text-ink-400" aria-hidden="true" />
                <input type="search" className="h-9 w-full rounded-md border border-ink-200 bg-white pl-9 pr-3 text-sm" placeholder="Buscar archivo o plantilla" value={query} onChange={(event) => setQuery(event.target.value)} />
              </label>
              <button type="button" className={`${buttonStyles.secondary} text-ink-500`} onClick={() => setDeleteTarget({ type: 'all', count: jobs.length })}>
                <Trash2 size={16} aria-hidden="true" />
                Borrar historial
              </button>
            </div>

            {actionError ? <div className="mb-4"><Notice tone="danger" icon={AlertCircle} role="alert">{actionError}</Notice></div> : null}

            {active.length === 0 && closed.length === 0 ? (
              <p className="border-t border-ink-200 pt-4 text-sm text-ink-500">{query ? `Ninguna conversión coincide con «${query}».` : 'No hay conversiones en este filtro.'}</p>
            ) : null}

            {groupByDay(active).map((group) => (
              <section key={group.label} className="mb-2">
                <h2 className="mb-1 mt-5 text-sm font-bold capitalize text-ink-500">{group.label}</h2>
                <ul className="border-t border-ink-200">{group.jobs.map((job) => <JobRow key={job.id} job={job} onDownload={download} onDelete={(item) => setDeleteTarget({ type: 'job', job: item })} />)}</ul>
              </section>
            ))}

            {closed.length ? (
              showClosed ? (
                groupByDay(closed).map((group) => (
                  <section key={`closed-${group.label}`} className="mb-2">
                    <h2 className="mb-1 mt-5 text-sm font-bold capitalize text-ink-500">{group.label}</h2>
                    <ul className="border-t border-ink-200">{group.jobs.map((job) => <JobRow key={job.id} job={job} onDownload={download} onDelete={(item) => setDeleteTarget({ type: 'job', job: item })} />)}</ul>
                  </section>
                ))
              ) : (
                <div className="mt-6 flex justify-center">
                  <button type="button" className={buttonStyles.secondary} onClick={() => setShowClosed(true)}>
                    Mostrar {closed.length} {closed.length === 1 ? 'conversión expirada o cerrada' : 'conversiones expiradas o cerradas'}
                  </button>
                </div>
              )
            ) : null}
          </>
        )}
      </div>
      {deleteTarget?.type === 'job' ? (
        <ConfirmDialog
          title={`Eliminar «${deleteTarget.job.fileName}»`}
          confirmLabel="Eliminar del historial"
          loadingLabel="Eliminando…"
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => deleteJob(deleteTarget.job)}
        >
          Esta conversión desaparecerá del historial y de “Continúa donde quedaste”. Si está pendiente, se cancelará y se limpiarán sus archivos temporales.
        </ConfirmDialog>
      ) : null}
      {deleteTarget?.type === 'all' ? (
        <ConfirmDialog
          title="Borrar historial"
          confirmLabel="Borrar historial"
          loadingLabel="Borrando…"
          onCancel={() => setDeleteTarget(null)}
          onConfirm={deleteAllJobs}
        >
          Se eliminarán {deleteTarget.count} {deleteTarget.count === 1 ? 'conversión' : 'conversiones'} de tu historial. Los procesos en curso se cancelarán.
        </ConfirmDialog>
      ) : null}
    </Shell>
  );
}

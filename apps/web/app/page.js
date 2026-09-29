'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertCircle, Download, Loader2, Trash2, Upload } from 'lucide-react';
import { FileDropzone } from '../components/file-dropzone';
import { BatchConvert } from '../components/home/batch-convert';
import { ConfirmDialog } from '../components/confirm-dialog';
import { formatDateTime, JobStatusText } from '../components/job-status';
import { buttonStyles, Notice } from '../components/panel';
import { ReuseUploadButton } from '../components/reuse-upload-button';
import { Shell } from '../components/shell';
import { api } from '../lib/api';
import { downloadBlob } from '../lib/download';
import { validateExcelFile } from '../lib/file-validation';

const quietLink = 'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-sm font-semibold text-cobalt-700 hover:underline';
const iconButton = 'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-ink-400 hover:bg-rose-50 hover:text-rose-700';

// Conversions that still need something from the user or can still be downloaded.
const OPEN_STATUSES = new Set(['QUEUED_ANALYSIS', 'ANALYZING', 'READY', 'QUEUED_TRANSFORMATION', 'TRANSFORMING', 'VALIDATING', 'GENERATING', 'READY_TO_DOWNLOAD', 'DOWNLOADED']);
const DOWNLOADABLE = new Set(['READY_TO_DOWNLOAD', 'DOWNLOADED']);

function Upload_({ defaultTemplateId }) {
  const router = useRouter();
  const [state, setState] = useState({ uploading: false, error: '' });
  const [batch, setBatch] = useState(null);

  async function handleFile(file) {
    const error = validateExcelFile(file);
    if (error) {
      setState({ uploading: false, error });
      return;
    }
    setState({ uploading: true, error: '' });
    try {
      const job = await api.createJob({ file });
      router.push(`/jobs/${job.id}`);
    } catch (uploadError) {
      setState({ uploading: false, error: uploadError.message });
    }
  }

  if (batch) {
    return (
      <section className="rounded-md border border-ink-200 bg-white p-4 sm:p-5">
        <BatchConvert files={batch} defaultTemplateId={defaultTemplateId} onClose={() => setBatch(null)} />
      </section>
    );
  }
  if (state.uploading) {
    return (
      <p className="flex min-h-[238px] items-center justify-center gap-2 rounded-md border border-ink-200 bg-white text-sm text-ink-700">
        <Loader2 size={18} className="animate-spin text-cobalt-600" aria-hidden="true" />
        Subiendo y leyendo el archivo…
      </p>
    );
  }
  return <FileDropzone variant="sheet" error={state.error} onFile={handleFile} multiple onFiles={setBatch} />;
}

function OpenJob({ job, onDownload, onDelete }) {
  const downloadable = DOWNLOADABLE.has(job.status);
  const running = !downloadable && job.status !== 'READY';
  return (
    <li className="flex items-center gap-3 border-b border-ink-100 py-3">
      <div className="min-w-0 flex-1">
        <Link href={`/jobs/${job.id}`} className="block truncate font-semibold text-ink-900 hover:underline">{job.fileName}</Link>
        <p className="flex flex-wrap items-center gap-x-2 text-sm text-ink-500">
          <JobStatusText status={job.status} />
          <span aria-hidden="true">·</span>
          <span className="truncate">{job.template ? job.template.name : 'Sin plantilla'}</span>
          <span aria-hidden="true">·</span>
          <span className="tabular-nums">{formatDateTime(job.createdAt)}</span>
        </p>
      </div>
      {downloadable ? (
        <button type="button" className={quietLink} onClick={() => onDownload(job)}>
          <Download size={15} aria-hidden="true" />
          Descargar
        </button>
      ) : (
        <Link href={`/jobs/${job.id}`} className={quietLink}>{running ? 'Ver avance' : 'Continuar'}</Link>
      )}
      <button type="button" className={iconButton} aria-label={`Eliminar ${job.fileName}`} title="Eliminar" onClick={() => onDelete(job)}>
        <Trash2 size={16} aria-hidden="true" />
      </button>
    </li>
  );
}

function FrequentTemplates({ templates, used }) {
  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-bold text-ink-900">{used ? 'Tus plantillas frecuentes' : 'Plantillas disponibles'}</h2>
        <Link href="/templates" className={quietLink}>Ver todas</Link>
      </div>
      {templates.length ? (
        <ul className="border-t border-ink-200">
          {templates.map((template) => (
            <li key={template.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-ink-100 py-3">
              <div className="min-w-0 flex-1 basis-40">
                <Link href={`/templates/${template.id}`} className="block truncate font-semibold text-ink-900 hover:underline">{template.name}</Link>
                <p className="truncate text-sm text-ink-500">{[template.destination, template.process].filter(Boolean).join(', ') || 'Sin destino asignado'}</p>
              </div>
              <ReuseUploadButton templateId={template.id} icon={Upload} className={quietLink}>Usar</ReuseUploadButton>
              <button type="button" className={`${quietLink} text-ink-500`} title="Descarga un Excel con las columnas que espera esta plantilla" onClick={async () => downloadBlob(await api.downloadTemplateExample(template.id))}>
                <Download size={14} aria-hidden="true" />
                Ejemplo
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="border-t border-ink-200 pt-3 text-sm text-ink-500">Todavía no hay plantillas. Créalas en Plantillas con el modo avanzado.</p>
      )}
    </section>
  );
}

export default function HomePage() {
  const [data, setData] = useState({ jobs: null, templates: null, error: null });
  const [actionError, setActionError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);

  useEffect(() => {
    Promise.all([api.listJobs(), api.listTemplates()])
      .then(([jobs, templates]) => setData({ jobs, templates, error: null }))
      .catch((error) => setData({ jobs: [], templates: [], error }));
  }, []);

  // Templates this user worked with recently come first; otherwise show what is available.
  const usedTemplates = useMemo(() => {
    const byId = new Map();
    for (const job of data.jobs || []) if (job.template && !byId.has(job.template.id)) byId.set(job.template.id, job.template);
    const active = new Map((data.templates || []).map((template) => [template.id, template]));
    return [...byId.keys()].filter((id) => active.has(id)).map((id) => active.get(id)).slice(0, 4);
  }, [data]);
  const shortcutTemplates = usedTemplates.length ? usedTemplates : (data.templates || []).slice(0, 4);
  const openJobs = (data.jobs || []).filter((job) => OPEN_STATUSES.has(job.status)).slice(0, 5);

  async function download(job) {
    setActionError('');
    try {
      downloadBlob(await api.downloadJob(job.id, 'output'));
    } catch (error) {
      setActionError(error.message);
    }
  }

  async function deleteJob(job) {
    setActionError('');
    await api.deleteJob(job.id);
    setData((current) => ({ ...current, jobs: (current.jobs || []).filter((item) => item.id !== job.id) }));
    setDeleteTarget(null);
  }

  async function deleteOpenJobs() {
    setActionError('');
    await Promise.all(openJobs.map((job) => api.deleteJob(job.id)));
    const deleted = new Set(openJobs.map((job) => job.id));
    setData((current) => ({ ...current, jobs: (current.jobs || []).filter((job) => !deleted.has(job.id)) }));
    setDeleteTarget(null);
  }

  return (
    <Shell>
      <div className="mx-auto max-w-6xl">
        <div className="mb-6">
          <h1 className="text-[28px] font-bold leading-tight text-ink-900">Convertir un Excel</h1>
          <p className="mt-1 max-w-[62ch] text-ink-500">
            Súbelo tal como lo recibiste. Reconocemos sus columnas, sugerimos la plantilla del destino y te mostramos el resultado antes de generarlo.
          </p>
        </div>

        {data.error ? <div className="mb-4"><Notice tone="danger" icon={AlertCircle} role="alert">{data.error.message}</Notice></div> : null}
        {actionError ? <div className="mb-4"><Notice tone="danger" icon={AlertCircle} role="alert">{actionError}</Notice></div> : null}

        <Upload_ defaultTemplateId={usedTemplates[0]?.id} />

        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <section>
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <h2 className="text-lg font-bold text-ink-900">Continúa donde quedaste</h2>
              <div className="flex items-center gap-4">
                {openJobs.length ? (
                  <button type="button" className={`${quietLink} text-ink-500`} onClick={() => setDeleteTarget({ type: 'open-all', count: openJobs.length })}>
                    <Trash2 size={14} aria-hidden="true" />
                    Borrar todo
                  </button>
                ) : null}
                <Link href="/jobs" className={quietLink}>Historial</Link>
              </div>
            </div>
            {data.jobs === null ? (
              <p className="flex items-center gap-2 border-t border-ink-200 pt-3 text-sm text-ink-500"><Loader2 size={16} className="animate-spin" aria-hidden="true" />Cargando…</p>
            ) : openJobs.length ? (
              <ul className="border-t border-ink-200">{openJobs.map((job) => <OpenJob key={job.id} job={job} onDownload={download} onDelete={(item) => setDeleteTarget({ type: 'job', job: item })} />)}</ul>
            ) : (
              <p className="border-t border-ink-200 pt-3 text-sm text-ink-500">No tienes conversiones pendientes. Las terminadas y expiradas están en el Historial.</p>
            )}
          </section>
          {data.templates ? <FrequentTemplates templates={shortcutTemplates} used={usedTemplates.length > 0} /> : null}
        </div>
      </div>
      {deleteTarget?.type === 'job' ? (
        <ConfirmDialog
          title={`Eliminar «${deleteTarget.job.fileName}»`}
          confirmLabel="Eliminar conversión"
          loadingLabel="Eliminando…"
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => deleteJob(deleteTarget.job)}
        >
          Esta conversión desaparecerá de “Continúa donde quedaste” y del historial. Si está pendiente, se cancelará y se limpiarán sus archivos temporales.
        </ConfirmDialog>
      ) : null}
      {deleteTarget?.type === 'open-all' ? (
        <ConfirmDialog
          title="Borrar conversiones pendientes"
          confirmLabel="Borrar todo"
          loadingLabel="Borrando…"
          onCancel={() => setDeleteTarget(null)}
          onConfirm={deleteOpenJobs}
        >
          Se eliminarán {deleteTarget.count} {deleteTarget.count === 1 ? 'conversión pendiente' : 'conversiones pendientes'} de esta lista. Los procesos en curso se cancelarán.
        </ConfirmDialog>
      ) : null}
    </Shell>
  );
}

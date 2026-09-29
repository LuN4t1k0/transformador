'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertCircle, Download, Loader2, Upload } from 'lucide-react';
import { FileDropzone } from '../components/file-dropzone';
import { BatchConvert } from '../components/home/batch-convert';
import { formatDateTime, JobStatusBadge } from '../components/job-status';
import { buttonStyles, Notice } from '../components/panel';
import { ReuseUploadButton } from '../components/reuse-upload-button';
import { Shell } from '../components/shell';
import { api } from '../lib/api';
import { downloadBlob } from '../lib/download';
import { validateExcelFile } from '../lib/file-validation';

const quietLink = 'inline-flex items-center gap-1.5 text-sm font-semibold text-cobalt-700 hover:underline';

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

function OpenJob({ job, onDownload }) {
  const downloadable = DOWNLOADABLE.has(job.status);
  const running = !downloadable && job.status !== 'READY';
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-ink-100 py-3">
      <div className="min-w-0 flex-1 basis-56">
        <Link href={`/jobs/${job.id}`} className="block truncate font-semibold text-ink-900 hover:underline">{job.fileName}</Link>
        <p className="text-sm text-ink-500">{job.template ? job.template.name : 'Sin plantilla elegida'}, {formatDateTime(job.createdAt)}</p>
      </div>
      <JobStatusBadge status={job.status} />
      {downloadable ? (
        <button type="button" className={buttonStyles.primary} onClick={() => onDownload(job)}>
          <Download size={16} aria-hidden="true" />
          Descargar archivo
        </button>
      ) : (
        <Link href={`/jobs/${job.id}`} className={buttonStyles.secondary}>{running ? 'Ver avance' : 'Continuar'}</Link>
      )}
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
              <Link href="/jobs" className={quietLink}>Historial</Link>
            </div>
            {data.jobs === null ? (
              <p className="flex items-center gap-2 border-t border-ink-200 pt-3 text-sm text-ink-500"><Loader2 size={16} className="animate-spin" aria-hidden="true" />Cargando…</p>
            ) : openJobs.length ? (
              <ul className="border-t border-ink-200">{openJobs.map((job) => <OpenJob key={job.id} job={job} onDownload={download} />)}</ul>
            ) : (
              <p className="border-t border-ink-200 pt-3 text-sm text-ink-500">No tienes conversiones pendientes. Las terminadas y expiradas están en el Historial.</p>
            )}
          </section>
          {data.templates ? <FrequentTemplates templates={shortcutTemplates} used={usedTemplates.length > 0} /> : null}
        </div>
      </div>
    </Shell>
  );
}

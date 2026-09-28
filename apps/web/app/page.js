'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertCircle, ArrowRight, Download, FileSpreadsheet, Loader2, Repeat, ShieldCheck, Upload } from 'lucide-react';
import { FileDropzone } from '../components/file-dropzone';
import { BatchConvert } from '../components/home/batch-convert';
import { formatDateTime, JobStatusBadge } from '../components/job-status';
import { buttonStyles, Notice } from '../components/panel';
import { ReuseUploadButton } from '../components/reuse-upload-button';
import { Shell } from '../components/shell';
import { api } from '../lib/api';
import { downloadBlob } from '../lib/download';
import { formatFileSize, MAX_FILE_SIZE_BYTES, validateExcelFile } from '../lib/file-validation';

const linkButton = 'inline-flex items-center gap-1 text-xs font-semibold text-cobalt-700 hover:underline';

function UploadCard({ defaultTemplateId }) {
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

  return (
    <section className="rounded-lg border border-ink-200 bg-white p-4 shadow-panel sm:p-5">
      <h2 className="mb-3 text-base font-semibold text-ink-900">Convertir un archivo</h2>
      {batch ? (
        <BatchConvert files={batch} defaultTemplateId={defaultTemplateId} onClose={() => setBatch(null)} />
      ) : state.uploading ? (
        <p className="flex min-h-40 items-center justify-center gap-2 text-sm text-ink-700">
          <Loader2 size={18} className="animate-spin text-cobalt-600" aria-hidden="true" />
          Subiendo archivo…
        </p>
      ) : (
        <FileDropzone error={state.error} onFile={handleFile} multiple onFiles={setBatch} />
      )}
      <p className="mt-3 flex items-start gap-2 text-xs text-ink-500">
        <ShieldCheck size={14} className="mt-px shrink-0" aria-hidden="true" />
        Hasta {formatFileSize(MAX_FILE_SIZE_BYTES)} por archivo. Tus archivos son temporales y se eliminan automáticamente.
      </p>
    </section>
  );
}

function RecentJobs({ jobs }) {
  if (!jobs.length) return null;
  return (
    <section className="rounded-lg border border-ink-200 bg-white shadow-panel">
      <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3 sm:px-5">
        <h2 className="text-base font-semibold text-ink-900">Últimas conversiones</h2>
        <Link href="/jobs" className={linkButton}>Ver historial <ArrowRight size={14} aria-hidden="true" /></Link>
      </div>
      <ul className="divide-y divide-ink-100">
        {jobs.slice(0, 5).map((job) => (
          <li key={job.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-5">
            <div className="min-w-0 flex-1 basis-56">
              <Link href={`/jobs/${job.id}`} className="block truncate text-sm font-medium text-ink-900 hover:underline">{job.fileName}</Link>
              <p className="text-xs text-ink-500">{job.template ? job.template.name : 'Sin plantilla'} · {formatDateTime(job.createdAt)}</p>
            </div>
            <JobStatusBadge status={job.status} />
            {job.workingTemplate ? (
              <ReuseUploadButton reuseFromJobId={job.id} icon={Repeat} className={linkButton}>Repetir con otro archivo</ReuseUploadButton>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function TemplateShortcuts({ templates, title }) {
  if (!templates.length) return null;
  return (
    <section className="rounded-lg border border-ink-200 bg-white shadow-panel">
      <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3 sm:px-5">
        <h2 className="text-base font-semibold text-ink-900">{title}</h2>
        <Link href="/templates" className={linkButton}>Todas <ArrowRight size={14} aria-hidden="true" /></Link>
      </div>
      <ul className="divide-y divide-ink-100">
        {templates.map((template) => (
          <li key={template.id} className="px-4 py-3 sm:px-5">
            <div className="flex items-start gap-2">
              <FileSpreadsheet size={18} className="mt-0.5 shrink-0 text-cobalt-600" aria-hidden="true" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink-900">{template.name}</p>
                <p className="truncate text-xs text-ink-500">{[template.destination, template.process].filter(Boolean).join(' · ') || 'Sin clasificar'}</p>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 pl-6">
              <ReuseUploadButton templateId={template.id} icon={Upload} className={linkButton}>Usar con un archivo</ReuseUploadButton>
              <button type="button" className={linkButton} onClick={async () => downloadBlob(await api.downloadTemplateExample(template.id))}>
                <Download size={14} aria-hidden="true" />Excel de ejemplo
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function HomePage() {
  const [data, setData] = useState({ jobs: null, templates: null, error: null });

  useEffect(() => {
    Promise.all([api.listJobs(), api.listTemplates()])
      .then(([jobs, templates]) => setData({ jobs, templates, error: null }))
      .catch((error) => setData({ jobs: [], templates: [], error }));
  }, []);

  // Templates this user worked with recently come first; otherwise show what is available.
  const usedTemplates = useMemo(() => {
    const byId = new Map();
    for (const job of data.jobs || []) if (job.template && !byId.has(job.template.id)) byId.set(job.template.id, job.template);
    const active = new Set((data.templates || []).map((template) => template.id));
    return [...byId.values()].filter((template) => active.has(template.id)).slice(0, 4);
  }, [data]);
  const shortcutTemplates = usedTemplates.length ? usedTemplates : (data.templates || []).slice(0, 4);

  return (
    <Shell>
      <div className="mx-auto max-w-6xl">
        <div className="mb-5">
          <h1 className="text-2xl font-semibold text-ink-900">Convertir Excel</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-500">
            Sube tu Excel tal como lo tienes: reconocemos sus columnas, aplicamos la plantilla del destino y te mostramos cómo quedará antes de generarlo.
          </p>
        </div>

        {data.error ? <div className="mb-4"><Notice tone="danger" icon={AlertCircle} role="alert">{data.error.message}</Notice></div> : null}

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0 space-y-5">
            <UploadCard defaultTemplateId={usedTemplates[0]?.id} />
            {data.jobs ? <RecentJobs jobs={data.jobs} /> : null}
          </div>
          <div className="space-y-5">
            {data.templates ? (
              <TemplateShortcuts templates={shortcutTemplates} title={usedTemplates.length ? 'Tus plantillas' : 'Plantillas disponibles'} />
            ) : (
              <p className="flex items-center gap-2 text-sm text-ink-500"><Loader2 size={16} className="animate-spin" aria-hidden="true" />Cargando…</p>
            )}
            <Link href="/templates" className={`${buttonStyles.secondary} w-full`}>Ver todas las plantillas</Link>
          </div>
        </div>
      </div>
    </Shell>
  );
}

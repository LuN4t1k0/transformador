'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { FileDropzone } from '../components/file-dropzone';
import { BatchConvert } from '../components/home/batch-convert';
import { Shell } from '../components/shell';
import { api } from '../lib/api';
import { validateExcelFile } from '../lib/file-validation';

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

// Home is only the upload: past conversions live in Historial and templates in Plantillas.
export default function HomePage() {
  const [defaultTemplateId, setDefaultTemplateId] = useState(undefined);

  // For converting several files at once, the template this user worked with most recently comes preselected.
  useEffect(() => {
    Promise.all([api.listJobs(), api.listTemplates()])
      .then(([jobs, templates]) => {
        const active = new Set(templates.map((template) => template.id));
        setDefaultTemplateId(jobs.find((job) => job.template && active.has(job.template.id))?.template.id);
      })
      .catch(() => {});
  }, []);

  return (
    <Shell>
      <div className="mx-auto max-w-6xl">
        <div className="mb-6">
          <h1 className="text-[28px] font-bold leading-tight text-ink-900">Convertir un Excel</h1>
          <p className="mt-1 max-w-[62ch] text-ink-500">
            Súbelo tal como lo recibiste. Reconocemos sus columnas, sugerimos la plantilla del destino y te mostramos el resultado antes de generarlo.
          </p>
        </div>
        <Upload_ defaultTemplateId={defaultTemplateId} />
      </div>
    </Shell>
  );
}

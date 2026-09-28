'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, ArrowRight, Loader2, ShieldCheck } from 'lucide-react';
import { FileDropzone } from '../../../components/file-dropzone';
import { buttonStyles, Notice, Panel } from '../../../components/panel';
import { Shell } from '../../../components/shell';
import { api } from '../../../lib/api';
import { formatFileSize, MAX_FILE_SIZE_BYTES, validateExcelFile } from '../../../lib/file-validation';

export default function NewJobPage() {
  const router = useRouter();
  const [file, setFile] = useState(null);
  const [fileError, setFileError] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [apiError, setApiError] = useState('');

  const blockedReason = file ? null : 'Selecciona un archivo .xlsx para continuar.';

  function handleFile(selected) {
    const error = validateExcelFile(selected);
    setFileError(error || '');
    setApiError('');
    if (!error) setFile(selected);
  }

  async function handleCreate() {
    if (blockedReason || isCreating) return;
    setIsCreating(true);
    setApiError('');
    try {
      const job = await api.createJob({ file });
      router.push(`/jobs/${job.id}`);
    } catch (error) {
      setApiError(error.message || 'No pudimos crear el job. Inténtalo de nuevo.');
      setIsCreating(false);
    }
  }

  return (
    <Shell>
      <div className="mx-auto max-w-6xl">
        <div className="mb-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-cobalt-600">Convertir archivo</p>
          <h1 className="mt-1 text-2xl font-semibold text-ink-900">Transformar archivo Excel</h1>
          <p className="mt-2 max-w-2xl text-sm text-ink-500">
            Sube el Excel tal como lo tienes. Reconocemos sus columnas, te sugerimos la plantilla del destino y ves cómo quedará antes de generar el archivo.
          </p>
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0">
            <Panel title="Archivo de origen" description="Nada se genera hasta que revises el resultado y lo confirmes.">
              <FileDropzone file={file} error={fileError} onFile={handleFile} />

              {apiError ? (
                <div className="mt-4">
                  <Notice tone="danger" icon={AlertCircle} role="alert">{apiError}</Notice>
                </div>
              ) : null}
            </Panel>

            <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
              {blockedReason ? <p id="create-blocked-reason" className="text-sm text-ink-500">{blockedReason}</p> : null}
              <button
                type="button"
                className={buttonStyles.primary}
                disabled={Boolean(blockedReason) || isCreating}
                aria-describedby={blockedReason ? 'create-blocked-reason' : undefined}
                onClick={handleCreate}
              >
                {isCreating ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : null}
                {isCreating ? 'Subiendo archivo…' : 'Subir y analizar'}
                {isCreating ? null : <ArrowRight size={16} aria-hidden="true" />}
              </button>
            </div>
          </div>

          <aside className="flex flex-col gap-4">
            <section className="rounded-lg border border-ink-200 bg-white p-4 text-sm shadow-panel">
              <h2 className="font-semibold text-ink-900">Qué pasa después</h2>
              <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-ink-700">
                <li>Leemos tu archivo y sus columnas.</li>
                <li>Te sugerimos la plantilla del destino (si ya la usaste, se aplica sola).</li>
                <li>Ves cómo quedará el archivo.</li>
                <li>Lo generas y lo descargas.</li>
              </ol>
            </section>
            <p className="flex items-start gap-2 px-1 text-xs leading-5 text-ink-500">
              <ShieldCheck size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
              Límite por archivo: {formatFileSize(MAX_FILE_SIZE_BYTES)}. Los archivos son temporales: se eliminan tras la descarga o, como máximo, en 24 horas.
            </p>
          </aside>
        </div>
      </div>
    </Shell>
  );
}

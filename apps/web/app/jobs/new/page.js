'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, ArrowRight, CheckCircle2, FileSpreadsheet, Loader2, ShieldCheck } from 'lucide-react';
import { FileDropzone } from '../../../components/file-dropzone';
import { buttonStyles, Notice, Panel } from '../../../components/panel';
import { Shell } from '../../../components/shell';
import { api } from '../../../lib/api';
import { formatFileSize, MAX_FILE_SIZE_BYTES, validateExcelFile } from '../../../lib/file-validation';
import { templates } from '../../../lib/templates';

function TemplatePicker({ templateId, onChange }) {
  return (
    <div className="grid gap-2" role="radiogroup" aria-label="Plantilla de salida">
      {templates.map((template) => {
        const isSelected = template.id === templateId;
        const requiredCount = template.columns.filter((column) => column.required).length;

        return (
          <button
            key={template.id}
            type="button"
            role="radio"
            aria-checked={isSelected}
            className={`flex w-full items-start gap-3 rounded-lg border p-4 text-left ${
              isSelected ? 'border-cobalt-500 bg-cobalt-50' : 'border-ink-200 bg-white hover:bg-ink-50'
            }`}
            onClick={() => onChange(template.id)}
          >
            <FileSpreadsheet className="mt-0.5 shrink-0 text-cobalt-600" size={20} aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-ink-900">{template.name}</span>
              <span className="mt-1 block text-sm text-ink-500">{template.description}</span>
              <span className="mt-2 block text-xs text-ink-500">
                {template.columns.length} columnas ({requiredCount} requeridas) · hoja «{template.output.sheetName}» · .{template.output.format}
              </span>
            </span>
            {isSelected ? <CheckCircle2 className="shrink-0 text-cobalt-600" size={18} aria-hidden="true" /> : null}
          </button>
        );
      })}
    </div>
  );
}

export default function NewJobPage() {
  const router = useRouter();
  const [file, setFile] = useState(null);
  const [fileError, setFileError] = useState('');
  const [templateId, setTemplateId] = useState(templates[0].id);
  const [isCreating, setIsCreating] = useState(false);
  const [apiError, setApiError] = useState('');

  const blockedReason = !file
    ? 'Selecciona un archivo .xlsx para continuar.'
    : !templateId ? 'Selecciona una plantilla para continuar.' : null;

  function handleFile(selected) {
    const error = validateExcelFile(selected);
    setFileError(error || '');
    setApiError('');
    if (!error) setFile({ name: selected.name, size: selected.size });
  }

  async function handleCreate() {
    if (blockedReason || isCreating) return;
    setIsCreating(true);
    setApiError('');
    try {
      const job = await api.createJob({ fileName: file.name, fileSize: file.size, templateId });
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
          <p className="text-xs font-semibold uppercase tracking-wide text-cobalt-600">Nuevo job</p>
          <h1 className="mt-1 text-2xl font-semibold text-ink-900">Transformar archivo Excel</h1>
          <p className="mt-2 max-w-2xl text-sm text-ink-500">
            Sube tu Excel y elige la plantilla. Después revisarás la hoja, el mapeo y una vista previa antes de generar el archivo.
          </p>
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0">
            <Panel title="Archivo y plantilla" description="Nada se transforma hasta que lo confirmes en el detalle del job.">
              <h3 className="mb-2 text-sm font-semibold text-ink-900">1. Archivo de origen</h3>
              <FileDropzone file={file} error={fileError} onFile={handleFile} />

              <h3 className="mb-2 mt-6 text-sm font-semibold text-ink-900">2. Plantilla de salida</h3>
              <TemplatePicker templateId={templateId} onChange={setTemplateId} />

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
                {isCreating ? 'Creando job…' : 'Crear job y analizar'}
                {isCreating ? null : <ArrowRight size={16} aria-hidden="true" />}
              </button>
            </div>
          </div>

          <aside className="flex flex-col gap-4">
            <section className="rounded-lg border border-ink-200 bg-white p-4 text-sm shadow-panel">
              <h2 className="font-semibold text-ink-900">Qué pasa después</h2>
              <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-ink-700">
                <li>Analizamos hojas y encabezados.</li>
                <li>Eliges la hoja y resuelves el mapeo.</li>
                <li>Revisas una vista previa de pocas filas.</li>
                <li>Generas y descargas el archivo final.</li>
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

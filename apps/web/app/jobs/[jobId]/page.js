'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AlertCircle, ArrowLeft, ArrowRight, Check, FileSearch, Loader2, ShieldCheck } from 'lucide-react';
import { MappingCounts, MappingEditor } from '../../../components/mapping-editor';
import { buttonStyles, Notice, Panel } from '../../../components/panel';
import { Shell } from '../../../components/shell';
import { formatTime, JobStatusBadge } from '../../../components/job-status';
import { PreviewSection } from '../../../components/job/preview-section';
import { ReadyToRun, RunProgress, RunResult, RunTerminal } from '../../../components/job/run-section';
import { SheetSection } from '../../../components/job/sheet-section';
import { api } from '../../../lib/api';
import { formatFileSize } from '../../../lib/file-validation';
import { useJob } from '../../../lib/hooks/use-job';
import { evaluateMapping, updateMappingEntry } from '../../../lib/mapping';
import { getTemplate } from '../../../lib/templates';

const SECTIONS = [
  { id: 'sheet', label: 'Hoja', title: 'Hoja de origen', description: 'Elige la hoja del Excel que contiene los datos a transformar.' },
  { id: 'mapping', label: 'Mapeo', title: 'Mapeo de columnas', description: 'Cada campo de la plantilla toma su valor de una columna de la hoja. Revisa las sugerencias marcadas.' },
  { id: 'preview', label: 'Vista previa', shortLabel: 'Previa', title: 'Vista previa', description: 'Compara el valor de origen con el resultado para algunas filas antes de procesar el archivo completo.' },
  { id: 'run', label: 'Generar', title: 'Generar archivo', description: 'Transforma y valida todas las filas con la configuración actual.' }
];

const RUNNING = new Set(['QUEUED_TRANSFORMATION', 'TRANSFORMING', 'VALIDATING', 'GENERATING']);

function SectionTabs({ activeId, onSelect, evaluation }) {
  const pending = evaluation.counts.pending + evaluation.counts.missing;

  return (
    <div className="flex gap-1 overflow-x-auto rounded-lg border border-ink-200 bg-white p-1" role="tablist" aria-label="Secciones del job">
      {SECTIONS.map((section, index) => {
        const isActive = section.id === activeId;
        const badge = section.id === 'mapping' && pending
          ? <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-100 px-1.5 text-xs font-semibold text-amber-700">{pending}<span className="sr-only"> pendientes</span></span>
          : section.id === 'sheet' || (section.id === 'mapping' && !pending)
            ? <Check size={14} className="text-mint-600" aria-label="completo" />
            : null;

        return (
          <button
            key={section.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-controls="job-section-panel"
            className={`flex h-9 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-2 text-sm font-medium sm:px-3 ${
              isActive ? 'bg-cobalt-50 text-cobalt-700' : 'text-ink-500 hover:bg-ink-50 hover:text-ink-900'
            }`}
            onClick={() => onSelect(section.id)}
          >
            <span className="hidden text-xs tabular-nums text-ink-400 sm:inline">{index + 1}</span>
            <span className="sm:hidden" aria-hidden="true">{section.shortLabel || section.label}</span>
            <span className="sr-only sm:not-sr-only">{section.label}</span>
            {badge}
          </button>
        );
      })}
    </div>
  );
}

function MappingRequired({ evaluation, onGoToMapping }) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-dashed border-ink-300 px-4 py-10 text-center">
      <FileSearch className="text-ink-400" size={26} aria-hidden="true" />
      <p className="mt-2 text-sm font-semibold text-ink-900">Primero resuelve el mapeo</p>
      <div className="mt-2"><MappingCounts counts={evaluation.counts} /></div>
      <button type="button" className={`${buttonStyles.secondary} mt-4`} onClick={onGoToMapping}>
        Ir al mapeo
        <ArrowRight size={16} aria-hidden="true" />
      </button>
    </div>
  );
}

function getNextAction(job, evaluation, activeId) {
  if (job.status === 'READY') {
    if (!evaluation.isComplete) {
      return activeId === 'mapping'
        ? { hint: 'Resuelve los campos marcados en el mapeo para continuar.' }
        : { section: 'mapping', label: 'Resolver mapeo', hint: 'Hay campos pendientes antes de continuar.' };
    }
    if (activeId === 'run') return { hint: 'Todo listo. Pulsa «Transformar archivo» para procesar todas las filas.' };
    if (activeId === 'preview') return { section: 'run', label: 'Ir a generar', hint: 'Si la vista previa se ve bien, genera el archivo.' };
    return { section: 'preview', label: 'Ver vista previa', hint: 'El mapeo está completo. Revisa el resultado antes de generar.' };
  }
  if (RUNNING.has(job.status)) return { hint: 'Procesando todas las filas.' };
  if (job.status === 'READY_TO_DOWNLOAD') return { hint: 'El archivo está listo. Descárgalo antes de que expire.' };
  return { hint: 'Este job terminó. Crea uno nuevo para procesar otro archivo.' };
}

function JobContextPanel({ job, template, evaluation, activeId, onGo }) {
  const next = getNextAction(job, evaluation, activeId);

  return (
    <aside className="flex flex-col gap-4 lg:sticky lg:top-4 lg:self-start">
      <section className="rounded-lg border border-ink-200 bg-white p-4 shadow-panel">
        <h2 className="text-sm font-semibold text-ink-900">Resumen</h2>
        <dl className="mt-3 space-y-3 text-sm">
          <div>
            <dt className="text-xs text-ink-500">Archivo</dt>
            <dd className="truncate font-medium text-ink-900">{job.fileName}</dd>
            <dd className="text-xs text-ink-500">{formatFileSize(job.fileSize)}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-500">Hoja</dt>
            <dd className="font-medium text-ink-900">{job.selectedSheet}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-500">Plantilla</dt>
            <dd className="font-medium text-ink-900">{template.name}</dd>
          </div>
          {job.status === 'READY' ? (
            <div>
              <dt className="text-xs text-ink-500">Mapeo</dt>
              <dd className="mt-1"><MappingCounts counts={evaluation.counts} /></dd>
            </div>
          ) : null}
        </dl>
      </section>

      <section className="rounded-lg border border-cobalt-100 bg-cobalt-50 p-4 text-sm">
        <h2 className="font-semibold text-cobalt-700">Siguiente paso</h2>
        <p className="mt-1 leading-6 text-ink-700">{next.hint}</p>
        {next.section ? (
          <button type="button" className={`${buttonStyles.primary} mt-3 w-full`} onClick={() => onGo(next.section)}>
            {next.label}
            <ArrowRight size={16} aria-hidden="true" />
          </button>
        ) : null}
      </section>

      <p className="flex items-start gap-2 px-1 text-xs leading-5 text-ink-500">
        <ShieldCheck size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
        Los archivos temporales de este job expiran a las {formatTime(job.expiresAt)}.
      </p>
    </aside>
  );
}

function downloadBlob({ fileName, blob }) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function JobWorkspace({ job, setJob }) {
  const template = getTemplate(job.templateId);
  const [activeId, setActiveId] = useState('sheet');
  const [isBusy, setIsBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const headingRef = useRef(null);
  const hasMounted = useRef(false);

  const evaluation = useMemo(
    () => evaluateMapping(template.columns, job.mapping, new Set(job.confirmedIds)),
    [template, job.mapping, job.confirmedIds]
  );
  const isEditable = job.status === 'READY';
  const sectionId = isEditable ? activeId : 'run';
  const section = SECTIONS.find((candidate) => candidate.id === sectionId);
  const selectedSheet = job.sheets.find((sheet) => sheet.name === job.selectedSheet);

  useEffect(() => {
    if (!hasMounted.current) {
      hasMounted.current = true;
      return;
    }
    headingRef.current?.focus();
  }, [sectionId]);

  async function run(action) {
    setIsBusy(true);
    setActionError('');
    try {
      const result = await action();
      if (result?.id) setJob(result);
    } catch (error) {
      setActionError(error.message || 'No pudimos completar la acción. Inténtalo de nuevo.');
    } finally {
      setIsBusy(false);
    }
  }

  function saveMapping(mapping, confirmedIds) {
    setJob({ ...job, mapping, confirmedIds });
    run(() => api.saveMapping(job.id, { mapping, confirmedIds }));
  }

  function handleMappingChange(column, detectedColumn) {
    saveMapping(
      { ...job.mapping, [column.id]: updateMappingEntry(column, detectedColumn) },
      job.confirmedIds.filter((id) => id !== column.id)
    );
  }

  function handleConfirm(columnId) {
    saveMapping(job.mapping, [...new Set([...job.confirmedIds, columnId])]);
  }

  function renderSection() {
    if (!isEditable) {
      if (RUNNING.has(job.status)) return <RunProgress job={job} isBusy={isBusy} onCancel={() => run(() => api.cancelJob(job.id))} />;
      if (job.status === 'READY_TO_DOWNLOAD') {
        return <RunResult job={job} isBusy={isBusy} onDownload={() => run(async () => downloadBlob(await api.downloadJob(job.id)))} />;
      }
      return <RunTerminal job={job} />;
    }
    if (sectionId === 'sheet') {
      return <SheetSection job={job} template={template} isBusy={isBusy} onSelect={(name) => run(() => api.selectSheet(job.id, name))} />;
    }
    if (sectionId === 'mapping') {
      return (
        <MappingEditor
          evaluation={evaluation}
          detectedColumns={selectedSheet.headers}
          onChange={handleMappingChange}
          onConfirm={handleConfirm}
        />
      );
    }
    if (!evaluation.isComplete) return <MappingRequired evaluation={evaluation} onGoToMapping={() => setActiveId('mapping')} />;
    if (sectionId === 'preview') return <PreviewSection job={job} template={template} />;
    return <ReadyToRun job={job} template={template} evaluation={evaluation} isBusy={isBusy} onTransform={() => run(() => api.transformJob(job.id))} />;
  }

  const sectionIndex = SECTIONS.findIndex((candidate) => candidate.id === sectionId);
  const nextSection = isEditable ? SECTIONS[sectionIndex + 1] : null;
  const previousSection = isEditable ? SECTIONS[sectionIndex - 1] : null;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0 space-y-4">
        {isEditable ? <SectionTabs activeId={sectionId} onSelect={setActiveId} evaluation={evaluation} /> : null}

        {actionError ? <Notice tone="danger" icon={AlertCircle} role="alert">{actionError}</Notice> : null}

        <div id="job-section-panel" role={isEditable ? 'tabpanel' : undefined}>
          <Panel
            headingRef={headingRef}
            title={isEditable ? section.title : RUNNING.has(job.status) ? 'Procesando archivo' : 'Resultado'}
            description={isEditable ? section.description : null}
          >
            {renderSection()}
          </Panel>
        </div>

        {isEditable ? (
          <div className="flex items-center justify-between gap-3">
            {previousSection ? (
              <button type="button" className={buttonStyles.secondary} onClick={() => setActiveId(previousSection.id)}>
                <ArrowLeft size={16} aria-hidden="true" />
                {previousSection.label}
              </button>
            ) : <span />}
            {nextSection ? (
              <button type="button" className={buttonStyles.secondary} onClick={() => setActiveId(nextSection.id)}>
                {nextSection.label}
                <ArrowRight size={16} aria-hidden="true" />
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <JobContextPanel job={job} template={template} evaluation={evaluation} activeId={sectionId} onGo={setActiveId} />
    </div>
  );
}

export default function JobPage() {
  const { jobId } = useParams();
  const { job, error, isLoading, setJob } = useJob(jobId);

  return (
    <Shell>
      <div className="mx-auto max-w-6xl">
        <Link href="/jobs" className="inline-flex items-center gap-1 text-sm font-medium text-ink-500 hover:text-ink-900">
          <ArrowLeft size={15} aria-hidden="true" />
          Historial
        </Link>

        {isLoading ? (
          <p className="mt-6 flex items-center gap-2 text-sm text-ink-500">
            <Loader2 size={16} className="animate-spin" aria-hidden="true" />
            Cargando job…
          </p>
        ) : error ? (
          <div className="mt-6 max-w-xl">
            <Notice tone="danger" icon={AlertCircle} role="alert">
              <p className="font-semibold">No encontramos este job</p>
              <p className="mt-0.5">{error.message}</p>
            </Notice>
            <Link href="/jobs/new" className={`${buttonStyles.primary} mt-4`}>Crear un nuevo job</Link>
          </div>
        ) : (
          <>
            <div className="mb-5 mt-3 flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="truncate text-2xl font-semibold text-ink-900">{job.fileName}</h1>
                <p className="mt-1 text-sm text-ink-500">
                  {getTemplate(job.templateId).name} · creado a las {formatTime(job.createdAt)} · <span className="font-mono text-xs">{job.id}</span>
                </p>
              </div>
              <JobStatusBadge status={job.status} />
            </div>
            <JobWorkspace job={job} setJob={setJob} />
          </>
        )}
      </div>
    </Shell>
  );
}

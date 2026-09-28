'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AlertCircle, ArrowLeft, ArrowRight, Check, CloudOff, FileSearch, Loader2, ShieldCheck, WifiOff } from 'lucide-react';
import { evaluateColumns } from '@previley-transformer/template-engine/src/mapping.js';
import { runRows } from '@previley-transformer/template-engine/src/run.js';
import { buttonStyles, Notice, Panel } from '../../../components/panel';
import { Shell } from '../../../components/shell';
import { StatusPill } from '../../../components/status-pill';
import { formatTime, JobStatusBadge } from '../../../components/job-status';
import { GenerateStep } from '../../../components/job/generate-step';
import { RunProgress, RunResult, RunTerminal } from '../../../components/job/run-section';
import { SheetStep } from '../../../components/job/sheet-step';
import { TemplateStep } from '../../../components/job/template-step';
import { ColumnList } from '../../../components/template-editor/column-list';
import { FilePreview } from '../../../components/template-editor/file-preview';
import { OutputEditor } from '../../../components/template-editor/output-editor';
import { api } from '../../../lib/api';
import { formatFileSize } from '../../../lib/file-validation';
import { useJob } from '../../../lib/hooks/use-job';
import { useWorkingTemplate } from '../../../lib/hooks/use-working-template';
import { reviveSampleRows } from '../../../lib/template-editor';
import { describeOutput } from '../../../lib/templates';

const SECTIONS = [
  { id: 'sheet', label: 'Hoja', title: 'Hoja de origen', description: 'Elige la hoja del Excel que contiene los datos.' },
  { id: 'template', label: 'Plantilla', title: 'Plantilla', description: 'Elige el formato que pide el destino, o crea uno nuevo a partir de este archivo.' },
  { id: 'columns', label: 'Columnas', title: 'Columnas del archivo final', description: 'Define qué columnas lleva el archivo, de dónde sale cada una y en qué formato.' },
  { id: 'output', label: 'Salida', title: 'Formato del archivo', description: 'Tipo de archivo, separador, codificación y largos.' },
  { id: 'preview', label: 'Vista previa', shortLabel: 'Previa', title: 'Vista previa', description: 'Así se verá el archivo final con las primeras filas.' },
  { id: 'generate', label: 'Generar', title: 'Generar archivo', description: 'Guarda la plantilla si quieres reutilizarla y genera el archivo con todas las filas.' }
];

const RUNNING = new Set(['QUEUED_TRANSFORMATION', 'TRANSFORMING', 'VALIDATING', 'GENERATING']);
const ANALYZING = new Set(['QUEUED_ANALYSIS', 'ANALYZING']);

function Counts({ counts }) {
  return (
    <span className="flex flex-wrap gap-1.5">
      {counts.pending ? <StatusPill value="REQUIERE_CONFIRMACION" label={`${counts.pending} por confirmar`} /> : null}
      {counts.missing ? <StatusPill value="FALTANTE" label={`${counts.missing} sin origen`} /> : null}
      {!counts.pending && !counts.missing ? <StatusPill value="OK" label="Todo resuelto" /> : null}
    </span>
  );
}

function SaveIndicator({ saveState }) {
  if (saveState.status === 'saving' || saveState.status === 'pending') {
    return <span className="inline-flex items-center gap-1 text-xs text-ink-500"><Loader2 size={12} className="animate-spin" aria-hidden="true" />Guardando cambios…</span>;
  }
  if (saveState.status === 'error') {
    return <span className="inline-flex items-center gap-1 text-xs text-rose-700"><CloudOff size={12} aria-hidden="true" />No se guardaron los cambios</span>;
  }
  return <span className="inline-flex items-center gap-1 text-xs text-ink-400"><Check size={12} aria-hidden="true" />Cambios guardados</span>;
}

function useSample(jobId, sheetName, enabled) {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    let active = true;
    setRows(null);
    if (!enabled || !sheetName) return undefined;
    api.getSample(jobId)
      .then((sample) => active && setRows(reviveSampleRows(sample.rows)))
      .catch(() => active && setRows([]));
    return () => {
      active = false;
    };
  }, [jobId, sheetName, enabled]);
  return rows;
}

function SectionTabs({ activeId, onSelect, badges }) {
  return (
    <div className="flex gap-1 overflow-x-auto rounded-lg border border-ink-200 bg-white p-1" role="tablist" aria-label="Pasos del job">
      {SECTIONS.map((section, index) => {
        const isActive = section.id === activeId;
        const badge = badges[section.id];
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
            <span className="hidden text-xs tabular-nums text-ink-400 lg:inline">{index + 1}</span>
            <span className="sm:hidden" aria-hidden="true">{section.shortLabel || section.label}</span>
            <span className="sr-only sm:not-sr-only">{section.label}</span>
            {badge === true ? <Check size={14} className="text-mint-600" aria-label="completo" /> : null}
            {typeof badge === 'number' ? (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-100 px-1.5 text-xs font-semibold text-amber-700">{badge}<span className="sr-only"> pendientes</span></span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function Prerequisite({ message, actionLabel, onAction }) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-dashed border-ink-300 px-4 py-10 text-center">
      <FileSearch className="text-ink-400" size={26} aria-hidden="true" />
      <p className="mt-2 text-sm font-semibold text-ink-900">{message}</p>
      <button type="button" className={`${buttonStyles.secondary} mt-4`} onClick={onAction}>
        {actionLabel}
        <ArrowRight size={16} aria-hidden="true" />
      </button>
    </div>
  );
}

function getNextStep(job, template, evaluation, activeId) {
  if (ANALYZING.has(job.status)) return { hint: 'Estamos leyendo las hojas y encabezados del archivo.' };
  if (RUNNING.has(job.status)) return { hint: 'Procesando todas las filas.' };
  if (job.status === 'READY_TO_DOWNLOAD') return { hint: 'El archivo está listo. Descárgalo antes de que expire.' };
  if (job.status !== 'READY') return { hint: 'Este job terminó. Crea uno nuevo para procesar otro archivo.' };
  if (!job.selectedSheet) return { section: 'sheet', label: 'Elegir hoja', hint: 'El archivo tiene varias hojas con datos: elige con cuál trabajar.' };
  if (!template) return { section: 'template', label: 'Elegir plantilla', hint: 'Elige una plantilla guardada o crea una nueva desde este archivo.' };
  if (!evaluation.isComplete) {
    return activeId === 'columns'
      ? { hint: 'Resuelve las columnas marcadas para continuar.' }
      : { section: 'columns', label: 'Resolver columnas', hint: 'Hay columnas pendientes antes de generar.' };
  }
  if (activeId === 'generate') return { hint: 'Todo listo. Decide si guardas la plantilla y genera el archivo.' };
  if (activeId === 'preview') return { section: 'generate', label: 'Ir a generar', hint: 'Si la vista previa se ve bien, genera el archivo.' };
  return { section: 'preview', label: 'Ver vista previa', hint: 'Las columnas están listas. Revisa el resultado antes de generar.' };
}

function ContextPanel({ job, template, evaluation, saveState, activeId, onGo }) {
  const next = getNextStep(job, template, evaluation, activeId);

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
            <dd className="font-medium text-ink-900">{job.selectedSheet || <span className="text-ink-400">Sin elegir</span>}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-500">Plantilla</dt>
            <dd className="font-medium text-ink-900">
              {job.template ? `${job.template.name} v${job.template.version}` : template ? 'Nueva, sin guardar' : <span className="text-ink-400">Sin elegir</span>}
            </dd>
            {template ? <dd className="text-xs text-ink-500">{describeOutput(template.output)}</dd> : null}
          </div>
          {evaluation && job.status === 'READY' ? (
            <div>
              <dt className="text-xs text-ink-500">Columnas</dt>
              <dd className="mt-1"><Counts counts={evaluation.counts} /></dd>
            </div>
          ) : null}
          {template && job.status === 'READY' ? <dd><SaveIndicator saveState={saveState} /></dd> : null}
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

function initialSection(job) {
  if (!job.selectedSheet) return 'sheet';
  if (!job.workingTemplate) return 'template';
  return 'columns';
}

function JobWorkspace({ job, setJob }) {
  const { draft, update, flush, reset, saveState } = useWorkingTemplate(job, setJob);
  const [activeId, setActiveId] = useState(() => initialSection(job));
  const [isBusy, setIsBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [sampleIndex, setSampleIndex] = useState(0);
  const headingRef = useRef(null);
  const hasMounted = useRef(false);

  const isEditable = job.status === 'READY';
  const template = draft.template;
  const sheet = job.sheets.find((candidate) => candidate.name === job.selectedSheet);
  const headers = sheet?.headers || null;
  const sampleRows = useSample(job.id, job.selectedSheet, isEditable);

  const evaluation = useMemo(
    () => (template && headers ? evaluateColumns(template.columns, headers, new Set(draft.confirmedIds)) : null),
    [template, headers, draft.confirmedIds]
  );
  const results = useMemo(() => {
    if (!template || !sampleRows?.length) return null;
    try {
      return runRows(sampleRows, template);
    } catch {
      return null;
    }
  }, [template, sampleRows]);
  const sampleAt = Math.min(sampleIndex, (sampleRows?.length || 1) - 1);
  const sample = results?.length ? { values: sampleRows[sampleAt].values, result: results[sampleAt] } : null;

  const sectionId = isEditable ? activeId : 'run';
  const section = SECTIONS.find((candidate) => candidate.id === sectionId);

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
      return await action();
    } catch (error) {
      setActionError(error.message || 'No pudimos completar la acción. Inténtalo de nuevo.');
      return null;
    } finally {
      setIsBusy(false);
    }
  }

  async function replaceFromServer(action, nextSection) {
    if (!(await flush())) return;
    const result = await run(action);
    if (result?.id) {
      reset(result);
      const target = typeof nextSection === 'function' ? nextSection(result) : nextSection;
      if (target) setActiveId(target);
    }
  }

  // A saved template that fully matches the sheet needs no edits: go straight to the preview.
  function sectionAfterApply(result) {
    const resultHeaders = result.sheets.find((candidate) => candidate.name === result.selectedSheet)?.headers || [];
    return evaluateColumns(result.workingTemplate.columns, resultHeaders, new Set(result.confirmedIds)).isComplete ? 'preview' : 'columns';
  }

  function changeColumns(columns, options) {
    update((current) => {
      let confirmedIds = current.confirmedIds;
      if (options?.unconfirm) confirmedIds = confirmedIds.filter((id) => id !== options.unconfirm);
      if (options?.confirm) confirmedIds = [...new Set([...confirmedIds, ...options.confirm])];
      return { template: { ...current.template, columns }, confirmedIds };
    });
  }

  async function transform(payload) {
    if (!(await flush())) return;
    if (payload) {
      const saved = await run(() => api.saveJobTemplate(job.id, payload));
      if (!saved?.id) return;
      reset(saved);
    }
    const queued = await run(() => api.transformJob(job.id));
    if (queued?.id) setJob(queued);
  }

  const pending = evaluation ? evaluation.counts.pending + evaluation.counts.missing : 0;
  const badges = {
    sheet: Boolean(job.selectedSheet),
    template: Boolean(template),
    columns: template ? (pending || true) : null
  };

  const generateBlocked = saveState.status === 'error'
    ? `No se pudieron guardar los cambios: ${saveState.error?.message}`
    : evaluation && !evaluation.isComplete ? `Resuelve ${pending} ${pending === 1 ? 'columna pendiente' : 'columnas pendientes'} en «Columnas».` : null;

  function renderSection() {
    if (!isEditable) {
      if (ANALYZING.has(job.status)) {
        return <p className="flex items-center gap-2 text-sm text-ink-700"><Loader2 size={16} className="animate-spin text-cobalt-600" aria-hidden="true" />Analizando hojas, encabezados y tipos de columna…</p>;
      }
      if (RUNNING.has(job.status)) return <RunProgress job={job} isBusy={isBusy} onCancel={() => run(async () => setJob(await api.cancelJob(job.id)))} />;
      if (job.status === 'READY_TO_DOWNLOAD') return <RunResult job={job} isBusy={isBusy} onDownload={() => run(async () => downloadBlob(await api.downloadJob(job.id)))} />;
      return <RunTerminal job={job} />;
    }

    if (sectionId === 'sheet') {
      return <SheetStep job={job} isBusy={isBusy} onSelect={(name) => replaceFromServer(() => api.selectSheet(job.id, name), template ? null : 'template')} />;
    }
    if (!job.selectedSheet) return <Prerequisite message="Primero elige la hoja con la que quieres trabajar" actionLabel="Ir a Hoja" onAction={() => setActiveId('sheet')} />;
    if (sectionId === 'template') {
      return <TemplateStep job={{ ...job, workingTemplate: template }} isBusy={isBusy} onApply={(selection) => replaceFromServer(() => api.applyTemplate(job.id, selection), sectionAfterApply)} />;
    }
    if (!template) return <Prerequisite message="Primero elige o crea una plantilla" actionLabel="Ir a Plantilla" onAction={() => setActiveId('template')} />;

    if (sectionId === 'columns') {
      return (
        <div className="space-y-3">
          {sampleRows?.length > 1 ? (
            <label className="flex items-center gap-2 text-xs text-ink-500">
              Ejemplos con la fila
              <select className="h-7 rounded-md border border-ink-200 bg-white px-1 text-xs text-ink-900" value={sampleAt} onChange={(event) => setSampleIndex(Number(event.target.value))}>
                {sampleRows.map((row, index) => <option key={row.rowNumber} value={index}>{row.rowNumber}</option>)}
              </select>
            </label>
          ) : null}
          <ColumnList
            columns={template.columns}
            onChange={changeColumns}
            headers={headers}
            evaluation={evaluation}
            onConfirm={(id) => update((current) => ({ ...current, confirmedIds: [...new Set([...current.confirmedIds, id])] }))}
            sample={sample}
            isFixedWidth={template.output.format === 'FIXED_WIDTH'}
          />
        </div>
      );
    }
    if (sectionId === 'output') return <OutputEditor template={template} onChange={(next) => update((current) => ({ ...current, template: next }))} />;
    if (sectionId === 'preview') {
      if (!results) return <p className="flex items-center gap-2 text-sm text-ink-500"><Loader2 size={16} className="animate-spin" aria-hidden="true" />Preparando vista previa…</p>;
      return <FilePreview template={template} results={results} />;
    }
    return (
      <GenerateStep
        job={job}
        template={template}
        evaluation={evaluation}
        isBusy={isBusy}
        blockedReason={generateBlocked}
        onSave={(payload) => replaceFromServer(() => api.saveJobTemplate(job.id, payload))}
        onTransform={transform}
      />
    );
  }

  const sectionIndex = SECTIONS.findIndex((candidate) => candidate.id === sectionId);
  const nextSection = isEditable ? SECTIONS[sectionIndex + 1] : null;
  const previousSection = isEditable ? SECTIONS[sectionIndex - 1] : null;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0 space-y-4">
        {isEditable ? <SectionTabs activeId={sectionId} onSelect={setActiveId} badges={badges} /> : null}
        {actionError ? <Notice tone="danger" icon={AlertCircle} role="alert">{actionError}</Notice> : null}
        {isEditable && saveState.status === 'error' ? (
          <Notice tone="danger" icon={CloudOff} role="alert">No se guardaron los últimos cambios: {saveState.error?.message}</Notice>
        ) : null}

        <div id="job-section-panel" role={isEditable ? 'tabpanel' : undefined}>
          <Panel
            headingRef={headingRef}
            title={isEditable ? section.title : ANALYZING.has(job.status) ? 'Analizando archivo' : RUNNING.has(job.status) ? 'Procesando archivo' : 'Resultado'}
            description={isEditable ? section.description : null}
            actions={isEditable && template && ['columns', 'output'].includes(sectionId) ? <SaveIndicator saveState={saveState} /> : null}
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

      <ContextPanel job={job} template={template} evaluation={evaluation} saveState={saveState} activeId={sectionId} onGo={setActiveId} />
    </div>
  );
}

export default function JobPage() {
  const { jobId } = useParams();
  const { job, error, isLoading, setJob, isRealtimeConnected } = useJob(jobId);

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
                  Creado a las {formatTime(job.createdAt)} · <span className="font-mono text-xs">{job.id}</span>
                </p>
              </div>
              <JobStatusBadge status={job.status} />
            </div>
            {!isRealtimeConnected ? (
              <div className="mb-4">
                <Notice tone="warning" icon={WifiOff} role="status">
                  Se perdió la conexión en tiempo real. Reintentando… Al reconectar, el estado se actualizará automáticamente.
                </Notice>
              </div>
            ) : null}
            <JobWorkspace key={job.id} job={job} setJob={setJob} />
          </>
        )}
      </div>
    </Shell>
  );
}

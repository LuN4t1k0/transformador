'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AlertCircle, ArrowLeft, ArrowRight, Check, CloudOff, FileSearch, Loader2, ShieldCheck, WifiOff } from 'lucide-react';
import { evaluateColumns } from '@previley-transformer/template-engine/src/mapping.js';
import { runRows } from '@previley-transformer/template-engine/src/run.js';
import { previewRows } from '@previley-transformer/template-engine/src/rows.js';
import { previewParameters } from '@previley-transformer/template-engine/src/params.js';
import { previewDesign } from '@previley-transformer/template-engine/src/output-design.js';
import { ParametersForm, parametersBlockedReason } from '../../../components/job/parameters-form';
import { ParametersContext } from '../../../components/template-editor/parameters-context';
import { buttonStyles, Notice, Panel } from '../../../components/panel';
import { Shell } from '../../../components/shell';
import { formatTime, JobStatusBadge } from '../../../components/job-status';
import { GenerateStep } from '../../../components/job/generate-step';
import { JobActivity } from '../../../components/job/job-activity';
import { QuickFlow } from '../../../components/job/quick-flow';
import { RunProgress, RunResult, RunTerminal } from '../../../components/job/run-section';
import { SheetStep } from '../../../components/job/sheet-step';
import { TemplateStep } from '../../../components/job/template-step';
import { ColumnList } from '../../../components/template-editor/column-list';
import { FilePreview } from '../../../components/template-editor/file-preview';
import { OutputEditor } from '../../../components/template-editor/output-editor';
import { RowStepsEditor, RowStepsNote } from '../../../components/template-editor/row-steps-editor';
import { encodeSampleRows, withColumns } from '../../../lib/template-editor';
import { AssistantPanel } from '../../../components/template-editor/assistant-panel';
import { ExampleReport } from '../../../components/template-editor/example-report';
import { api } from '../../../lib/api';
import { useJob } from '../../../lib/hooks/use-job';
import { StepRail } from '../../../components/job/step-rail';
import { useWorkingTemplate } from '../../../lib/hooks/use-working-template';
import { useAdvancedMode } from '../../../lib/hooks/use-advanced-mode';
import { reviveSampleRows } from '../../../lib/template-editor';
import { describeOutput } from '../../../lib/templates';
import { downloadBlob } from '../../../lib/download';
import { notifyIfHidden, requestNotificationPermission } from '../../../lib/notify';

const SECTIONS = [
  { id: 'sheet', label: 'Hoja', title: 'Hoja de origen', description: 'Elige la hoja del Excel que contiene los datos.' },
  { id: 'template', label: 'Plantilla', title: 'Plantilla', description: 'Elige el formato que pide el destino, o crea uno nuevo a partir de este archivo.' },
  { id: 'columns', label: 'Columnas', title: 'Columnas del archivo final', description: 'Define qué columnas lleva el archivo, de dónde sale cada una y en qué formato.' },
  { id: 'rows', label: 'Filas', title: 'Filas', description: 'Opcional: filtra, quita duplicados, agrupa u ordena las filas del archivo final.' },
  { id: 'output', label: 'Tipo de archivo', shortLabel: 'Tipo', title: 'Tipo de archivo', description: 'Excel, texto con separador o texto de ancho fijo.' },
  { id: 'preview', label: 'Vista previa', shortLabel: 'Previa', title: 'Vista previa', description: 'Así se verá el archivo final con las primeras filas.' },
  { id: 'generate', label: 'Generar', title: 'Generar archivo', description: 'Guarda la plantilla si quieres reutilizarla y genera el archivo con todas las filas.' }
];

const RUNNING = new Set(['QUEUED_TRANSFORMATION', 'TRANSFORMING', 'VALIDATING', 'GENERATING']);
const ANALYZING = new Set(['QUEUED_ANALYSIS', 'ANALYZING']);

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

function initialSection(job) {
  if (!job.selectedSheet) return 'sheet';
  if (!job.workingTemplate) return 'template';
  return 'columns';
}

function JobWorkspace({ job, setJob }) {
  const { draft, update, flush, reset, saveState } = useWorkingTemplate(job, setJob);
  const [advanced, setAdvanced] = useAdvancedMode();
  const [activeId, setActiveId] = useState(() => initialSection(job));
  const [isBusy, setIsBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [sampleIndex, setSampleIndex] = useState(0);
  // What was learned from a destination example in this visit (report and example rows for the assistant).
  const [exampleContext, setExampleContext] = useState(null);
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
  // Values for the template's parameters, typed before generating; the preview uses them as they are typed.
  const [paramValues, setParamValues] = useState(() => job.runParameters || {});
  const params = useMemo(() => previewParameters(template?.parameters || [], paramValues), [template?.parameters, paramValues]);
  const results = useMemo(() => {
    if (!template || !sampleRows?.length) return null;
    try {
      return runRows(sampleRows, template, new Date(), params);
    } catch {
      return null;
    }
  }, [template, sampleRows, params]);
  const preview = useMemo(() => {
    if (!template || !sampleRows?.length) return null;
    try {
      const rows = previewRows(sampleRows, template, new Date(), params);
      return { ...rows, design: previewDesign(template, rows.results, { inputName: job.fileName.replace(/\.xlsx$/i, ''), sheet: job.selectedSheet, now: new Date(), params }) };
    } catch {
      return null;
    }
  }, [template, sampleRows, params, job.fileName, job.selectedSheet]);
  const sampleAt = Math.min(sampleIndex, (sampleRows?.length || 1) - 1);
  const sample = results?.length ? { values: sampleRows[sampleAt].values, result: results[sampleAt] } : null;
  // The assistant works with this file's sample (or the rows read with the destination example).
  const assistantSample = headers && sampleRows?.length
    ? { fileName: job.fileName, sheet: job.selectedSheet, headers, rows: sampleRows, exampleRows: exampleContext?.input?.exampleRows || encodeSampleRows(sampleRows) }
    : null;

  // Tell the user when a conversion they started finishes while they are in another tab.
  const previousStatus = useRef(job.status);
  useEffect(() => {
    const wasRunning = RUNNING.has(previousStatus.current);
    previousStatus.current = job.status;
    if (!wasRunning) return;
    if (job.status === 'READY_TO_DOWNLOAD') notifyIfHidden('Tu archivo está listo', `${job.fileName}: ${job.summary?.validRows ?? ''} filas convertidas.`);
    if (job.status === 'FAILED') notifyIfHidden('No pudimos generar el archivo', job.error?.message || job.fileName);
  }, [job.status, job.fileName, job.summary, job.error]);

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

  // A new template learned from an example of the destination; the assistant can then complete what is missing.
  async function createFromExample(file) {
    if (!(await flush())) return 'No se pudieron guardar los cambios anteriores.';
    setIsBusy(true);
    setActionError('');
    try {
      const result = await api.createJobTemplateFromExample(job.id, { output: file });
      reset(result.job);
      setExampleContext({ report: result.report, input: result.input, output: result.output });
      setActiveId('columns');
      return null;
    } catch (error) {
      return error.message || 'No pudimos leer el ejemplo. Revisa que sea un Excel .xlsx.';
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
      return { template: withColumns(current.template, columns), confirmedIds };
    });
  }

  async function transform(payload, mode) {
    requestNotificationPermission();
    if (!(await flush())) return;
    if (payload) {
      const saved = await run(() => api.saveJobTemplate(job.id, payload));
      if (!saved?.id) return;
      reset(saved);
    }
    const queued = await run(() => api.transformJob(job.id, { mode, parameters: paramValues }));
    if (queued?.id) setJob(queued);
  }

  const pending = evaluation ? evaluation.counts.pending + evaluation.counts.missing : 0;
  const badges = {
    sheet: Boolean(job.selectedSheet),
    template: Boolean(template),
    columns: template ? (pending || true) : null
  };

  const parametersBlocked = parametersBlockedReason(template?.parameters, paramValues);
  const generateBlocked = saveState.status === 'error'
    ? `No se pudieron guardar los cambios: ${saveState.error?.message}`
    : evaluation && !evaluation.isComplete ? `Resuelve ${pending} ${pending === 1 ? 'columna pendiente' : 'columnas pendientes'} en «Columnas».` : parametersBlocked;
  const parametersForm = <ParametersForm parameters={template?.parameters} values={paramValues} onChange={setParamValues} disabled={isBusy} />;

  function renderSection() {
    if (!isEditable) {
      if (ANALYZING.has(job.status)) {
        return <p className="flex items-center gap-2 text-sm text-ink-700"><Loader2 size={16} className="animate-spin text-cobalt-600" aria-hidden="true" />Analizando hojas, encabezados y tipos de columna…</p>;
      }
      if (RUNNING.has(job.status)) return <RunProgress job={job} isBusy={isBusy} onCancel={() => run(async () => setJob(await api.cancelJob(job.id)))} />;
      if (['READY_TO_DOWNLOAD', 'DOWNLOADED'].includes(job.status)) {
        return (
          <RunResult
            job={job}
            isBusy={isBusy}
            onDownload={(file) => run(async () => downloadBlob(await api.downloadJob(job.id, file)))}
            onPurge={() => run(async () => setJob(await api.purgeJob(job.id)))}
          />
        );
      }
      return <RunTerminal job={job} />;
    }

    if (sectionId === 'sheet') {
      return (
        <SheetStep
          job={job}
          isBusy={isBusy}
          onSelect={(name) => replaceFromServer(() => api.selectSheet(job.id, name), template ? null : 'template')}
          onHeaderRow={(name, headerRow) => replaceFromServer(() => api.selectSheet(job.id, name, headerRow))}
        />
      );
    }
    if (!job.selectedSheet) return <Prerequisite message="Primero elige la hoja con la que quieres trabajar" actionLabel="Ir a Hoja" onAction={() => setActiveId('sheet')} />;
    if (sectionId === 'template') {
      return (
        <TemplateStep
          job={{ ...job, workingTemplate: template }}
          isBusy={isBusy}
          onApply={(selection) => {
            setExampleContext(null);
            return replaceFromServer(() => api.applyTemplate(job.id, selection), sectionAfterApply);
          }}
          onFromExample={createFromExample}
        />
      );
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
          <ExampleReport report={exampleContext?.report} assistantAvailable={Boolean(assistantSample)} />
          <ColumnList
            columns={template.columns}
            onChange={changeColumns}
            headers={headers}
            evaluation={evaluation}
            onConfirm={(id) => update((current) => ({ ...current, confirmedIds: [...new Set([...current.confirmedIds, id])] }))}
            onConfirmAll={(ids) => update((current) => ({ ...current, confirmedIds: [...new Set([...current.confirmedIds, ...ids])] }))}
            sample={sample}
            isFixedWidth={template.output.format === 'FIXED_WIDTH'}
          />
          {assistantSample ? (
            <AssistantPanel
              template={template}
              sample={assistantSample}
              outputExample={exampleContext?.output ? { fileName: exampleContext.output.fileName, headers: exampleContext.output.headers, rows: exampleContext.output.exampleRows } : null}
              onApply={(proposal) => update((current) => {
                // The proposal replaces columns, output and row steps; parameters stay as they were.
                const { rowSteps, ...rest } = current.template;
                return { ...current, template: { ...rest, output: proposal.output, columns: proposal.columns, ...(proposal.rowSteps ? { rowSteps: proposal.rowSteps } : {}) } };
              })}
            />
          ) : null}
        </div>
      );
    }
    if (sectionId === 'rows') {
      return (
        <RowStepsEditor
          steps={template.rowSteps}
          columns={template.columns}
          headers={headers}
          onChange={(rowSteps) => update((current) => ({ ...current, template: withColumns({ ...current.template, rowSteps }, current.template.columns) }))}
        />
      );
    }
    if (sectionId === 'output') return <OutputEditor template={template} onChange={(next) => update((current) => ({ ...current, template: next }))} />;
    if (sectionId === 'preview') {
      if (!preview) return <p className="flex items-center gap-2 text-sm text-ink-500"><Loader2 size={16} className="animate-spin" aria-hidden="true" />Preparando vista previa…</p>;
      return (
        <>
          {template.parameters?.length ? <div className="mb-3">{parametersForm}</div> : null}
          <RowStepsNote preview={preview} sampleCount={sampleRows.length} />
          <FilePreview template={template} results={preview.results} sampleCount={sampleRows.length} design={preview.design} />
        </>
      );
    }
    return (
      <GenerateStep
        parametersForm={parametersForm}
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

  function changeSource(column, header) {
    const source = column.source.type.startsWith('SPLIT') || column.source.type === 'NAME_PART' ? { ...column.source, column: header } : { type: 'COLUMN', column: header };
    changeColumns(template.columns.map((candidate) => (candidate.id === column.id ? { ...candidate, source, reviewed: false } : candidate)), { unconfirm: column.id });
  }

  if (!advanced) {
    return (
      <div className="mx-auto max-w-6xl space-y-4">
        {actionError ? <Notice tone="danger" icon={AlertCircle} role="alert">{actionError}</Notice> : null}
        {isEditable && saveState.status === 'error' ? (
          <Notice tone="danger" icon={CloudOff} role="alert">No se guardaron los últimos cambios: {saveState.error?.message}</Notice>
        ) : null}
        {isEditable ? (
          <QuickFlow
            job={job}
            template={template}
            evaluation={evaluation}
            results={preview?.results || null}
            design={preview?.design || null}
            parametersForm={parametersForm}
            sampleCount={sampleRows?.length}
            sample={sample}
            headers={headers || []}
            isBusy={isBusy}
            blockedReason={saveState.status === 'error'
              ? generateBlocked
              : evaluation && !evaluation.isComplete ? `Revisa ${pending === 1 ? 'la columna marcada' : `las ${pending} columnas marcadas`} arriba.` : parametersBlocked}
            onSelectSheet={(name) => replaceFromServer(() => api.selectSheet(job.id, name))}
            onApply={(selection) => replaceFromServer(() => api.applyTemplate(job.id, selection))}
            onChangeSource={changeSource}
            onConfirm={(id) => update((current) => ({ ...current, confirmedIds: [...new Set([...current.confirmedIds, id])] }))}
            onConfirmAll={(ids) => update((current) => ({ ...current, confirmedIds: [...new Set([...current.confirmedIds, ...ids])] }))}
            onGenerate={(mode) => transform(null, mode)}
            onAdvanced={() => {
              setAdvanced(true);
              setActiveId('template');
            }}
          />
        ) : (
          <Panel headingRef={headingRef} title={ANALYZING.has(job.status) ? 'Analizando archivo' : RUNNING.has(job.status) ? 'Generando archivo' : 'Resultado'}>
            {renderSection()}
          </Panel>
        )}
        <JobActivity job={job} />
      </div>
    );
  }

  const sectionIndex = SECTIONS.findIndex((candidate) => candidate.id === sectionId);
  const nextSection = isEditable ? SECTIONS[sectionIndex + 1] : null;
  const previousSection = isEditable ? SECTIONS[sectionIndex - 1] : null;

  // The steps double as the summary: each one says what was decided or what is missing.
  const sheetInfo = job.sheets.find((candidate) => candidate.name === job.selectedSheet);
  const stepDetail = {
    sheet: job.selectedSheet ? `${job.selectedSheet}, ${sheetInfo?.rowCount ?? 0} filas` : 'Sin elegir',
    template: job.template ? `${job.template.name} v${job.template.version}` : template ? 'Nueva, sin guardar' : 'Sin elegir',
    columns: evaluation ? (evaluation.isComplete ? `Las ${evaluation.counts.total} listas` : `${pending} por revisar`) : 'Después de la plantilla',
    rows: template?.rowSteps ? `${Object.keys(template.rowSteps).length} ${Object.keys(template.rowSteps).length === 1 ? 'paso' : 'pasos'} configurados` : 'Sin cambios',
    output: template ? describeOutput(template.output) : 'Después de la plantilla',
    preview: 'Primeras filas del archivo',
    generate: 'Guardar y generar'
  };
  const railSteps = SECTIONS.map((candidate) => ({
    id: candidate.id,
    label: candidate.label,
    detail: stepDetail[candidate.id],
    state: candidate.id === sectionId ? 'current' : typeof badges[candidate.id] === 'number' ? 'attention' : badges[candidate.id] === true ? 'done' : 'todo',
    onClick: () => setActiveId(candidate.id)
  }));

  return (
    <div className={isEditable ? 'grid grid-cols-1 gap-6 lg:grid-cols-[232px_minmax(0,1fr)]' : ''}>
      {isEditable ? (
        <div className="min-w-0 space-y-4">
          <StepRail steps={railSteps} label="Pasos de la conversión" />
          <div className="hidden space-y-2 px-2.5 text-xs text-ink-500 lg:block">
            {template ? <SaveIndicator saveState={saveState} /> : null}
            <p className="flex items-start gap-1.5">
              <ShieldCheck size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
              Tus archivos se eliminan solos a las {formatTime(job.expiresAt)}.
            </p>
          </div>
        </div>
      ) : null}

      <div className="min-w-0 space-y-4">
        {actionError ? <Notice tone="danger" icon={AlertCircle} role="alert">{actionError}</Notice> : null}
        {isEditable && saveState.status === 'error' ? (
          <Notice tone="danger" icon={CloudOff} role="alert">No se guardaron los últimos cambios: {saveState.error?.message}</Notice>
        ) : null}

        <div id="job-section-panel">
          <Panel
            headingRef={headingRef}
            title={isEditable ? section.title : ANALYZING.has(job.status) ? 'Analizando archivo' : RUNNING.has(job.status) ? 'Procesando archivo' : 'Resultado'}
            description={isEditable ? section.description : null}
            actions={isEditable && template && ['columns', 'rows', 'output'].includes(sectionId) ? <SaveIndicator saveState={saveState} /> : null}
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
              <button type="button" className={buttonStyles.primary} onClick={() => setActiveId(nextSection.id)}>
                {nextSection.label}
                <ArrowRight size={16} aria-hidden="true" />
              </button>
            ) : null}
          </div>
        ) : null}

        <JobActivity job={job} />
      </div>
    </div>
  );
}

export default function JobPage() {
  const { jobId } = useParams();
  const [advanced] = useAdvancedMode();
  const { job, error, isLoading, setJob, isRealtimeConnected } = useJob(jobId);

  return (
    <Shell>
      <div className="mx-auto max-w-6xl">
        <div>
          <Link href="/jobs" className="inline-flex items-center gap-1 text-sm font-medium text-ink-500 hover:text-ink-900">
            <ArrowLeft size={15} aria-hidden="true" />
            Historial
          </Link>
        </div>

        {isLoading ? (
          <p className="mt-6 flex items-center gap-2 text-sm text-ink-500">
            <Loader2 size={16} className="animate-spin" aria-hidden="true" />
            Cargando…
          </p>
        ) : error ? (
          <div className="mt-6 max-w-xl">
            <Notice tone="danger" icon={AlertCircle} role="alert">
              <p className="font-semibold">No encontramos esta conversión</p>
              <p className="mt-0.5">{error.message}</p>
            </Notice>
            <Link href="/" className={`${buttonStyles.primary} mt-4`}>Convertir un archivo</Link>
          </div>
        ) : (
          <>
            <div className="mb-6 mt-3 flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="truncate text-[28px] font-bold leading-tight text-ink-900">{job.fileName}</h1>
                <p className="mt-1 text-ink-500">
                  {[
                    job.selectedSheet ? `Hoja «${job.selectedSheet}», ${(job.sheets.find((sheet) => sheet.name === job.selectedSheet)?.rowCount ?? 0).toLocaleString('es-CL')} filas` : null,
                    job.template ? `plantilla ${job.template.name} v${job.template.version}` : null,
                    `subido a las ${formatTime(job.createdAt)}`
                  ].filter(Boolean).join(', ').replace(/^./, (letter) => letter.toUpperCase())}.
                  {advanced ? <span className="ml-2 font-mono text-xs text-ink-400">{job.id}</span> : null}
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
            <ParametersContext.Provider value={job.workingTemplate?.parameters || []}>
              <JobWorkspace key={job.id} job={job} setJob={setJob} />
            </ParametersContext.Provider>
          </>
        )}
      </div>
    </Shell>
  );
}

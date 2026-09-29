'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Check, CheckCircle2, ChevronDown, Download, FileSpreadsheet, Loader2, Play, Sparkles, Table2 } from 'lucide-react';
import { downloadBlob } from '../../lib/download';
import { api } from '../../lib/api';
import { maskValue } from '../../lib/preview';
import { formatCell } from '../../lib/template-editor';
import { buttonStyles, Notice } from '../panel';
import { FilePreview } from '../template-editor/file-preview';
import { StepRail } from './step-rail';

const sourceTypes = new Set(['COLUMN', 'SPLIT_WORD', 'SPLIT_WORD_RANGE']);

function SheetChooser({ job, onSelect, isBusy }) {
  const sheets = job.sheets.filter((sheet) => sheet.rowCount > 0);
  return (
    <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Hoja">
      {sheets.map((sheet) => (
        <button
          key={sheet.name}
          type="button"
          role="radio"
          aria-checked={sheet.name === job.selectedSheet}
          disabled={isBusy}
          className="flex items-start gap-3 rounded-lg border border-ink-200 bg-white p-4 text-left hover:border-cobalt-500 hover:bg-cobalt-50/50"
          onClick={() => onSelect(sheet.name)}
        >
          <Table2 className="mt-0.5 shrink-0 text-cobalt-600" size={20} aria-hidden="true" />
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-ink-900">{sheet.name}</span>
            <span className="block text-sm text-ink-500">{sheet.rowCount} filas</span>
            <span className="mt-1 block truncate text-xs text-ink-500">{sheet.headers.slice(0, 5).join(', ')}{sheet.headers.length > 5 ? ' …' : ''}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

function isFullMatch(match) {
  return match && match.requiredMissing === 0 && match.matched === match.total;
}

// Suggests the destination template; re-applies the one used last time automatically when it fits completely.
function TemplateChooser({ job, onApply, onAdvanced, isBusy, allowAutoApply }) {
  const [state, setState] = useState({ templates: null, matches: null, error: null });
  const [showAll, setShowAll] = useState(false);
  const autoApplied = useRef(false);

  useEffect(() => {
    let active = true;
    Promise.all([api.listTemplates(), api.getTemplateMatches(job.id)])
      .then(([templates, matches]) => active && setState({ templates, matches, error: null }))
      .catch((error) => active && setState({ templates: null, matches: null, error }));
    return () => {
      active = false;
    };
  }, [job.id, job.selectedSheet]);

  const ranked = useMemo(() => {
    if (!state.templates) return [];
    const byId = new Map(state.templates.map((template) => [template.id, template]));
    return state.matches.map((match) => ({ ...match, template: byId.get(match.templateId) })).filter((item) => item.template);
  }, [state]);

  const best = ranked[0];
  const shouldAutoApply = allowAutoApply && isFullMatch(best) && best.lastUsedAt;

  useEffect(() => {
    if (shouldAutoApply && !autoApplied.current) {
      autoApplied.current = true;
      onApply({ templateId: best.templateId }, { auto: true });
    }
  }, [shouldAutoApply, best, onApply]);

  if (state.error) return <Notice tone="danger" icon={AlertCircle} role="alert">No pudimos cargar las plantillas: {state.error.message}</Notice>;
  if (!state.templates || shouldAutoApply) {
    return <p className="flex items-center gap-2 text-sm text-ink-500"><Loader2 size={16} className="animate-spin" aria-hidden="true" />Buscando la plantilla que corresponde a tu archivo…</p>;
  }

  const recommended = ranked.filter(isFullMatch);
  const related = ranked.filter((item) => item.matched > 0);
  const visible = showAll ? ranked : recommended.length ? recommended.slice(0, 3) : related;

  if (!related.length && !showAll) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-ink-700">Ninguna plantilla guardada corresponde a las columnas de este archivo.</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={buttonStyles.primary} onClick={onAdvanced}>Crear una plantilla para este archivo</button>
          {ranked.length ? <button type="button" className={buttonStyles.secondary} onClick={() => setShowAll(true)}>Ver todas las plantillas ({ranked.length})</button> : null}
        </div>
        <p className="text-xs text-ink-500">Crear plantillas usa el modo avanzado. Si no te corresponde hacerlo, pide ayuda a quien administra los formatos.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-2" role="list" aria-label="Plantillas">
        {visible.map((item, index) => {
          const full = isFullMatch(item);
          const best = index === 0 && full;
          const share = item.total ? item.matched / item.total : 0;
          return (
            <div key={item.templateId} role="listitem" className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 rounded-md border bg-white px-4 py-3.5 ${best ? 'border-cobalt-600 shadow-[inset_4px_0_0_#2f6b4f]' : 'border-ink-200'}`}>
              <div className="min-w-0">
                <p className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-base font-bold text-ink-900">{item.template.name}</span>
                  <span className="text-sm text-ink-500">{[item.template.destination, item.template.process].filter(Boolean).join(', ')}</span>
                </p>
                <p className="text-sm text-ink-700">
                  {full ? `Calza con las ${item.total} columnas de origen.` : `Calza con ${item.matched} de ${item.total} columnas; faltarían ${item.total - item.matched}.`}
                  {item.lastUsedAt ? ' La usaste antes.' : ''}
                </p>
                <span aria-hidden="true" className="mt-1.5 block h-1.5 max-w-xs overflow-hidden rounded-full bg-ink-100">
                  <span className={`block h-full ${full ? 'bg-cobalt-600' : 'bg-amber-400'}`} style={{ width: `${Math.round(share * 100)}%` }} />
                </span>
              </div>
              <button type="button" disabled={isBusy} className={best ? buttonStyles.primary : buttonStyles.secondary} onClick={() => onApply({ templateId: item.templateId })}>
                Usar esta
              </button>
            </div>
          );
        })}
        <div role="listitem" className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 rounded-md border border-dashed border-ink-300 px-4 py-3.5">
          <div>
            <p className="font-bold text-ink-900">No está la que necesito</p>
            <p className="text-sm text-ink-700">Crea una plantilla nueva a partir de este archivo (usa el modo avanzado).</p>
          </div>
          <button type="button" className={buttonStyles.secondary} onClick={onAdvanced}>Crear plantilla</button>
        </div>
      </div>
      {!showAll && ranked.length > visible.length ? (
        <button type="button" className="text-sm font-semibold text-cobalt-700 hover:underline" onClick={() => setShowAll(true)}>Ver todas las plantillas ({ranked.length})</button>
      ) : null}
    </div>
  );
}

function sampleText(column, value) {
  const text = formatCell(value);
  return maskValue(column, text);
}

// Only the columns that need attention, with the minimum controls to resolve them.
function ColumnReview({ evaluation, headers, sample, onChangeSource, onConfirm, onConfirmAll }) {
  const problems = evaluation.rows.filter((row) => row.status !== 'OK');
  const pending = problems.filter((row) => row.status === 'REQUIERE_CONFIRMACION');

  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {problems.map(({ column, status, reason }) => {
          const example = sample ? sampleText(column, sample.result.output[column.outputName]) : '';
          const canPickColumn = status === 'FALTANTE' && (sourceTypes.has(column.source.type) || column.source.type === 'EMPTY');
          return (
            <li key={column.id} className={`rounded-lg border p-3 ${status === 'FALTANTE' ? 'border-rose-200 bg-rose-50/40' : 'border-amber-200 bg-amber-50/40'}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink-900">{column.outputName}</p>
                  <p className="text-xs text-ink-700">{reason}</p>
                  {status === 'REQUIERE_CONFIRMACION' && example ? <p className="mt-1 text-xs text-ink-500">Resultado de ejemplo: <span className="font-mono font-semibold text-ink-900">{example}</span></p> : null}
                </div>
                {status === 'REQUIERE_CONFIRMACION' ? (
                  <button type="button" className="inline-flex h-8 items-center gap-1 rounded-md border border-amber-200 bg-white px-2 text-sm font-semibold text-amber-700 hover:bg-amber-50" onClick={() => onConfirm(column.id)}>
                    <Check size={14} aria-hidden="true" />
                    Está bien
                  </button>
                ) : null}
              </div>
              {canPickColumn ? (
                <label className="mt-2 block text-xs text-ink-500">
                  ¿En qué columna de tu archivo viene?
                  <select
                    className="mt-1 h-9 w-full max-w-sm rounded-md border border-ink-200 bg-white px-2 text-sm text-ink-900"
                    value=""
                    onChange={(event) => onChangeSource(column, event.target.value)}
                  >
                    <option value="">Elegir columna…</option>
                    {headers.map((header) => <option key={header} value={header}>{header}</option>)}
                  </select>
                </label>
              ) : null}
            </li>
          );
        })}
      </ul>
      {pending.length > 1 ? (
        <button type="button" className={buttonStyles.secondary} onClick={() => onConfirmAll(pending.map((row) => row.column.id))}>
          <CheckCircle2 size={16} aria-hidden="true" />
          Revisé los ejemplos, todo está bien
        </button>
      ) : null}
    </div>
  );
}

export function QuickFlow({ job, template, evaluation, results, design = null, parametersForm = null, sampleCount, sample, headers, isBusy, blockedReason, onSelectSheet, onApply, onChangeSource, onConfirm, onConfirmAll, onGenerate, onAdvanced }) {
  const [changingTemplate, setChangingTemplate] = useState(false);
  const [mode, setMode] = useState('LENIENT');
  const [autoApplied, setAutoApplied] = useState(false);
  const [changingSheet, setChangingSheet] = useState(false);
  const withData = job.sheets.filter((sheet) => sheet.rowCount > 0);
  const sheet = job.sheets.find((candidate) => candidate.name === job.selectedSheet);
  const showTemplatePicker = !template || changingTemplate;

  async function apply(selection, options = {}) {
    await onApply(selection);
    setChangingTemplate(false);
    setAutoApplied(Boolean(options.auto));
  }

  const pickingSheet = !job.selectedSheet || changingSheet;
  const needsReview = !pickingSheet && !showTemplatePicker && evaluation && !evaluation.isComplete;
  const pendingCount = evaluation ? evaluation.counts.pending + evaluation.counts.missing : 0;
  const columnStatus = evaluation ? new Map(evaluation.rows.map((row) => [row.column.outputName, row.status])) : null;
  const hasParameters = Boolean(template?.parameters?.length);
  const onPreview = !pickingSheet && !showTemplatePicker;

  const steps = [
    {
      id: 'sheet',
      label: 'Hoja',
      detail: job.selectedSheet ? `${job.selectedSheet}, ${sheet?.rowCount ?? 0} filas` : 'Elige con cuál trabajar',
      state: pickingSheet ? 'current' : 'done',
      onClick: withData.length > 1 && !pickingSheet ? () => setChangingSheet(true) : undefined
    },
    {
      id: 'template',
      label: 'Plantilla',
      detail: template ? (job.template ? job.template.name : 'Nueva, sin guardar') : 'Elige la salida',
      state: pickingSheet ? 'todo' : showTemplatePicker ? 'current' : 'done',
      onClick: template && !showTemplatePicker ? () => setChangingTemplate(true) : undefined
    },
    {
      id: 'columns',
      label: 'Columnas',
      detail: onPreview && evaluation ? (evaluation.isComplete ? `Las ${evaluation.counts.total} listas` : `${pendingCount} por revisar`) : 'Se revisan en la vista previa',
      state: !onPreview ? 'todo' : needsReview ? 'current' : 'done'
    },
    ...(hasParameters ? [{ id: 'data', label: 'Datos del archivo', detail: 'Se piden antes de generar', state: onPreview && !needsReview ? 'current' : 'todo' }] : []),
    { id: 'generate', label: 'Generar', detail: 'Crea el archivo final', state: onPreview && !needsReview && !hasParameters ? 'current' : 'todo' }
  ];

  let content;
  if (pickingSheet) {
    content = (
      <section>
        <h2 className="text-xl font-bold text-ink-900">¿Qué hoja convertimos?</h2>
        <p className="mb-4 mt-1 text-ink-500">Tu archivo tiene {withData.length} hojas con datos.</p>
        <SheetChooser
          job={job}
          isBusy={isBusy}
          onSelect={async (name) => {
            if (name !== job.selectedSheet) await onSelectSheet(name);
            setChangingSheet(false);
          }}
        />
      </section>
    );
  } else if (showTemplatePicker) {
    content = (
      <section>
        <h2 className="text-xl font-bold text-ink-900">¿A qué lo convertimos?</h2>
        <p className="mb-4 mt-1 text-ink-500">Hoja «{job.selectedSheet}», {sheet?.rowCount ?? 0} filas y {sheet?.headers.length ?? 0} columnas. Ordenamos las plantillas por cuánto calzan con tu archivo.</p>
        <TemplateChooser job={job} isBusy={isBusy} onApply={apply} onAdvanced={onAdvanced} allowAutoApply={!template && !changingTemplate} />
        {changingTemplate ? <button type="button" className="mt-3 text-sm font-semibold text-ink-500 hover:underline" onClick={() => setChangingTemplate(false)}>Seguir con la plantilla actual</button> : null}
      </section>
    );
  } else {
    content = (
      <div className="space-y-6">
        {autoApplied || job.reusedFromJobId ? (
          <p className="flex items-center gap-1.5 text-sm text-mint-600">
            <Sparkles size={14} aria-hidden="true" />
            {autoApplied ? 'Usamos la misma plantilla que la última vez.' : 'Usamos la misma configuración de tu conversión anterior.'}
          </p>
        ) : null}

        {needsReview ? (
          <section>
            <h2 className="text-xl font-bold text-ink-900">Revisa {pendingCount === 1 ? 'esta columna' : `estas ${pendingCount} columnas`}</h2>
            <p className="mb-3 mt-1 text-ink-500">Están marcadas en ámbar o rojo en la grilla de abajo.</p>
            <ColumnReview evaluation={evaluation} headers={headers} sample={sample} onChangeSource={onChangeSource} onConfirm={onConfirm} onConfirmAll={onConfirmAll} />
          </section>
        ) : null}

        <section>
          <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="text-xl font-bold text-ink-900">Así quedará tu archivo</h2>
            {evaluation ? (
              <span className={`text-sm font-semibold ${evaluation.isComplete ? 'text-mint-600' : 'text-amber-700'}`}>
                {evaluation.counts.ok} de {evaluation.counts.total} columnas listas
              </span>
            ) : null}
            {job.template ? (
              <button type="button" className="ml-auto inline-flex items-center gap-1 text-sm font-semibold text-cobalt-700 hover:underline" onClick={async () => downloadBlob(await api.downloadTemplateExample(job.template.id))}>
                <Download size={14} aria-hidden="true" />
                Excel de ejemplo de la plantilla
              </button>
            ) : null}
          </div>
          {results ? <FilePreview template={template} results={results} sampleCount={sampleCount} design={design} columnStatus={columnStatus} /> : <p className="flex items-center gap-2 text-sm text-ink-500"><Loader2 size={16} className="animate-spin" aria-hidden="true" />Preparando vista previa…</p>}
        </section>

        <section className="space-y-4 rounded-md border border-ink-200 bg-white p-4">
          {parametersForm}
          <div className="flex flex-wrap items-end justify-between gap-3">
            <label className="text-sm text-ink-700">
              Si una fila tiene errores
              <span className="relative mt-1 block">
                <select className="h-10 appearance-none rounded-md border border-ink-200 bg-white pl-3 pr-9 text-sm text-ink-900" value={mode} onChange={(event) => setMode(event.target.value)}>
                  <option value="LENIENT">Sacarla del archivo y entregármela aparte</option>
                  <option value="STRICT">No generar el archivo</option>
                </select>
                <ChevronDown size={14} className="pointer-events-none absolute right-3 top-3 text-ink-400" aria-hidden="true" />
              </span>
            </label>
            <div className="flex flex-wrap items-center justify-end gap-3">
              {blockedReason ? <p id="quick-blocked-reason" className="text-sm text-ink-700">{blockedReason}</p> : null}
              <button type="button" className={buttonStyles.primary} disabled={isBusy || Boolean(blockedReason)} aria-describedby={blockedReason ? 'quick-blocked-reason' : undefined} onClick={() => onGenerate(mode)}>
                <Play size={16} aria-hidden="true" />
                Generar archivo
              </button>
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[232px_minmax(0,1fr)]">
      <StepRail steps={steps} label="Pasos de la conversión" />
      <div className="min-w-0">{content}</div>
    </div>
  );
}

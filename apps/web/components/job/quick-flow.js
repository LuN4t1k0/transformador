'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Check, CheckCircle2, ChevronDown, Download, FileSpreadsheet, Loader2, Play, Sparkles, Table2 } from 'lucide-react';
import { downloadBlob } from '../../lib/download';
import { api } from '../../lib/api';
import { maskRut } from '../../lib/preview';
import { formatCell, isRutColumn } from '../../lib/template-editor';
import { buttonStyles, Notice } from '../panel';
import { FilePreview } from '../template-editor/file-preview';

const cardClass = 'rounded-lg border border-ink-200 bg-white shadow-panel';
const sourceTypes = new Set(['COLUMN', 'SPLIT_WORD', 'SPLIT_WORD_RANGE']);

function Step({ number, title, done, children, action }) {
  return (
    <section className={cardClass}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-100 px-4 py-3 sm:px-5">
        <h2 className="flex items-center gap-2 text-base font-semibold text-ink-900">
          <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${done ? 'bg-mint-600 text-white' : 'bg-cobalt-600 text-white'}`}>
            {done ? <Check size={14} aria-hidden="true" /> : number}
          </span>
          {title}
        </h2>
        {action}
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

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
            <span className="mt-1 block truncate text-xs text-ink-500">{sheet.headers.slice(0, 5).join(' · ')}{sheet.headers.length > 5 ? ' …' : ''}</span>
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
      <p className="text-sm text-ink-700">
        {recommended.length
          ? `${recommended.length === 1 ? 'Esta plantilla reconoce' : 'Estas plantillas reconocen'} todas las columnas de tu archivo:`
          : 'Ninguna plantilla reconoce todas las columnas. Elige la más cercana y te mostraremos qué falta:'}
      </p>
      <div className="grid gap-2" role="radiogroup" aria-label="Plantilla">
        {visible.map((item, index) => (
          <button
            key={item.templateId}
            type="button"
            role="radio"
            aria-checked={false}
            disabled={isBusy}
            className="flex w-full items-start gap-3 rounded-lg border border-ink-200 bg-white p-4 text-left hover:border-cobalt-500 hover:bg-cobalt-50/50"
            onClick={() => onApply({ templateId: item.templateId })}
          >
            <FileSpreadsheet className="mt-0.5 shrink-0 text-cobalt-600" size={20} aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-ink-900">{item.template.name}</span>
                {index === 0 && isFullMatch(item) ? <span className="inline-flex items-center gap-1 rounded-full bg-mint-50 px-2 text-xs font-semibold text-mint-600 ring-1 ring-inset ring-mint-100"><Sparkles size={12} aria-hidden="true" />Recomendada</span> : null}
              </span>
              <span className="block text-xs text-ink-500">
                {[item.template.destination, item.template.process].filter(Boolean).join(' · ') || 'Sin clasificar'}
                {item.lastUsedAt ? ' · la usaste antes' : ''}
              </span>
              <span className={`mt-1 block text-xs ${isFullMatch(item) ? 'text-mint-600' : 'text-amber-700'}`}>
                {isFullMatch(item) ? 'Reconoce todas las columnas' : `Reconoce ${item.matched} de ${item.total} columnas`}
              </span>
            </span>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        {!showAll && ranked.length > visible.length ? (
          <button type="button" className="font-medium text-cobalt-700 hover:underline" onClick={() => setShowAll(true)}>Ver todas las plantillas ({ranked.length})</button>
        ) : null}
        <button type="button" className="text-ink-500 hover:text-ink-900 hover:underline" onClick={onAdvanced}>¿No está la plantilla? Créala en modo avanzado</button>
      </div>
    </div>
  );
}

function sampleText(column, value) {
  const text = formatCell(value);
  return isRutColumn(column) && text ? maskRut(text) : text;
}

// Only the columns that need attention, with the minimum controls to resolve them.
function ColumnReview({ evaluation, headers, sample, onChangeSource, onConfirm, onConfirmAll }) {
  const problems = evaluation.rows.filter((row) => row.status !== 'OK');
  const pending = problems.filter((row) => row.status === 'REQUIERE_CONFIRMACION');

  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-700">Revisa {problems.length === 1 ? 'esta columna' : `estas ${problems.length} columnas`} antes de generar:</p>
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

export function QuickFlow({ job, template, evaluation, results, sampleCount, sample, headers, isBusy, blockedReason, onSelectSheet, onApply, onChangeSource, onConfirm, onConfirmAll, onGenerate, onAdvanced }) {
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

  if (!job.selectedSheet || changingSheet) {
    return (
      <Step number={1} title="¿Qué hoja quieres convertir?">
        <p className="mb-3 text-sm text-ink-700">Tu archivo tiene {withData.length} hojas con datos.</p>
        <SheetChooser
          job={job}
          isBusy={isBusy}
          onSelect={async (name) => {
            if (name !== job.selectedSheet) await onSelectSheet(name);
            setChangingSheet(false);
          }}
        />
      </Step>
    );
  }

  return (
    <div className="space-y-4">
      <Step
        number={1}
        title={showTemplatePicker ? '¿Para qué destino es este archivo?' : `Plantilla: ${job.template ? job.template.name : 'nueva'}`}
        done={!showTemplatePicker}
        action={!showTemplatePicker ? <button type="button" className="text-sm font-medium text-cobalt-700 hover:underline" onClick={() => setChangingTemplate(true)}>Cambiar</button> : null}
      >
        {showTemplatePicker ? (
          <TemplateChooser job={job} isBusy={isBusy} onApply={apply} onAdvanced={onAdvanced} allowAutoApply={!template && !changingTemplate} />
        ) : (
          <div className="space-y-1 text-sm text-ink-700">
            {autoApplied ? <p className="flex items-center gap-1.5 text-mint-600"><Sparkles size={14} aria-hidden="true" />Usamos la misma plantilla que la última vez.</p> : null}
            {!autoApplied && job.reusedFromJobId ? <p className="flex items-center gap-1.5 text-mint-600"><Sparkles size={14} aria-hidden="true" />Usamos la misma configuración de tu conversión anterior.</p> : null}
            <p>
              Hoja «{job.selectedSheet}» · {sheet?.rowCount} filas
              {withData.length > 1 ? <> · <button type="button" className="font-medium text-cobalt-700 hover:underline" onClick={() => setChangingSheet(true)}>cambiar hoja</button></> : null}
            </p>
            <p className={evaluation?.isComplete ? 'text-mint-600' : 'text-amber-700'}>
              {evaluation?.isComplete
                ? `Todas las columnas (${evaluation.counts.total}) están listas.`
                : `${evaluation.counts.ok} de ${evaluation.counts.total} columnas listas.`}
            </p>
            {job.template ? (
              <button type="button" className="inline-flex items-center gap-1 text-xs font-medium text-cobalt-700 hover:underline" onClick={async () => downloadBlob(await api.downloadTemplateExample(job.template.id))}>
                <Download size={13} aria-hidden="true" />
                Excel de ejemplo de esta plantilla
              </button>
            ) : null}
          </div>
        )}
      </Step>

      {!showTemplatePicker && evaluation && !evaluation.isComplete ? (
        <Step number={2} title="Revisa estas columnas">
          <ColumnReview evaluation={evaluation} headers={headers} sample={sample} onChangeSource={onChangeSource} onConfirm={onConfirm} onConfirmAll={onConfirmAll} />
        </Step>
      ) : null}

      {!showTemplatePicker ? (
        <Step number={evaluation?.isComplete ? 2 : 3} title="Así quedará tu archivo" done={false}>
          {results ? <FilePreview template={template} results={results} sampleCount={sampleCount} /> : <p className="flex items-center gap-2 text-sm text-ink-500"><Loader2 size={16} className="animate-spin" aria-hidden="true" />Preparando vista previa…</p>}

          <div className="mt-5 flex flex-wrap items-end justify-between gap-3 border-t border-ink-100 pt-4">
            <label className="text-xs text-ink-500">
              Si alguna fila tiene errores
              <span className="relative mt-1 block">
                <select className="h-9 appearance-none rounded-md border border-ink-200 bg-white pl-2 pr-8 text-sm text-ink-900" value={mode} onChange={(event) => setMode(event.target.value)}>
                  <option value="LENIENT">Sacarla del archivo y entregármela aparte</option>
                  <option value="STRICT">No generar el archivo</option>
                </select>
                <ChevronDown size={14} className="pointer-events-none absolute right-2 top-2.5 text-ink-400" aria-hidden="true" />
              </span>
            </label>
            <div className="flex flex-wrap items-center justify-end gap-3">
              {blockedReason ? <p id="quick-blocked-reason" className="text-sm text-ink-500">{blockedReason}</p> : null}
              <button type="button" className={buttonStyles.primary} disabled={isBusy || Boolean(blockedReason)} aria-describedby={blockedReason ? 'quick-blocked-reason' : undefined} onClick={() => onGenerate(mode)}>
                <Play size={16} aria-hidden="true" />
                Generar archivo
              </button>
            </div>
          </div>
        </Step>
      ) : null}
    </div>
  );
}

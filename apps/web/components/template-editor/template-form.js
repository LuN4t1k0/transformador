'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import { AlertCircle, FileSpreadsheet, Loader2, Save, Sparkles, X } from 'lucide-react';
import { evaluateColumns } from '@previley-transformer/template-engine/src/mapping.js';
import { runRows } from '@previley-transformer/template-engine/src/run.js';
import { previewRows } from '@previley-transformer/template-engine/src/rows.js';
import { previewParameters } from '@previley-transformer/template-engine/src/params.js';
import { previewDesign } from '@previley-transformer/template-engine/src/output-design.js';
import { ParametersContext } from './parameters-context';
import { ParametersEditor } from './parameters-editor';
import { AssistantPanel } from './assistant-panel';
import { ExampleReport } from './example-report';
import { api } from '../../lib/api';
import { reviveSampleRows } from '../../lib/template-editor';
import { buttonStyles, Notice, Panel } from '../panel';
import { ColumnList } from './column-list';
import { FilePreview } from './file-preview';
import { RowStepsEditor, RowStepsNote } from './row-steps-editor';
import { withColumns } from '../../lib/template-editor';
import { OutputEditor } from './output-editor';
import { inputClass } from './source-editor';

const labelClass = 'mb-1 block text-xs font-medium text-ink-500';

function knownHeaderNames(columns) {
  const names = new Set();
  for (const column of columns) {
    const { source } = column;
    if (source.column) names.add(source.column);
    for (const part of source.parts || []) if (part.column) names.add(part.column);
    for (const alias of column.aliases || []) names.add(alias);
  }
  return [...names].sort();
}

// Loads an Excel only to try the template on real rows; nothing is saved.
function SampleLoader({ sample, onLoaded }) {
  const inputId = useId();
  const [state, setState] = useState({ loading: false, error: '' });

  async function load(file) {
    setState({ loading: true, error: '' });
    try {
      const draft = await api.createTemplateDraft({ input: file });
      onLoaded({ fileName: draft.input.fileName, sheet: draft.input.sheet, headers: draft.input.headers, rows: reviveSampleRows(draft.input.sampleRows), exampleRows: draft.input.exampleRows, percentHeaders: draft.input.percentHeaders || [] });
      setState({ loading: false, error: '' });
    } catch (error) {
      setState({ loading: false, error: error.message });
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      {sample ? <span className="inline-flex items-center gap-1 text-ink-700"><FileSpreadsheet size={15} className="text-cobalt-600" aria-hidden="true" />Probando con «{sample.fileName}» (hoja {sample.sheet})</span> : null}
      <label htmlFor={inputId} className={`${buttonStyles.secondary} cursor-pointer ${state.loading ? 'pointer-events-none opacity-60' : ''}`}>
        {state.loading ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <FileSpreadsheet size={16} aria-hidden="true" />}
        {sample ? 'Probar con otro Excel' : 'Probar con un Excel'}
      </label>
      <input id={inputId} type="file" className="sr-only" accept=".xlsx" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) load(file); }} />
      {state.error ? <span role="alert" className="text-xs text-rose-700">{state.error}</span> : null}
    </div>
  );
}

// Template editor: metadata, columns and output format. With a sample Excel it offers real headers, examples and a preview.
export function TemplateForm({ initial, submitLabel, onSubmit, note, initialSample = null, outputExample = null, report = null }) {
  const [template, setTemplate] = useState(initial);
  const [sample, setSample] = useState(initialSample);
  // Columns suggested by a similar header name stay marked until the user accepts or changes them.
  const [flagged, setFlagged] = useState(() => new Map(
    initial.columns.filter((column) => report?.suggested?.includes(column.outputName)).map((column) => [column.id, 'Sugerida'])
  ));
  const unflag = (id) => setFlagged((current) => {
    const next = new Map(current);
    next.delete(id);
    return next;
  });
  const [facets, setFacets] = useState({ destinations: [], processes: [] });
  const [activeTab, setActiveTab] = useState('columns');
  // The assistant lives in a side panel, so it can be opened from any tab and keeps its proposal while open or closed.
  const [assistantOpen, setAssistantOpen] = useState(false);
  useEffect(() => {
    if (!assistantOpen) return undefined;
    document.getElementById('assistant-instruction')?.focus();
    const onKey = (event) => event.key === 'Escape' && setAssistantOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [assistantOpen]);
  const [columnsView, setColumnsView] = useState('workbench');
  const [selectedId, setSelectedId] = useState(null);
  const [state, setState] = useState({ saving: false, error: null });
  const suggestions = useMemo(() => knownHeaderNames(template.columns), [template.columns]);
  const evaluation = useMemo(
    () => (sample ? evaluateColumns(template.columns, sample.headers, new Set(template.columns.map((column) => column.id))) : null),
    [template.columns, sample]
  );
  // Parameters take their default value in the preview.
  const params = useMemo(() => previewParameters(template.parameters || []), [template.parameters]);
  // Column examples use each row on its own; the preview applies the row steps (filter, group, sort…).
  const results = useMemo(() => {
    if (!sample?.rows?.length) return null;
    try {
      return runRows(sample.rows, template, new Date(), params);
    } catch {
      return null;
    }
  }, [template, sample, params]);
  const preview = useMemo(() => {
    if (!sample?.rows?.length) return null;
    try {
      const rows = previewRows(sample.rows, template, new Date(), params);
      return { ...rows, design: previewDesign(template.name?.trim() ? template : { ...template, name: 'nombre-plantilla' }, rows.results, { inputName: sample.fileName.replace(/\.xlsx$/i, ''), sheet: sample.sheet, now: new Date(), params }) };
    } catch {
      return null;
    }
  }, [template, sample, params]);

  useEffect(() => {
    api.getTemplateFacets().then(setFacets).catch(() => {});
  }, []);

  async function submit(event) {
    event.preventDefault();
    setState({ saving: true, error: null });
    try {
      await onSubmit(template);
    } catch (error) {
      setState({ saving: false, error });
    }
  }

  const setMeta = (field) => (event) => setTemplate({ ...template, [field]: event.target.value });
  const columnStatus = evaluation ? new Map(evaluation.rows.map((row) => [row.column.outputName, row.status])) : null;
  const pendingColumns = evaluation ? evaluation.counts.pending + evaluation.counts.missing : 0;
  const tabs = [
    { id: 'columns', label: 'Columnas', badge: pendingColumns || null },
    { id: 'rows', label: 'Filas', badge: null },
    { id: 'output', label: 'Archivo de salida', badge: null },
    { id: 'params', label: 'Datos al generar', badge: template.parameters?.length || null },
    { id: 'details', label: 'Descripción', badge: null }
  ];

  // The live file, under every part of the template; in Columnas its headers also select the column to edit.
  function renderPreview({ selectable = false } = {}) {
    if (!preview) {
      return (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-dashed border-ink-300 bg-white px-4 py-5">
          <p className="max-w-[60ch] text-sm text-ink-700">Carga un Excel de prueba para ver aquí cómo queda el archivo final mientras editas.</p>
          <SampleLoader sample={sample} onLoaded={setSample} />
        </div>
      );
    }
    return (
      <section aria-label="Vista previa del archivo final">
        <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="text-lg font-bold text-ink-900">Así queda el archivo</h2>
          <span className="text-sm text-ink-500">Con las primeras filas de «{sample.fileName}».{selectable ? ' Haz clic en una columna para editarla.' : ''}</span>
        </div>
        <RowStepsNote preview={preview} sampleCount={sample.rows.length} />
        <FilePreview
          template={template}
          results={preview.results}
          sampleCount={sample.rows.length}
          design={preview.design}
          columnStatus={columnStatus}
          selectedColumn={selectable ? selectedId || template.columns[0]?.id : null}
          onSelectColumn={selectable ? (id) => { setSelectedId(id); setColumnsView('workbench'); } : null}
        />
      </section>
    );
  }

  return (
    <ParametersContext.Provider value={template.parameters || []}>
    <form className="space-y-5" onSubmit={submit}>
      <div className="-mx-4 border-b border-ink-200 bg-canvas/95 px-4 pb-0 pt-3 backdrop-blur sm:-mx-6 sm:px-6 lg:sticky lg:top-0 lg:z-10 lg:-mx-8 lg:px-8">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1 basis-64">
            <label className={labelClass} htmlFor="template-name">Nombre de la plantilla *</label>
            <input id="template-name" required maxLength={120} className="h-11 w-full rounded-md border border-ink-200 bg-white px-3 text-lg font-bold text-ink-900" value={template.name} onChange={setMeta('name')} placeholder="Ej: PlanVital 2026" />
          </div>
          <SampleLoader sample={sample} onLoaded={setSample} />
          {sample?.exampleRows ? (
            <button
              type="button"
              className={assistantOpen ? `${buttonStyles.secondary} border-cobalt-600 text-cobalt-700` : buttonStyles.secondary}
              title="La IA propone de dónde sale cada columna comparando tus archivos"
              aria-expanded={assistantOpen}
              aria-controls="asistente"
              onClick={() => setAssistantOpen((open) => !open)}
            >
              <Sparkles size={16} aria-hidden="true" />
              Asistente
            </button>
          ) : null}
          <button type="submit" className={buttonStyles.primary} disabled={state.saving}>
            {state.saving ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Save size={16} aria-hidden="true" />}
            {submitLabel}
          </button>
        </div>
        <div role="tablist" aria-label="Partes de la plantilla" className="mt-3 flex gap-1 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              className={`-mb-px flex h-10 shrink-0 items-center gap-2 border-b-2 px-3 text-[15px] font-semibold ${activeTab === tab.id ? 'border-cobalt-600 text-ink-900' : 'border-transparent text-ink-500 hover:text-ink-900'}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
              {tab.badge ? <span className={`rounded-full px-1.5 text-xs tabular-nums ${tab.id === 'columns' ? 'bg-amber-100 text-amber-700' : 'bg-ink-100 text-ink-700'}`}>{tab.badge}</span> : null}
            </button>
          ))}
        </div>
      </div>

      {state.error ? <Notice tone="danger" icon={AlertCircle} role="alert">{state.error.message}</Notice> : null}

      {activeTab === 'details' ? (
      <section className="max-w-3xl space-y-4" role="tabpanel" aria-label="Descripción">
        {note ? <p className="text-ink-500">{note}</p> : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor="template-destination">Destino</label>
            <input id="template-destination" list="template-destinations" maxLength={80} className={inputClass} value={template.destination || ''} onChange={setMeta('destination')} placeholder="Ej: PlanVital, TGR" />
            <datalist id="template-destinations">{facets.destinations.map((value) => <option key={value} value={value} />)}</datalist>
          </div>
          <div>
            <label className={labelClass} htmlFor="template-process">Proceso</label>
            <input id="template-process" list="template-processes" maxLength={80} className={inputClass} value={template.process || ''} onChange={setMeta('process')} placeholder="Ej: Licencias PAGEX, Moras presuntas" />
            <datalist id="template-processes">{facets.processes.map((value) => <option key={value} value={value} />)}</datalist>
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass} htmlFor="template-description">Descripción</label>
            <input id="template-description" maxLength={500} className={inputClass} value={template.description || ''} onChange={setMeta('description')} />
          </div>
        </div>
      </section>
      ) : null}

      {activeTab === 'params' ? (
        <div className="space-y-6" role="tabpanel" aria-label="Datos al generar">
          <section className="max-w-4xl">
            <h2 className="text-lg font-bold text-ink-900">Datos que se piden al generar</h2>
            <p className="mb-3 mt-1 text-ink-500">Opcional: valores que se escriben cada vez que se genera el archivo, como el periodo o una fecha de corte.</p>
            <ParametersEditor parameters={template.parameters || []} onChange={(parameters) => setTemplate({ ...template, parameters })} />
          </section>
          {renderPreview()}
        </div>
      ) : null}

      {activeTab === 'columns' ? (
      <div className="space-y-5" role="tabpanel" aria-label="Columnas">
      <ExampleReport report={report} assistantAvailable={Boolean(sample?.exampleRows)} onOpenAssistant={() => setAssistantOpen(true)} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-[70ch] text-sm text-ink-500">
          {sample ? 'Elige cada columna para ver y cambiar de dónde sale y su formato; el resultado se ve abajo al instante.' : 'Sin un Excel de prueba, el origen se escribe con el nombre del encabezado que tendrá el archivo. Carga uno para ver ejemplos y la vista previa.'}
        </p>
        <div role="group" aria-label="Vista de columnas" className="inline-flex rounded-md border border-ink-200 bg-white p-0.5 text-sm font-semibold">
          <button type="button" aria-pressed={columnsView === 'workbench'} className={`rounded px-3 py-1.5 ${columnsView === 'workbench' ? 'bg-cobalt-50 text-cobalt-700' : 'text-ink-500 hover:text-ink-900'}`} onClick={() => setColumnsView('workbench')}>Mesa de trabajo</button>
          <button type="button" aria-pressed={columnsView === 'list'} className={`rounded px-3 py-1.5 ${columnsView === 'list' ? 'bg-cobalt-50 text-cobalt-700' : 'text-ink-500 hover:text-ink-900'}`} onClick={() => setColumnsView('list')}>Lista</button>
        </div>
      </div>

      <ColumnList
        layout={columnsView}
        selectedId={selectedId || template.columns[0]?.id}
        onSelect={setSelectedId}
        renderPreview={() => renderPreview({ selectable: true })}
        columns={template.columns}
        onChange={(columns, options) => {
          setTemplate(withColumns(template, columns));
          if (options?.unconfirm) unflag(options.unconfirm);
        }}
        flagged={flagged}
        onFlagResolve={unflag}
        headers={sample ? sample.headers : null}
        suggestions={suggestions}
        evaluation={evaluation}
        sample={results?.length ? { values: sample.rows[0].values, result: results[0] } : null}
        sampleRows={results?.length ? results.slice(0, 5).map((result, index) => ({ values: sample.rows[index].values, result })) : null}
        isFixedWidth={template.output.format === 'FIXED_WIDTH'}
      />
      {columnsView === 'list' ? renderPreview({ selectable: true }) : null}

      </div>
      ) : null}

      {activeTab === 'rows' ? (
        <div className="space-y-6" role="tabpanel" aria-label="Filas">
          <section>
            <h2 className="text-lg font-bold text-ink-900">Filas</h2>
            <p className="mb-3 mt-1 text-ink-500">Opcional: filtra, quita duplicados, agrupa u ordena las filas del archivo final.</p>
            <RowStepsEditor
              steps={template.rowSteps}
              columns={template.columns}
              headers={sample ? sample.headers : null}
              suggestions={suggestions}
              onChange={(rowSteps) => setTemplate(withColumns({ ...template, rowSteps }, template.columns))}
            />
          </section>
          {renderPreview()}
        </div>
      ) : null}

      {activeTab === 'output' ? (
        <div className="space-y-6" role="tabpanel" aria-label="Archivo de salida">
          <section>
            <h2 className="text-lg font-bold text-ink-900">Archivo de salida</h2>
            <p className="mb-3 mt-1 text-ink-500">Formato, nombre del archivo, encabezado y pie, totales y división.</p>
            <OutputEditor template={template} onChange={setTemplate} />
          </section>
          {renderPreview()}
        </div>
      ) : null}

      {sample?.exampleRows ? (
        <aside id="asistente" aria-label="Asistente" hidden={!assistantOpen} className="fixed inset-0 z-40 !mt-0 overflow-y-auto border-l border-ink-200 bg-canvas px-4 pb-6 shadow-2xl lg:left-auto lg:w-[560px]">
          <div className="sticky top-0 z-10 -mx-4 mb-2 flex justify-end bg-canvas px-4 py-3">
            <button type="button" className={buttonStyles.secondary} onClick={() => setAssistantOpen(false)}>
              <X size={16} aria-hidden="true" />
              Cerrar
            </button>
          </div>
          <AssistantPanel
            template={template}
            sample={sample}
            outputExample={outputExample}
            onApply={(proposal) => {
              // The proposal replaces columns, output and row steps; the template's own data stays as the user wrote it.
              setTemplate({ ...template, output: proposal.output, columns: proposal.columns, ...(proposal.rowSteps ? { rowSteps: proposal.rowSteps } : { rowSteps: undefined }) });
              setFlagged(new Map());
              setActiveTab('columns');
              setAssistantOpen(false);
            }}
          />
        </aside>
      ) : null}
    </form>
    </ParametersContext.Provider>
  );
}

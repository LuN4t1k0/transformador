'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, ArrowLeft, ArrowRight, Loader2, Save } from 'lucide-react';
import { evaluateColumns } from '@previley-transformer/template-engine/src/mapping.js';
import { runRows } from '@previley-transformer/template-engine/src/run.js';
import { previewRows } from '@previley-transformer/template-engine/src/rows.js';
import { previewParameters } from '@previley-transformer/template-engine/src/params.js';
import { previewDesign } from '@previley-transformer/template-engine/src/output-design.js';
import { api } from '../../lib/api';
import { withColumns } from '../../lib/template-editor';
import { describeOutput } from '../../lib/templates';
import { buttonStyles, Notice, Panel } from '../panel';
import { StepRail } from '../job/step-rail';
import { AssistantPanel } from './assistant-panel';
import { ColumnList } from './column-list';
import { ExampleReport } from './example-report';
import { FilePreview } from './file-preview';
import { OutputEditor } from './output-editor';
import { ParametersContext } from './parameters-context';
import { ParametersEditor } from './parameters-editor';
import { RowStepsEditor, RowStepsNote } from './row-steps-editor';
import { inputClass } from './source-editor';
import { SampleLoader } from './template-form';

const labelClass = 'mb-1 block text-xs font-medium text-ink-500';

// The same steps as building a template inside a conversion, ending in saving it instead of generating a file.
const SECTIONS = [
  { id: 'files', label: 'Archivos', title: 'Archivos de ejemplo', description: 'El Excel que recibes y, si lo tienes, un ejemplo del archivo que te piden. Solo se usan para preparar la plantilla.' },
  { id: 'columns', label: 'Columnas', title: 'Columnas del archivo final', description: 'Define qué columnas lleva el archivo, de dónde sale cada una y en qué formato.' },
  { id: 'rows', label: 'Filas', title: 'Filas', description: 'Opcional: filtra, quita duplicados, agrupa u ordena las filas del archivo final.' },
  { id: 'output', label: 'Tipo de archivo', title: 'Tipo de archivo', description: 'Excel, texto con separador o texto de ancho fijo.' },
  { id: 'preview', label: 'Vista previa', title: 'Vista previa', description: 'Así se verá el archivo final con las primeras filas.' },
  { id: 'save', label: 'Guardar', title: 'Guardar la plantilla', description: 'Ponle un nombre y di para qué destino y proceso es, así el equipo la encuentra.' }
];

function knownHeaderNames(columns) {
  const names = new Set();
  for (const column of columns) {
    if (column.source.column) names.add(column.source.column);
    for (const part of column.source.parts || []) if (part.column) names.add(part.column);
    for (const alias of column.aliases || []) names.add(alias);
  }
  return [...names].sort();
}

// `files`: what the Archivos step shows (the example files and their sheets); without it, a test Excel can be loaded.
export function TemplateWizard({ initial, initialSample = null, outputExample = null, report = null, note = null, files = null, submitLabel = 'Crear plantilla', onSubmit }) {
  const [template, setTemplate] = useState(initial);
  const [sample, setSample] = useState(initialSample);
  const [activeId, setActiveId] = useState(initialSample ? 'columns' : 'files');
  const [sampleAt, setSampleAt] = useState(0);
  const [facets, setFacets] = useState({ destinations: [], processes: [] });
  const [state, setState] = useState({ saving: false, error: null });
  const headingRef = useRef(null);
  // Columns suggested by a similar header name stay marked until the user accepts or changes them.
  const [flagged, setFlagged] = useState(() => new Map(
    initial.columns.filter((column) => report?.suggested?.includes(column.outputName)).map((column) => [column.id, 'Sugerida'])
  ));
  const unflag = (id) => setFlagged((current) => {
    const next = new Map(current);
    next.delete(id);
    return next;
  });

  useEffect(() => {
    api.getTemplateFacets().then(setFacets).catch(() => {});
  }, []);

  const suggestions = useMemo(() => knownHeaderNames(template.columns), [template.columns]);
  const evaluation = useMemo(
    () => (sample ? evaluateColumns(template.columns, sample.headers, new Set(template.columns.map((column) => column.id))) : null),
    [template.columns, sample]
  );
  const params = useMemo(() => previewParameters(template.parameters || []), [template.parameters]);
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

  const at = Math.min(sampleAt, (sample?.rows?.length || 1) - 1);
  const pending = evaluation ? evaluation.counts.pending + evaluation.counts.missing + flagged.size : 0;
  const columnStatus = evaluation ? new Map(evaluation.rows.map((row) => [row.column.outputName, row.status])) : null;
  const setField = (field) => (event) => setTemplate({ ...template, [field]: event.target.value });
  const saveBlocked = !template.name.trim() ? 'Escribe un nombre para la plantilla.' : null;

  function go(id) {
    setActiveId(id);
    // Move focus to the new step's title, as in a conversion, so keyboard and screen reader users follow along.
    setTimeout(() => headingRef.current?.focus(), 0);
  }

  async function save() {
    setState({ saving: true, error: null });
    try {
      await onSubmit(template);
    } catch (error) {
      setState({ saving: false, error });
    }
  }

  function renderSection() {
    if (activeId === 'files') {
      return (
        <div className="space-y-3">
          {files}
          {files ? null : (
            <>
              <p className="text-sm text-ink-700">Con un Excel de prueba eliges el origen de cada columna de su lista de encabezados y ves el resultado mientras editas. No se guarda.</p>
              <SampleLoader sample={sample} onLoaded={setSample} />
            </>
          )}
          {note ? <p className="text-sm text-ink-500">{note}</p> : null}
        </div>
      );
    }
    if (activeId === 'columns') {
      return (
        <div className="space-y-3">
          {sample?.rows?.length > 1 ? (
            <label className="flex items-center gap-2 text-xs text-ink-500">
              Ejemplos con la fila
              <select className="h-7 rounded-md border border-ink-200 bg-white px-1 text-xs text-ink-900" value={at} onChange={(event) => setSampleAt(Number(event.target.value))}>
                {sample.rows.map((row, index) => <option key={row.rowNumber} value={index}>{row.rowNumber}</option>)}
              </select>
            </label>
          ) : null}
          {/* What the example taught, then the assistant for what is missing, then each column by hand. */}
          <ExampleReport report={report} assistantAvailable={Boolean(sample?.exampleRows)} />
          <AssistantPanel
            template={template}
            sample={sample}
            outputExample={outputExample}
            onApply={(proposal) => {
              setTemplate({ ...template, output: proposal.output, columns: proposal.columns, ...(proposal.rowSteps ? { rowSteps: proposal.rowSteps } : { rowSteps: undefined }) });
              setFlagged(new Map());
            }}
          />
          <ColumnList
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
            sample={results?.length ? { values: sample.rows[at].values, result: results[at] } : null}
            isFixedWidth={template.output.format === 'FIXED_WIDTH'}
          />
        </div>
      );
    }
    if (activeId === 'rows') {
      return (
        <RowStepsEditor
          steps={template.rowSteps}
          columns={template.columns}
          headers={sample ? sample.headers : null}
          suggestions={suggestions}
          onChange={(rowSteps) => setTemplate(withColumns({ ...template, rowSteps }, template.columns))}
        />
      );
    }
    if (activeId === 'output') return <OutputEditor template={template} onChange={setTemplate} />;
    if (activeId === 'preview') {
      if (!preview) {
        return (
          <div className="space-y-3">
            <p className="text-sm text-ink-700">Carga un Excel de prueba para ver cómo queda el archivo final.</p>
            <SampleLoader sample={sample} onLoaded={setSample} />
          </div>
        );
      }
      return (
        <>
          <RowStepsNote preview={preview} sampleCount={sample.rows.length} />
          <FilePreview template={template} results={preview.results} sampleCount={sample.rows.length} design={preview.design} columnStatus={columnStatus} />
        </>
      );
    }
    return (
      <div className="space-y-6">
        <dl className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-md border border-ink-200 bg-ink-50 p-3">
            <dt className="text-xs font-medium text-ink-500">Columnas</dt>
            <dd className="mt-1 text-sm font-semibold text-ink-900">{evaluation ? `${evaluation.counts.ok}/${evaluation.counts.total} listas` : `${template.columns.length} columnas`}</dd>
          </div>
          <div className="rounded-md border border-ink-200 bg-ink-50 p-3">
            <dt className="text-xs font-medium text-ink-500">Archivo final</dt>
            <dd className="mt-1 text-sm font-semibold text-ink-900">{describeOutput(template.output)}</dd>
          </div>
          <div className="rounded-md border border-ink-200 bg-ink-50 p-3">
            <dt className="text-xs font-medium text-ink-500">Probada con</dt>
            <dd className="mt-1 truncate text-sm font-semibold text-ink-900">{sample ? sample.fileName : 'Sin Excel de prueba'}</dd>
          </div>
        </dl>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={labelClass} htmlFor="template-name">Nombre *</label>
            <input id="template-name" className={inputClass} value={template.name} placeholder="Ej: PlanVital 2026" maxLength={120} onChange={setField('name')} />
          </div>
          <div>
            <label className={labelClass} htmlFor="template-destination">Destino</label>
            <input id="template-destination" list="template-destinations" className={inputClass} value={template.destination || ''} placeholder="Ej: PlanVital, TGR" maxLength={80} onChange={setField('destination')} />
            <datalist id="template-destinations">{facets.destinations.map((value) => <option key={value} value={value} />)}</datalist>
          </div>
          <div>
            <label className={labelClass} htmlFor="template-process">Proceso</label>
            <input id="template-process" list="template-processes" className={inputClass} value={template.process || ''} placeholder="Ej: Licencias PAGEX, Moras presuntas" maxLength={80} onChange={setField('process')} />
            <datalist id="template-processes">{facets.processes.map((value) => <option key={value} value={value} />)}</datalist>
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass} htmlFor="template-description">Descripción</label>
            <input id="template-description" className={inputClass} value={template.description || ''} maxLength={500} onChange={setField('description')} />
          </div>
        </div>

        <details className="rounded-md border border-ink-200 p-3" open={Boolean(template.parameters?.length)}>
          <summary className="cursor-pointer text-sm font-semibold text-ink-900">Datos que se piden al generar <span className="font-normal text-ink-500">(opcional)</span></summary>
          <p className="mb-3 mt-1 text-sm text-ink-500">Valores que se escriben cada vez que se genera el archivo, como el periodo o una fecha de corte.</p>
          <ParametersEditor parameters={template.parameters || []} onChange={(parameters) => setTemplate({ ...template, parameters })} />
        </details>

        {state.error ? <Notice tone="danger" icon={AlertCircle} role="alert">{state.error.message}</Notice> : null}
        <div className="flex flex-wrap items-center justify-end gap-3">
          {saveBlocked ? <p id="save-blocked-reason" className="text-sm text-ink-500">{saveBlocked}</p> : null}
          <button type="button" className={buttonStyles.primary} disabled={state.saving || Boolean(saveBlocked)} aria-describedby={saveBlocked ? 'save-blocked-reason' : undefined} onClick={save}>
            {state.saving ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Save size={16} aria-hidden="true" />}
            {submitLabel}
          </button>
        </div>
      </div>
    );
  }

  const stepDetail = {
    files: sample ? sample.fileName : 'Sin Excel de prueba',
    columns: evaluation ? (pending ? `${pending} por revisar` : `Las ${evaluation.counts.total} listas`) : `${template.columns.length} columnas`,
    rows: template.rowSteps ? `${Object.keys(template.rowSteps).length} ${Object.keys(template.rowSteps).length === 1 ? 'paso' : 'pasos'} configurados` : 'Sin cambios',
    output: describeOutput(template.output),
    preview: sample ? 'Primeras filas del archivo' : 'Necesita un Excel de prueba',
    save: template.name.trim() || 'Nombre, destino y proceso'
  };
  const stateOf = (id) => {
    if (id === activeId) return 'current';
    if (id === 'files') return sample ? 'done' : 'todo';
    if (id === 'columns') return !evaluation ? 'todo' : pending ? 'attention' : 'done';
    if (id === 'save') return 'todo';
    return 'done';
  };
  const railSteps = SECTIONS.map((section) => ({ id: section.id, label: section.label, detail: stepDetail[section.id], state: stateOf(section.id), onClick: () => go(section.id) }));
  const index = SECTIONS.findIndex((section) => section.id === activeId);
  const section = SECTIONS[index];
  const previous = SECTIONS[index - 1];
  const next = SECTIONS[index + 1];

  return (
    <ParametersContext.Provider value={template.parameters || []}>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[232px_minmax(0,1fr)]">
        <StepRail steps={railSteps} label="Pasos de la plantilla" />
        <div className="min-w-0 space-y-4">
          <Panel headingRef={headingRef} title={section.title} description={section.description}>
            {renderSection()}
          </Panel>
          <div className="flex items-center justify-between gap-3">
            {previous ? (
              <button type="button" className={buttonStyles.secondary} onClick={() => go(previous.id)}>
                <ArrowLeft size={16} aria-hidden="true" />
                {previous.label}
              </button>
            ) : <span />}
            {next ? (
              <button type="button" className={buttonStyles.primary} onClick={() => go(next.id)}>
                {next.label}
                <ArrowRight size={16} aria-hidden="true" />
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </ParametersContext.Provider>
  );
}

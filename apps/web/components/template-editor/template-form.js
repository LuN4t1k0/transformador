'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import { AlertCircle, FileSpreadsheet, Loader2, Save, Sparkles } from 'lucide-react';
import { evaluateColumns } from '@previley-transformer/template-engine/src/mapping.js';
import { runRows } from '@previley-transformer/template-engine/src/run.js';
import { previewRows } from '@previley-transformer/template-engine/src/rows.js';
import { previewParameters } from '@previley-transformer/template-engine/src/params.js';
import { previewDesign } from '@previley-transformer/template-engine/src/output-design.js';
import { ParametersContext } from './parameters-context';
import { listPacks } from '../../lib/packs.js';
import { ParametersEditor } from './parameters-editor';
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
      onLoaded({ fileName: draft.input.fileName, sheet: draft.input.sheet, headers: draft.input.headers, rows: reviveSampleRows(draft.input.sampleRows) });
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
export function TemplateForm({ initial, submitLabel, onSubmit, note, initialSample = null, report = null }) {
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
  // Identifiers the domain packs use to match example rows (e.g. RUT).
  const keyLabels = listPacks().flatMap((pack) => (pack.keys || []).map((key) => key.label));
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
      return { ...rows, design: previewDesign(template, rows.results, { inputName: sample.fileName.replace(/\.xlsx$/i, ''), sheet: sample.sheet, now: new Date(), params }) };
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

  return (
    <ParametersContext.Provider value={template.parameters || []}>
    <form className="space-y-5" onSubmit={submit}>
      <Panel title="Datos de la plantilla" description={note}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={labelClass} htmlFor="template-name">Nombre *</label>
            <input id="template-name" required maxLength={120} className={inputClass} value={template.name} onChange={setMeta('name')} placeholder="Ej: PlanVital 2026" />
          </div>
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
      </Panel>

      <Panel title="Parámetros" description="Opcional: valores que se piden cada vez que se genera el archivo, como el periodo o una fecha de corte.">
        <ParametersEditor parameters={template.parameters || []} onChange={(parameters) => setTemplate({ ...template, parameters })} />
      </Panel>

      {report?.mode === 'BY_EXAMPLE' || report?.mode === 'OUTPUT_ONLY' ? (
        <Notice tone={report.unresolved.length || report.suggested?.length ? 'warning' : 'success'} icon={Sparkles}>
          <p className="font-semibold">
            De {report.learned + (report.suggested?.length || 0) + report.unresolved.length} columnas: {report.learned} deducidas
            {report.suggested?.length ? `, ${report.suggested.length} sugeridas por nombre` : ''}
            {report.unresolved.length ? `, ${report.unresolved.length} por definir` : ''}.
          </p>
          {report.alignment === 'NONE' && report.mode === 'BY_EXAMPLE' ? (
            <p className="mt-0.5">Los ejemplos no tienen filas en común{keyLabels.length ? ` (por ejemplo, el mismo ${keyLabels.join(' o ')})` : ''}, así que no pudimos comparar fila a fila. Si tienes un Excel de origen con algunas de esas filas, úsalo para deducir con más precisión.</p>
          ) : null}
          {report.suggested?.length ? (
            <p className="mt-0.5">
              <span className="font-medium">Revisa las sugeridas:</span>{' '}
              {report.suggested.map((name) => (report.byName?.[name]?.exceptions ? `${name} (cálculo que no calza en ${report.byName[name].exceptions} ${report.byName[name].exceptions === 1 ? 'fila' : 'filas'} del ejemplo)` : name)).join(', ')}.
            </p>
          ) : null}
          {report.unresolved.length ? <p className="mt-0.5"><span className="font-medium">Define el origen de:</span> {report.unresolved.join(', ')}. Si son cálculos (sumas, porcentajes), por ahora se completan a mano o quedan vacías.</p> : null}
          {report.ignored?.length ? <p className="mt-0.5 text-ink-500">Ignoramos del ejemplo: {report.ignored.join(', ')} (columnas ocultas o vacías).</p> : null}
        </Notice>
      ) : null}

      <Panel
        title="Columnas"
        description={sample ? 'Elige el origen entre las columnas del Excel de prueba y revisa el resultado de ejemplo de cada una.' : 'Sin un Excel de prueba, el origen se escribe con el nombre del encabezado que tendrá el archivo. Carga uno para ver ejemplos y la vista previa.'}
        actions={<SampleLoader sample={sample} onLoaded={setSample} />}
      >
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
          sample={results?.length ? { values: sample.rows[0].values, result: results[0] } : null}
          isFixedWidth={template.output.format === 'FIXED_WIDTH'}
        />
      </Panel>

      <Panel title="Filas" description="Opcional: filtra, quita duplicados, agrupa u ordena las filas del archivo final.">
        <RowStepsEditor
          steps={template.rowSteps}
          columns={template.columns}
          headers={sample ? sample.headers : null}
          suggestions={suggestions}
          onChange={(rowSteps) => setTemplate(withColumns({ ...template, rowSteps }, template.columns))}
        />
      </Panel>

      <Panel title="Tipo de archivo">
        <OutputEditor template={template} onChange={setTemplate} />
      </Panel>

      {preview ? (
        <Panel title="Vista previa" description={`Así quedaría el archivo con las primeras filas de «${sample.fileName}».`}>
          <RowStepsNote preview={preview} sampleCount={sample.rows.length} />
          <FilePreview template={template} results={preview.results} sampleCount={sample.rows.length} design={preview.design} />
        </Panel>
      ) : null}

      {state.error ? <Notice tone="danger" icon={AlertCircle} role="alert">{state.error.message}</Notice> : null}

      <div className="flex justify-end">
        <button type="submit" className={buttonStyles.primary} disabled={state.saving}>
          {state.saving ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Save size={16} aria-hidden="true" />}
          {submitLabel}
        </button>
      </div>
    </form>
    </ParametersContext.Provider>
  );
}

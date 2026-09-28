'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Loader2, Save } from 'lucide-react';
import { api } from '../../lib/api';
import { buttonStyles, Notice, Panel } from '../panel';
import { ColumnList } from './column-list';
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

// Template editor without a source file: metadata, columns (sources typed as header names) and output format.
export function TemplateForm({ initial, submitLabel, onSubmit, note }) {
  const [template, setTemplate] = useState(initial);
  const [facets, setFacets] = useState({ destinations: [], processes: [] });
  const [state, setState] = useState({ saving: false, error: null });
  const suggestions = useMemo(() => knownHeaderNames(template.columns), [template.columns]);

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

      <Panel title="Columnas" description="Sin un archivo cargado, el origen se escribe con el nombre del encabezado que tendrá el Excel. La vista previa está disponible al usar la plantilla en un job.">
        <ColumnList
          columns={template.columns}
          onChange={(columns) => setTemplate({ ...template, columns })}
          suggestions={suggestions}
          isFixedWidth={template.output.format === 'FIXED_WIDTH'}
        />
      </Panel>

      <Panel title="Formato del archivo">
        <OutputEditor template={template} onChange={setTemplate} />
      </Panel>

      {state.error ? <Notice tone="danger" icon={AlertCircle} role="alert">{state.error.message}</Notice> : null}

      <div className="flex justify-end">
        <button type="submit" className={buttonStyles.primary} disabled={state.saving}>
          {state.saving ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Save size={16} aria-hidden="true" />}
          {submitLabel}
        </button>
      </div>
    </form>
  );
}

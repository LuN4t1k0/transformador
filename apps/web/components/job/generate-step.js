'use client';

import { useEffect, useState } from 'react';
import { Play, Save } from 'lucide-react';
import { api } from '../../lib/api';
import { hasTemplateChanges } from '../../lib/template-editor';
import { describeOutput } from '../../lib/templates';
import { buttonStyles } from '../panel';
import { inputClass } from '../template-editor/source-editor';

const labelClass = 'mb-1 block text-xs font-medium text-ink-500';

function useBaseConfiguration(job) {
  const [base, setBase] = useState(undefined);
  useEffect(() => {
    let active = true;
    if (!job.template) {
      setBase(null);
      return undefined;
    }
    api.getTemplateVersion(job.template.id, job.template.versionId)
      .then((template) => active && setBase(template.configuration))
      .catch(() => active && setBase(null));
    return () => {
      active = false;
    };
  }, [job.template?.id, job.template?.versionId]);
  return base;
}

function SaveOptions({ job, template, choice, setChoice, meta, setMeta, facets }) {
  const base = useBaseConfiguration(job);
  const changed = base === undefined ? false : hasTemplateChanges(base, template);

  const options = [
    { value: 'NONE', label: 'Usar solo en este archivo', description: 'No se guarda nada; la próxima vez tendrás que repetir los cambios.' }
  ];
  if (job.template) {
    options.push({
      value: 'NEW_VERSION',
      label: `Guardar como versión ${job.template.version + 1} de «${job.template.name}»`,
      description: 'Todos los que usen esta plantilla verán los cambios. Las versiones anteriores quedan en el historial.'
    });
  }
  options.push({ value: 'NEW_TEMPLATE', label: 'Guardar como plantilla nueva', description: 'Útil cuando un destino pide un formato distinto.' });

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-ink-900">¿Guardar esta configuración?</h3>
      {job.template && base !== undefined && !changed ? (
        <p className="text-sm text-ink-500">No hay cambios respecto de «{job.template.name}» v{job.template.version}.</p>
      ) : null}
      <div className="grid gap-2" role="radiogroup" aria-label="Guardar configuración">
        {options.map((option) => (
          <label key={option.value} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${choice === option.value ? 'border-cobalt-500 bg-cobalt-50' : 'border-ink-200 bg-white hover:bg-ink-50'}`}>
            <input type="radio" name="save-choice" className="mt-0.5 h-4 w-4 accent-cobalt-600" checked={choice === option.value} onChange={() => setChoice(option.value)} />
            <span>
              <span className="block text-sm font-medium text-ink-900">{option.label}</span>
              <span className="mt-0.5 block text-xs text-ink-500">{option.description}</span>
            </span>
          </label>
        ))}
      </div>

      {choice === 'NEW_TEMPLATE' ? (
        <div className="grid gap-3 rounded-lg border border-ink-200 p-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={labelClass} htmlFor="new-template-name">Nombre *</label>
            <input id="new-template-name" className={inputClass} value={meta.name} placeholder="Ej: PlanVital 2026" maxLength={120} onChange={(event) => setMeta({ ...meta, name: event.target.value })} />
          </div>
          <div>
            <label className={labelClass} htmlFor="new-template-destination">Destino</label>
            <input id="new-template-destination" list="destination-options" className={inputClass} value={meta.destination} placeholder="Ej: PlanVital, TGR" maxLength={80} onChange={(event) => setMeta({ ...meta, destination: event.target.value })} />
            <datalist id="destination-options">{facets.destinations.map((value) => <option key={value} value={value} />)}</datalist>
          </div>
          <div>
            <label className={labelClass} htmlFor="new-template-process">Proceso</label>
            <input id="new-template-process" list="process-options" className={inputClass} value={meta.process} placeholder="Ej: Licencias PAGEX, Moras presuntas" maxLength={80} onChange={(event) => setMeta({ ...meta, process: event.target.value })} />
            <datalist id="process-options">{facets.processes.map((value) => <option key={value} value={value} />)}</datalist>
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass} htmlFor="new-template-description">Descripción</label>
            <input id="new-template-description" className={inputClass} value={meta.description} maxLength={500} onChange={(event) => setMeta({ ...meta, description: event.target.value })} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function GenerateStep({ job, template, evaluation, onSave, onTransform, isBusy, blockedReason }) {
  const [choice, setChoice] = useState('NONE');
  const [meta, setMeta] = useState({ name: '', destination: job.template?.destination || '', process: job.template?.process || '', description: '' });
  const [facets, setFacets] = useState({ destinations: [], processes: [] });
  const selectedSheet = job.sheets.find((sheet) => sheet.name === job.selectedSheet);

  useEffect(() => {
    api.getTemplateFacets().then(setFacets).catch(() => {});
  }, []);

  const saveBlocked = choice === 'NEW_TEMPLATE' && !meta.name.trim() ? 'Escribe un nombre para la plantilla nueva.' : null;
  const reason = blockedReason || saveBlocked;
  const payload = choice === 'NONE' ? null : { mode: choice, ...(choice === 'NEW_TEMPLATE' ? meta : {}) };

  return (
    <div className="space-y-6">
      <dl className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-md border border-ink-200 bg-ink-50 p-3">
          <dt className="text-xs font-medium text-ink-500">Hoja</dt>
          <dd className="mt-1 text-sm font-semibold text-ink-900">{job.selectedSheet}</dd>
          <dd className="text-xs text-ink-500">{selectedSheet?.rowCount} filas</dd>
        </div>
        <div className="rounded-md border border-ink-200 bg-ink-50 p-3">
          <dt className="text-xs font-medium text-ink-500">Columnas</dt>
          <dd className="mt-1 text-sm font-semibold text-ink-900">{evaluation.counts.ok}/{evaluation.counts.total} listas</dd>
          <dd className="text-xs text-ink-500">{job.template ? `Base: ${job.template.name} v${job.template.version}` : 'Plantilla nueva'}</dd>
        </div>
        <div className="rounded-md border border-ink-200 bg-ink-50 p-3">
          <dt className="text-xs font-medium text-ink-500">Archivo final</dt>
          <dd className="mt-1 text-sm font-semibold text-ink-900">{describeOutput(template.output)}</dd>
          <dd className="text-xs text-ink-500">Las filas con errores se excluyen y se informan.</dd>
        </div>
      </dl>

      <SaveOptions job={job} template={template} choice={choice} setChoice={setChoice} meta={meta} setMeta={setMeta} facets={facets} />

      <div className="flex flex-wrap items-center justify-end gap-3">
        {reason ? <p id="generate-blocked-reason" className="text-sm text-ink-500">{reason}</p> : null}
        {payload ? (
          <button type="button" className={buttonStyles.secondary} disabled={isBusy || Boolean(saveBlocked)} onClick={() => onSave(payload)}>
            <Save size={16} aria-hidden="true" />
            Solo guardar
          </button>
        ) : null}
        <button
          type="button"
          className={buttonStyles.primary}
          disabled={isBusy || Boolean(reason)}
          aria-describedby={reason ? 'generate-blocked-reason' : undefined}
          onClick={() => onTransform(payload)}
        >
          <Play size={16} aria-hidden="true" />
          {payload ? 'Guardar y generar archivo' : 'Generar archivo'}
        </button>
      </div>
    </div>
  );
}

'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, FilePlus2, FileSpreadsheet, Loader2, Search } from 'lucide-react';
import { api } from '../../lib/api';
import { outputFormatLabel } from '../../lib/templates';
import { Notice } from '../panel';

function MatchBar({ match }) {
  if (!match) return null;
  const percent = match.total ? Math.round((match.matched / match.total) * 100) : 0;
  const tone = match.requiredMissing ? 'bg-amber-500' : 'bg-mint-600';

  return (
    <span className="mt-2 block">
      <span className="flex items-center justify-between gap-2 text-xs">
        <span className={match.requiredMissing ? 'text-amber-700' : 'text-mint-600'}>
          Reconoce {match.matched} de {match.total} columnas de origen
          {match.requiredMissing ? ` · faltan ${match.requiredMissing} obligatorias` : ''}
        </span>
        <span className="tabular-nums text-ink-400">{percent}%</span>
      </span>
      <span className="mt-1 block h-1 overflow-hidden rounded-full bg-ink-200">
        <span className={`block h-full rounded-full ${tone}`} style={{ width: `${percent}%` }} />
      </span>
    </span>
  );
}

// A new template for this file: from an example of the destination (learned, then the assistant and the user
// complete it) or by hand from this file's headers.
function CreateTemplateChoice({ job, isBusy, onApply, onFromExample }) {
  const [open, setOpen] = useState(false);
  const [example, setExample] = useState(null);
  const [error, setError] = useState('');
  const inputId = useId();

  if (!open) {
    return (
      <button
        type="button"
        disabled={isBusy}
        className={`flex w-full items-start gap-3 rounded-md border border-dashed p-4 text-left disabled:cursor-wait ${
          job.workingTemplate && !job.template ? 'border-cobalt-500 bg-cobalt-50' : 'border-ink-300 bg-white hover:bg-ink-50'
        }`}
        onClick={() => setOpen(true)}
      >
        <FilePlus2 className="mt-0.5 shrink-0 text-cobalt-600" size={20} aria-hidden="true" />
        <span>
          <span className="block font-semibold text-ink-900">Crear una plantilla nueva para este archivo</span>
          <span className="mt-1 block text-sm text-ink-500">Con un ejemplo de cómo debe quedar (el sistema y el asistente la arman) o a mano, desde las columnas de «{job.selectedSheet}».</span>
        </span>
      </button>
    );
  }

  return (
    <section aria-labelledby={`${inputId}-title`} className="space-y-3 rounded-md border border-cobalt-500 bg-white p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id={`${inputId}-title`} className="text-base font-bold text-ink-900">¿Cómo quieres crear la plantilla?</h3>
        <button type="button" className="text-sm font-semibold text-ink-500 hover:underline" onClick={() => setOpen(false)}>Cancelar</button>
      </div>

      <div className="rounded-md border border-ink-200 p-4">
        <p className="font-semibold text-ink-900">Con un ejemplo de cómo debe quedar <span className="ml-1 rounded-full bg-cobalt-50 px-2 py-0.5 text-xs font-semibold text-cobalt-700">Recomendado</span></p>
        <p className="mt-1 text-sm text-ink-700">Sube un archivo que ya tenga el formato del destino, con unas pocas filas. Deducimos cada columna comparando con «{job.fileName}»; lo que falte te lo propone el asistente y lo que quede lo completas a mano.</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label htmlFor={inputId} className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-md border border-ink-200 bg-white px-3 text-sm font-semibold text-ink-700 hover:bg-ink-50">
            <FileSpreadsheet size={16} aria-hidden="true" />
            {example ? 'Cambiar ejemplo' : 'Elegir ejemplo del destino'}
          </label>
          <input id={inputId} type="file" accept=".xlsx" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) { setExample(file); setError(''); } }} />
          {example ? <span className="text-sm font-semibold text-ink-900">{example.name}</span> : null}
          <button
            type="button"
            disabled={!example || isBusy}
            className="inline-flex h-10 items-center gap-2 rounded-md bg-cobalt-600 px-4 text-sm font-semibold text-white hover:bg-cobalt-700 disabled:cursor-not-allowed disabled:bg-ink-200 disabled:text-ink-500"
            onClick={async () => {
              setError('');
              const message = await onFromExample(example);
              if (message) setError(message);
            }}
          >
            {isBusy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : null}
            Preparar la plantilla
          </button>
        </div>
        {error ? <p role="alert" className="mt-2 text-sm text-rose-700">{error}</p> : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-ink-200 p-4">
        <div>
          <p className="font-semibold text-ink-900">A mano</p>
          <p className="mt-1 text-sm text-ink-700">Empieza con una columna por cada encabezado de «{job.selectedSheet}»; después ajustas nombres, formatos y orden.</p>
        </div>
        <button type="button" disabled={isBusy} className="inline-flex h-10 items-center rounded-md border border-ink-200 bg-white px-3 text-sm font-semibold text-ink-700 hover:bg-ink-50" onClick={() => onApply({ blank: true })}>
          Crear a mano
        </button>
      </div>
    </section>
  );
}

export function TemplateStep({ job, onApply, onFromExample, isBusy }) {
  const [state, setState] = useState({ templates: null, matches: null, error: null });
  const [query, setQuery] = useState('');
  const [destination, setDestination] = useState('');
  const [process, setProcess] = useState('');

  useEffect(() => {
    let active = true;
    Promise.all([api.listTemplates(), api.getTemplateMatches(job.id)])
      .then(([templates, matches]) => active && setState({ templates, matches, error: null }))
      .catch((error) => active && setState({ templates: null, matches: null, error }));
    return () => {
      active = false;
    };
  }, [job.id, job.selectedSheet]);

  const matchById = useMemo(() => new Map((state.matches || []).map((match) => [match.templateId, match])), [state.matches]);
  const destinations = useMemo(() => [...new Set((state.templates || []).map((t) => t.destination).filter(Boolean))].sort(), [state.templates]);
  const processes = useMemo(() => [...new Set((state.templates || []).map((t) => t.process).filter(Boolean))].sort(), [state.templates]);

  const visible = useMemo(() => {
    const text = query.trim().toLowerCase();
    return (state.templates || [])
      .filter((t) => !destination || t.destination === destination)
      .filter((t) => !process || t.process === process)
      .filter((t) => !text || `${t.name} ${t.destination} ${t.process} ${t.description}`.toLowerCase().includes(text))
      .sort((a, b) => {
        const ma = matchById.get(a.id);
        const mb = matchById.get(b.id);
        return (ma?.requiredMissing ?? 99) - (mb?.requiredMissing ?? 99) || (mb?.matched ?? 0) - (ma?.matched ?? 0);
      });
  }, [state.templates, query, destination, process, matchById]);

  if (state.error) return <Notice tone="danger" icon={AlertCircle} role="alert">No pudimos cargar las plantillas: {state.error.message}</Notice>;
  if (!state.templates) {
    return (
      <p className="flex items-center gap-2 text-sm text-ink-500">
        <Loader2 size={16} className="animate-spin" aria-hidden="true" />
        Buscando plantillas que calcen con la hoja «{job.selectedSheet}»…
      </p>
    );
  }

  const selectClass = 'h-9 rounded-md border border-ink-200 bg-white px-2 text-sm text-ink-900';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <label className="relative min-w-0 flex-1 basis-56">
          <span className="sr-only">Buscar plantilla</span>
          <Search size={15} className="pointer-events-none absolute left-2.5 top-2.5 text-ink-400" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por nombre, destino o proceso"
            className="h-9 w-full rounded-md border border-ink-200 bg-white pl-8 pr-2 text-sm text-ink-900"
          />
        </label>
        <label className="sr-only" htmlFor="filter-destination">Destino</label>
        <select id="filter-destination" className={selectClass} value={destination} onChange={(event) => setDestination(event.target.value)}>
          <option value="">Todos los destinos</option>
          {destinations.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        <label className="sr-only" htmlFor="filter-process">Proceso</label>
        <select id="filter-process" className={selectClass} value={process} onChange={(event) => setProcess(event.target.value)}>
          <option value="">Todos los procesos</option>
          {processes.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
      </div>

      <div className="grid gap-2" role="radiogroup" aria-label="Plantilla">
        {visible.map((template) => {
          const isCurrent = job.template?.id === template.id;
          return (
            <button
              key={template.id}
              type="button"
              role="radio"
              aria-checked={isCurrent}
              disabled={isBusy}
              className={`flex w-full items-start gap-3 rounded-lg border p-4 text-left disabled:cursor-wait ${
                isCurrent ? 'border-cobalt-500 bg-cobalt-50' : 'border-ink-200 bg-white hover:bg-ink-50'
              }`}
              onClick={() => onApply({ templateId: template.id })}
            >
              <FileSpreadsheet className="mt-0.5 shrink-0 text-cobalt-600" size={20} aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-sm font-semibold text-ink-900">{template.name}</span>
                  <span className="text-xs text-ink-500">v{template.version}</span>
                </span>
                <span className="mt-0.5 block text-xs text-ink-500">
                  {[template.destination, template.process].filter(Boolean).join(' · ') || 'Sin clasificar'} · {template.columnCount} columnas · {outputFormatLabel(template.outputFormat)}
                </span>
                {template.description ? <span className="mt-1 block text-sm text-ink-500">{template.description}</span> : null}
                <MatchBar match={matchById.get(template.id)} />
              </span>
              {isCurrent ? <CheckCircle2 className="shrink-0 text-cobalt-600" size={18} aria-hidden="true" /> : null}
            </button>
          );
        })}
        {!visible.length ? <p className="rounded-lg border border-dashed border-ink-300 px-4 py-6 text-center text-sm text-ink-500">Ninguna plantilla coincide con los filtros.</p> : null}
      </div>

      <CreateTemplateChoice job={job} isBusy={isBusy} onApply={onApply} onFromExample={onFromExample} />


      {job.workingTemplate ? (
        <p className="text-xs text-ink-500">Elegir otra plantilla reemplaza la configuración actual de esta conversión.</p>
      ) : null}
    </div>
  );
}

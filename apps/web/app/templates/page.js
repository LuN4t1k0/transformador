'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, FileSpreadsheet, Loader2, Plus, Search } from 'lucide-react';
import { buttonStyles, Notice } from '../../components/panel';
import { Shell } from '../../components/shell';
import { formatDateTime } from '../../components/job-status';
import { api } from '../../lib/api';
import { outputFormatLabel } from '../../lib/templates';
import { useAdvancedMode } from '../../lib/hooks/use-advanced-mode';

export default function TemplatesPage() {
  const [templates, setTemplates] = useState(null);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');
  const [destination, setDestination] = useState('');
  const [process, setProcess] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [advanced] = useAdvancedMode();

  useEffect(() => {
    setTemplates(null);
    api.listTemplates({ includeArchived: showArchived }).then(setTemplates).catch(setError);
  }, [showArchived]);

  const destinations = useMemo(() => [...new Set((templates || []).map((t) => t.destination).filter(Boolean))].sort(), [templates]);
  const processes = useMemo(() => [...new Set((templates || []).map((t) => t.process).filter(Boolean))].sort(), [templates]);
  const visible = useMemo(() => {
    const text = query.trim().toLowerCase();
    return (templates || [])
      .filter((t) => !destination || t.destination === destination)
      .filter((t) => !process || t.process === process)
      .filter((t) => !text || `${t.name} ${t.destination} ${t.process} ${t.description}`.toLowerCase().includes(text));
  }, [templates, query, destination, process]);

  const selectClass = 'h-9 rounded-md border border-ink-200 bg-white px-2 text-sm text-ink-900';

  return (
    <Shell>
      <div className="mx-auto max-w-6xl">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-ink-900">Plantillas</h1>
            <p className="mt-1 text-sm text-ink-500">Formatos que piden los destinos. Se comparten entre todos los usuarios y cada cambio queda como una versión nueva.</p>
          </div>
          {advanced ? (
            <Link href="/templates/new" className={buttonStyles.primary}>
              <Plus size={16} aria-hidden="true" />
              Nueva plantilla
            </Link>
          ) : (
            <p className="max-w-xs text-xs text-ink-500">Para crear o editar plantillas, activa el modo avanzado arriba a la derecha.</p>
          )}
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <label className="relative min-w-0 flex-1 basis-56">
            <span className="sr-only">Buscar plantilla</span>
            <Search size={15} className="pointer-events-none absolute left-2.5 top-2.5 text-ink-400" aria-hidden="true" />
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nombre, destino o proceso" className="h-9 w-full rounded-md border border-ink-200 bg-white pl-8 pr-2 text-sm text-ink-900" />
          </label>
          <select aria-label="Destino" className={selectClass} value={destination} onChange={(event) => setDestination(event.target.value)}>
            <option value="">Todos los destinos</option>
            {destinations.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
          <select aria-label="Proceso" className={selectClass} value={process} onChange={(event) => setProcess(event.target.value)}>
            <option value="">Todos los procesos</option>
            {processes.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
          <label className="inline-flex items-center gap-2 text-sm text-ink-700">
            <input type="checkbox" className="h-4 w-4 accent-cobalt-600" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} />
            Mostrar archivadas
          </label>
        </div>

        {error ? <Notice tone="danger" icon={AlertCircle} role="alert">No pudimos cargar las plantillas: {error.message}</Notice> : null}
        {!templates && !error ? (
          <p className="flex items-center gap-2 text-sm text-ink-500"><Loader2 size={16} className="animate-spin" aria-hidden="true" />Cargando…</p>
        ) : null}

        {templates ? (
          visible.length ? (
            <ul className="grid gap-3 md:grid-cols-2">
              {visible.map((template) => (
                <li key={template.id}>
                  <Link href={`/templates/${template.id}`} className={`flex h-full items-start gap-3 rounded-lg border bg-white p-4 shadow-panel hover:border-cobalt-500 ${template.archivedAt ? 'border-dashed border-ink-300 opacity-70' : 'border-ink-200'}`}>
                    <FileSpreadsheet className="mt-0.5 shrink-0 text-cobalt-600" size={20} aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-baseline gap-x-2">
                        <span className="text-sm font-semibold text-ink-900">{template.name}</span>
                        <span className="text-xs text-ink-500">v{template.version}</span>
                        {template.archivedAt ? <span className="rounded bg-ink-100 px-1.5 text-xs text-ink-500">Archivada</span> : null}
                      </span>
                      <span className="mt-0.5 block text-xs text-ink-500">{[template.destination, template.process].filter(Boolean).join(' · ') || 'Sin clasificar'}</span>
                      {template.description ? <span className="mt-1 block text-sm text-ink-500">{template.description}</span> : null}
                      <span className="mt-2 block text-xs text-ink-500">
                        {template.columnCount} columnas · {outputFormatLabel(template.outputFormat)}
                        {template.updatedAt ? ` · actualizada ${formatDateTime(template.updatedAt)}${template.updatedBy ? ` por ${template.updatedBy}` : ''}` : ''}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-lg border border-dashed border-ink-300 bg-white px-4 py-10 text-center text-sm text-ink-500">Ninguna plantilla coincide con la búsqueda.</p>
          )
        ) : null}
      </div>
    </Shell>
  );
}

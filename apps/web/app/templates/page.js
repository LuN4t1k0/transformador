'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, CheckCircle2, Download, Loader2, Pencil, Plus, Search, Upload } from 'lucide-react';
import { buttonStyles, Notice } from '../../components/panel';
import { Shell } from '../../components/shell';
import { ReuseUploadButton } from '../../components/reuse-upload-button';
import { api } from '../../lib/api';
import { downloadBlob } from '../../lib/download';
import { outputFormatLabel } from '../../lib/templates';
import { useAdvancedMode } from '../../lib/hooks/use-advanced-mode';

const NO_DESTINATION = 'Sin destino asignado';
const quietLink = 'inline-flex items-center gap-1.5 whitespace-nowrap text-sm font-semibold text-cobalt-700 hover:underline';

function formatDay(date) {
  return new Date(date).toLocaleDateString('es-CL', { day: 'numeric', month: 'long' });
}

function TemplateRow({ template, advanced, onDownloadExample }) {
  const archived = Boolean(template.archivedAt);
  return (
    <li className={`flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-ink-100 py-3.5 ${archived ? 'opacity-70' : ''}`}>
      <div className="min-w-0 flex-1 basis-72">
        <p className="flex flex-wrap items-baseline gap-x-2">
          <Link href={`/templates/${template.id}`} className="font-bold text-ink-900 hover:underline">{template.name}</Link>
          {archived ? <span className="rounded bg-ink-100 px-1.5 text-xs font-semibold text-ink-500">Archivada</span> : null}
        </p>
        <p className="text-sm text-ink-700">{template.process || 'Sin proceso'}{template.description ? `. ${template.description}` : ''}</p>
        <p className="mt-0.5 flex flex-wrap gap-x-4 text-sm text-ink-500">
          <span>{template.columnCount} columnas, {outputFormatLabel(template.outputFormat)}</span>
          <span>Versión {template.version}{template.updatedAt ? `, ${formatDay(template.updatedAt)}` : ''}</span>
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <button type="button" className={`${quietLink} text-ink-500`} title="Descarga un Excel con las columnas que espera esta plantilla" onClick={() => onDownloadExample(template)}>
          <Download size={15} aria-hidden="true" />
          Excel de ejemplo
        </button>
        {advanced && !archived ? (
          <Link href={`/templates/${template.id}/edit`} className={quietLink}>
            <Pencil size={15} aria-hidden="true" />
            Editar
          </Link>
        ) : null}
        {!archived ? (
          <ReuseUploadButton templateId={template.id} icon={Upload} className={buttonStyles.secondary}>Usar con un archivo</ReuseUploadButton>
        ) : null}
      </div>
    </li>
  );
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState(null);
  const [error, setError] = useState(null);
  const [actionError, setActionError] = useState('');
  const [query, setQuery] = useState('');
  const [destination, setDestination] = useState('');
  const [advanced] = useAdvancedMode();
  // Set by the detail page after deleting a template, to confirm what happened.
  const [deletedName, setDeletedName] = useState('');
  useEffect(() => {
    setDeletedName(new URLSearchParams(window.location.search).get('eliminada') || '');
  }, []);

  useEffect(() => {
    setTemplates(null);
    api.listTemplates().then(setTemplates).catch(setError);
  }, []);

  const destinations = useMemo(() => [...new Set((templates || []).map((t) => t.destination || NO_DESTINATION))].sort((a, b) => (a === NO_DESTINATION) - (b === NO_DESTINATION) || a.localeCompare(b)), [templates]);
  const groups = useMemo(() => {
    const text = query.trim().toLowerCase();
    const visible = (templates || [])
      .filter((t) => !destination || (t.destination || NO_DESTINATION) === destination)
      .filter((t) => !text || `${t.name} ${t.destination} ${t.process} ${t.description}`.toLowerCase().includes(text));
    return destinations
      .map((name) => ({ name, templates: visible.filter((t) => (t.destination || NO_DESTINATION) === name).sort((a, b) => a.name.localeCompare(b.name)) }))
      .filter((group) => group.templates.length);
  }, [templates, destinations, query, destination]);

  async function downloadExample(template) {
    setActionError('');
    try {
      downloadBlob(await api.downloadTemplateExample(template.id));
    } catch (downloadError) {
      setActionError(downloadError.message);
    }
  }

  const chip = (active) => `h-9 rounded-full border px-3.5 text-sm font-medium ${active ? 'border-ink-900 bg-ink-900 text-white' : 'border-ink-200 bg-white text-ink-700 hover:bg-ink-50'}`;

  return (
    <Shell>
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-[28px] font-bold leading-tight text-ink-900">Plantillas</h1>
            <p className="mt-1 max-w-[62ch] text-ink-500">El formato que pide cada destino. Se comparten con todo el equipo y cada cambio queda como una versión nueva.</p>
          </div>
          {advanced ? (
            <Link href="/templates/new" className={buttonStyles.primary}>
              <Plus size={16} aria-hidden="true" />
              Nueva plantilla
            </Link>
          ) : (
            <p className="max-w-xs text-sm text-ink-500">Para crear o editar plantillas, activa el modo avanzado en el menú.</p>
          )}
        </div>

        <div className="mb-2 flex flex-wrap items-center gap-2">
          <label className="relative w-full sm:w-80">
            <span className="sr-only">Buscar plantilla</span>
            <Search size={16} className="pointer-events-none absolute left-3 top-2.5 text-ink-400" aria-hidden="true" />
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nombre, destino o proceso" className="h-9 w-full rounded-md border border-ink-200 bg-white pl-9 pr-3 text-sm text-ink-900" />
          </label>
        </div>
        {destinations.length > 1 ? (
          <div role="group" aria-label="Filtrar por destino" className="mb-2 flex flex-wrap gap-2">
            <button type="button" aria-pressed={!destination} className={chip(!destination)} onClick={() => setDestination('')}>Todos los destinos</button>
            {destinations.map((name) => <button key={name} type="button" aria-pressed={destination === name} className={chip(destination === name)} onClick={() => setDestination(name)}>{name}</button>)}
          </div>
        ) : null}

        {deletedName ? <div className="mb-3 mt-3"><Notice tone="success" icon={CheckCircle2} role="status">Plantilla «{deletedName}» eliminada.</Notice></div> : null}
        {error ? <Notice tone="danger" icon={AlertCircle} role="alert">No pudimos cargar las plantillas: {error.message}</Notice> : null}
        {actionError ? <div className="mt-3"><Notice tone="danger" icon={AlertCircle} role="alert">{actionError}</Notice></div> : null}
        {!templates && !error ? (
          <p className="mt-4 flex items-center gap-2 text-sm text-ink-500"><Loader2 size={16} className="animate-spin" aria-hidden="true" />Cargando…</p>
        ) : null}

        {templates ? (
          groups.length ? (
            groups.map((group) => (
              <section key={group.name} className="mt-7">
                <div className="mb-1 flex items-baseline gap-3">
                  <h2 className="text-lg font-bold text-ink-900">{group.name}</h2>
                  <span className="text-sm text-ink-500">{group.templates.length} {group.templates.length === 1 ? 'plantilla' : 'plantillas'}</span>
                </div>
                <ul className="border-t border-ink-200">
                  {group.templates.map((template) => <TemplateRow key={template.id} template={template} advanced={advanced} onDownloadExample={downloadExample} />)}
                </ul>
              </section>
            ))
          ) : (
            <p className="mt-6 border-t border-ink-200 pt-4 text-sm text-ink-500">{query ? `Ninguna plantilla coincide con «${query}».` : 'Todavía no hay plantillas.'}</p>
          )
        ) : null}
      </div>
    </Shell>
  );
}

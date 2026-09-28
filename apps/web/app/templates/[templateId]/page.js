'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AlertCircle, Archive, ArchiveRestore, ArrowLeft, Copy, Download, History, Loader2, Pencil, Upload } from 'lucide-react';
import { downloadBlob } from '../../../lib/download';
import { ReuseUploadButton } from '../../../components/reuse-upload-button';
import { buttonStyles, Notice } from '../../../components/panel';
import { Shell } from '../../../components/shell';
import { formatDateTime } from '../../../components/job-status';
import { api } from '../../../lib/api';
import { describeOutput, describeRowSteps, describeSource, describeTransformations } from '../../../lib/templates';
import { useAdvancedMode } from '../../../lib/hooks/use-advanced-mode';

export default function TemplateDetailPage() {
  const { templateId } = useParams();
  const [template, setTemplate] = useState(null);
  const [shown, setShown] = useState(null);
  const [error, setError] = useState(null);
  const [isBusy, setIsBusy] = useState(false);
  const [advanced] = useAdvancedMode();

  useEffect(() => {
    api.getTemplate(templateId).then((loaded) => {
      setTemplate(loaded);
      setShown(loaded);
    }).catch(setError);
  }, [templateId]);

  async function showVersion(versionId) {
    if (versionId === template.versionId) {
      setShown(template);
      return;
    }
    try {
      setShown(await api.getTemplateVersion(templateId, versionId));
    } catch (loadError) {
      setError(loadError);
    }
  }

  async function toggleArchived() {
    setIsBusy(true);
    try {
      const updated = await api.setTemplateArchived(templateId, !template.archivedAt);
      setTemplate(updated);
      // Keep an older version on screen if that is what the user was looking at.
      setShown((current) => (current.versionId === updated.versionId ? updated : current));
    } catch (archiveError) {
      setError(archiveError);
    } finally {
      setIsBusy(false);
    }
  }

  const isOldVersion = shown && template && shown.versionId !== template.versionId;

  return (
    <Shell>
      <div className="mx-auto max-w-6xl">
        <Link href="/templates" className="inline-flex items-center gap-1 text-sm font-medium text-ink-500 hover:text-ink-900">
          <ArrowLeft size={15} aria-hidden="true" />
          Plantillas
        </Link>

        {error ? <div className="mt-4"><Notice tone="danger" icon={AlertCircle} role="alert">{error.message}</Notice></div> : null}
        {!template && !error ? <p className="mt-6 flex items-center gap-2 text-sm text-ink-500"><Loader2 size={16} className="animate-spin" aria-hidden="true" />Cargando…</p> : null}

        {template && shown ? (
          <>
            <div className="mb-5 mt-3 flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-2xl font-semibold text-ink-900">
                  {template.name}
                  {template.archivedAt ? <span className="ml-2 align-middle rounded bg-ink-100 px-2 py-0.5 text-xs font-medium text-ink-500">Archivada</span> : null}
                </h1>
                <p className="mt-1 text-sm text-ink-500">{[template.destination, template.process].filter(Boolean).join(' · ') || 'Sin clasificar'}</p>
                {template.description ? <p className="mt-1 text-sm text-ink-700">{template.description}</p> : null}
              </div>
              <div className="flex flex-wrap gap-2">
                {!template.archivedAt ? <ReuseUploadButton templateId={template.id} icon={Upload} className={buttonStyles.primary}>Usar con un archivo</ReuseUploadButton> : null}
                <button type="button" className={buttonStyles.secondary} onClick={async () => downloadBlob(await api.downloadTemplateExample(template.id))}>
                  <Download size={16} aria-hidden="true" />
                  Excel de ejemplo
                </button>
              </div>
              {advanced ? <div className="flex flex-wrap gap-2">
                {!template.archivedAt ? (
                  <Link href={`/templates/${template.id}/edit`} className={buttonStyles.secondary}>
                    <Pencil size={16} aria-hidden="true" />
                    Editar
                  </Link>
                ) : null}
                <Link href={`/templates/new?from=${template.id}`} className={buttonStyles.secondary}>
                  <Copy size={16} aria-hidden="true" />
                  Crear otra a partir de esta
                </Link>
                <button type="button" className={buttonStyles.secondary} disabled={isBusy} onClick={toggleArchived}>
                  {template.archivedAt ? <ArchiveRestore size={16} aria-hidden="true" /> : <Archive size={16} aria-hidden="true" />}
                  {template.archivedAt ? 'Restaurar' : 'Archivar'}
                </button>
              </div> : null}
            </div>


            <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
              <section className="min-w-0 rounded-lg border border-ink-200 bg-white shadow-panel">
                <div className="flex flex-wrap items-start justify-between gap-2 border-b border-ink-100 px-4 py-4 sm:px-5">
                  <div>
                    <h2 className="text-base font-semibold text-ink-900">Versión {shown.version}{isOldVersion ? ' (anterior)' : ' (vigente)'}</h2>
                    <p className="mt-1 text-sm text-ink-500">{describeOutput(shown.configuration.output)} · {shown.configuration.columns.length} columnas</p>
                  </div>
                  {isOldVersion && !template.archivedAt && advanced ? (
                    <Link href={`/templates/${template.id}/edit?version=${shown.versionId}`} className={buttonStyles.secondary}>
                      <History size={16} aria-hidden="true" />
                      Restaurar esta versión
                    </Link>
                  ) : null}
                </div>
                {shown.configuration.rowSteps ? (
                  <div className="border-b border-ink-100 px-4 py-3">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-500">Filas</h3>
                    <ol className="mt-1 list-inside list-decimal space-y-0.5 text-sm text-ink-700">
                      {describeRowSteps(shown.configuration.rowSteps, shown.configuration.columns).map((line) => <li key={line}>{line}</li>)}
                    </ol>
                  </div>
                ) : null}
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-left text-sm">
                    <thead className="bg-ink-50 text-xs text-ink-500">
                      <tr>
                        <th scope="col" className="w-10 px-4 py-2 font-medium">#</th>
                        <th scope="col" className="px-4 py-2 font-medium">Columna</th>
                        <th scope="col" className="px-4 py-2 font-medium">Origen</th>
                        <th scope="col" className="px-4 py-2 font-medium">Formato</th>
                        {shown.configuration.output.format === 'FIXED_WIDTH' ? <th scope="col" className="px-4 py-2 font-medium">Largo</th> : null}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink-100">
                      {shown.configuration.columns.map((column) => (
                        <tr key={column.id}>
                          <td className="px-4 py-2 tabular-nums text-ink-400">{column.position}</td>
                          <td className="px-4 py-2">
                            <span className="font-medium text-ink-900">{column.outputName}</span>
                            {column.required ? <span className="ml-2 text-xs text-ink-500">Obligatoria</span> : null}
                          </td>
                          <td className="px-4 py-2 text-ink-700">
                            {describeSource(column.source, new Map(shown.configuration.columns.map((other) => [other.id, other.outputName])))}
                            {column.aliases?.length ? <span className="block text-xs text-ink-400">También reconoce: {column.aliases.join(', ')}</span> : null}
                          </td>
                          <td className="px-4 py-2">
                            <span className="flex flex-wrap gap-1">
                              {describeTransformations(column).map((label) => <span key={label} className="rounded bg-ink-100 px-1.5 py-0.5 text-xs text-ink-700">{label}</span>)}
                            </span>
                          </td>
                          {shown.configuration.output.format === 'FIXED_WIDTH' ? (
                            <td className="px-4 py-2 text-xs text-ink-700">{column.fixedWidth.length} · {column.fixedWidth.align === 'RIGHT' ? 'derecha' : 'izquierda'}{column.fixedWidth.padChar === '0' ? ', ceros' : ''}</td>
                          ) : null}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <aside className="rounded-lg border border-ink-200 bg-white p-4 shadow-panel lg:self-start">
                <h2 className="text-sm font-semibold text-ink-900">Historial de versiones</h2>
                <ol className="mt-3 space-y-1">
                  {template.versions.map((version) => {
                    const isShown = version.id === shown.versionId;
                    return (
                      <li key={version.id}>
                        <button
                          type="button"
                          aria-current={isShown ? 'true' : undefined}
                          className={`w-full rounded-md px-2 py-1.5 text-left text-sm ${isShown ? 'bg-cobalt-50 text-cobalt-700' : 'text-ink-700 hover:bg-ink-50'}`}
                          onClick={() => showVersion(version.id)}
                        >
                          <span className="font-medium">Versión {version.version}</span>
                          {version.id === template.versionId ? <span className="ml-1 text-xs text-mint-600">vigente</span> : null}
                          <span className="block text-xs text-ink-500">{formatDateTime(version.createdAt)}{version.createdBy ? ` · ${version.createdBy}` : ''}</span>
                        </button>
                      </li>
                    );
                  })}
                </ol>
              </aside>
            </div>
          </>
        ) : null}
      </div>
    </Shell>
  );
}

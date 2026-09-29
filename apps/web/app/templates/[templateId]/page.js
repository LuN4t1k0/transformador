'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { AlertCircle, Archive, ArchiveRestore, ArrowLeft, Copy, Download, History, Loader2, Pencil, Trash2, Upload } from 'lucide-react';
import { DeleteTemplateDialog } from '../../../components/template-editor/delete-template-dialog';
import { downloadBlob } from '../../../lib/download';
import { ReuseUploadButton } from '../../../components/reuse-upload-button';
import { buttonStyles, Notice } from '../../../components/panel';
import { Shell } from '../../../components/shell';
import { formatDateTime } from '../../../components/job-status';
import { api } from '../../../lib/api';
import { describeOutput, describeOutputDesign, describeParameter, describeRowSteps, describeSource, describeTransformations } from '../../../lib/templates';
import { useAdvancedMode } from '../../../lib/hooks/use-advanced-mode';

// Spreadsheet column letters: A…Z, AA… (the column's place in the generated file).
function columnLetter(index) {
  let letters = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) letters = String.fromCharCode(65 + ((n - 1) % 26)) + letters;
  return letters;
}

export default function TemplateDetailPage() {
  const { templateId } = useParams();
  const [template, setTemplate] = useState(null);
  const [shown, setShown] = useState(null);
  const [error, setError] = useState(null);
  const [isBusy, setIsBusy] = useState(false);
  const [advanced] = useAdvancedMode();
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();

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
            <div className="mb-6 mt-3 space-y-4">
              <div className="min-w-0">
                <h1 className="text-[28px] font-bold leading-tight text-ink-900">
                  {template.name}
                  {template.archivedAt ? <span className="ml-2 align-middle rounded bg-ink-100 px-2 py-0.5 text-sm font-semibold text-ink-500">Archivada</span> : null}
                </h1>
                <p className="mt-1 text-ink-500">{[template.destination, template.process].filter(Boolean).join(', ') || 'Sin destino asignado'}</p>
                {template.description ? <p className="mt-1 max-w-[70ch] text-ink-700">{template.description}</p> : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {!template.archivedAt ? <ReuseUploadButton templateId={template.id} icon={Upload} className={buttonStyles.primary}>Usar con un archivo</ReuseUploadButton> : null}
                <button type="button" className={buttonStyles.secondary} onClick={async () => downloadBlob(await api.downloadTemplateExample(template.id))}>
                  <Download size={16} aria-hidden="true" />
                  Excel de ejemplo
                </button>
              {advanced ? <>
                <span aria-hidden="true" className="mx-1 hidden h-6 w-px bg-ink-200 sm:block" />
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
                <button type="button" className={buttonStyles.danger} disabled={isBusy} onClick={() => setDeleting(true)}>
                  <Trash2 size={16} aria-hidden="true" />
                  Eliminar
                </button>
              </> : null}
              </div>
            </div>


            <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
              <section className="min-w-0 rounded-md border border-ink-200 bg-white">
                <div className="flex flex-wrap items-start justify-between gap-2 border-b border-ink-100 px-4 py-4 sm:px-5">
                  <div>
                    <h2 className="text-lg font-bold text-ink-900">Versión {shown.version}{isOldVersion ? ', anterior' : ', vigente'}</h2>
                    <p className="mt-0.5 text-sm text-ink-500">{describeOutput(shown.configuration.output)}, {shown.configuration.columns.length} columnas.</p>
                  </div>
                  {isOldVersion && !template.archivedAt && advanced ? (
                    <Link href={`/templates/${template.id}/edit?version=${shown.versionId}`} className={buttonStyles.secondary}>
                      <History size={16} aria-hidden="true" />
                      Restaurar esta versión
                    </Link>
                  ) : null}
                </div>
                {shown.configuration.parameters?.length ? (
                  <div className="border-b border-ink-100 px-4 py-3">
                    <h3 className="text-sm font-bold text-ink-900">Datos que se piden al generar</h3>
                    <ul className="mt-1 space-y-0.5 text-sm text-ink-700">
                      {shown.configuration.parameters.map((parameter) => <li key={parameter.id}>{describeParameter(parameter)}</li>)}
                    </ul>
                  </div>
                ) : null}
                {describeOutputDesign(shown.configuration.output, shown.configuration.columns).length ? (
                  <div className="border-b border-ink-100 px-4 py-3">
                    <h3 className="text-sm font-bold text-ink-900">Diseño del archivo</h3>
                    <ul className="mt-1 space-y-0.5 text-sm text-ink-700">
                      {describeOutputDesign(shown.configuration.output, shown.configuration.columns).map((line) => <li key={line} className="break-words">{line}</li>)}
                    </ul>
                  </div>
                ) : null}
                {shown.configuration.rowSteps ? (
                  <div className="border-b border-ink-100 px-4 py-3">
                    <h3 className="text-sm font-bold text-ink-900">Filas</h3>
                    <ol className="mt-1 list-inside list-decimal space-y-0.5 text-sm text-ink-700">
                      {describeRowSteps(shown.configuration.rowSteps, shown.configuration.columns).map((line) => <li key={line}>{line}</li>)}
                    </ol>
                  </div>
                ) : null}
                <div className="relative overflow-x-auto">
                  <table className="w-full min-w-[720px] text-left text-sm">
                    <thead className="bg-ink-50 text-xs text-ink-500">
                      <tr>
                        <th scope="col" className="w-10 px-4 py-2 font-medium"><span className="sr-only">Columna del Excel</span></th>
                        <th scope="col" className="px-4 py-2 font-medium">Columna</th>
                        <th scope="col" className="px-4 py-2 font-medium">Origen</th>
                        <th scope="col" className="px-4 py-2 font-medium">Formato</th>
                        {shown.configuration.output.format === 'FIXED_WIDTH' ? <th scope="col" className="px-4 py-2 font-medium">Largo</th> : null}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink-100">
                      {shown.configuration.columns.map((column) => (
                        <tr key={column.id}>
                          <td className="px-4 py-2 text-center font-mono text-xs text-ink-400" title={`Columna ${column.position} del archivo`}>{columnLetter(column.position - 1)}</td>
                          <td className="px-4 py-2">
                            <span className="font-medium text-ink-900">{column.outputName}</span>
                            {column.required ? <span className="ml-2 text-xs text-ink-500">Obligatoria</span> : null}
                          </td>
                          <td className="px-4 py-2 text-ink-700">
                            {describeSource(column.source, new Map([
                              ...shown.configuration.columns.map((other) => [other.id, other.outputName]),
                              ...(shown.configuration.parameters || []).map((parameter) => [`param:${parameter.id}`, parameter.name])
                            ]))}
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

              <aside className="lg:sticky lg:top-6 lg:self-start">
                <h2 className="px-2 text-sm font-bold text-ink-900">Versiones</h2>
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
                          <span className="block text-xs text-ink-500">{formatDateTime(version.createdAt)}{version.createdBy ? `, ${version.createdBy}` : ''}</span>
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
      {deleting && template ? (
        <DeleteTemplateDialog
          template={template}
          onCancel={() => setDeleting(false)}
          onDelete={async (confirmation) => {
            await api.deleteTemplate(template.id, confirmation);
            router.push(`/templates?eliminada=${encodeURIComponent(template.name)}`);
          }}
        />
      ) : null}
    </Shell>
  );
}

import Link from 'next/link';
import { AlertCircle, Check, CheckCircle2, Clock, Download, FileWarning, FilePlus2, Loader2, Repeat, Trash2, Upload, XCircle } from 'lucide-react';
import { useState } from 'react';
import { formatTime } from '../job-status';
import { describeIssue, describeIssueHint } from '../../lib/templates';
import { ReuseUploadButton } from '../reuse-upload-button';
import { buttonStyles, Notice } from '../panel';

const STAGES = [
  { id: 'QUEUED', label: 'En cola' },
  { id: 'TRANSFORMING', label: 'Convirtiendo filas' },
  { id: 'VALIDATING', label: 'Validando resultado' },
  { id: 'GENERATING', label: 'Generando archivo' }
];

export function RunProgress({ job, onCancel, isBusy }) {
  const currentIndex = Math.max(0, STAGES.findIndex((stage) => stage.id === job.stage));
  const progress = job.progress;

  return (
    <div>
      <ol className="space-y-3" aria-label="Etapas">
        {STAGES.map((stage, index) => {
          const isDone = index < currentIndex;
          const isCurrent = index === currentIndex;
          return (
            <li key={stage.id} className="flex items-start gap-3">
              <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                isDone ? 'bg-mint-600 text-white' : isCurrent ? 'bg-cobalt-600 text-white' : 'bg-ink-100 text-ink-400'
              }`}>
                {isDone ? <Check size={14} aria-hidden="true" /> : isCurrent ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Clock size={13} aria-hidden="true" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className={`text-sm ${isCurrent ? 'font-semibold text-ink-900' : isDone ? 'text-ink-700' : 'text-ink-400'}`}>
                  {stage.label}
                  {isCurrent ? <span className="sr-only"> (en curso)</span> : null}
                </p>
                {stage.id === 'TRANSFORMING' && progress && (isCurrent || isDone) ? (
                  <div className="mt-1.5">
                    <div
                      className="h-1.5 overflow-hidden rounded-full bg-ink-200"
                      role="progressbar"
                      aria-label="Filas procesadas"
                      aria-valuenow={progress.processed}
                      aria-valuemin={0}
                      aria-valuemax={progress.total}
                    >
                      <div className="h-full rounded-full bg-cobalt-600 transition-[width]" style={{ width: `${(progress.processed / Math.max(progress.total, 1)) * 100}%` }} />
                    </div>
                    <p className="mt-1 text-xs tabular-nums text-ink-500">{progress.processed} de {progress.total} filas</p>
                  </div>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>

      <p className="mt-4 text-xs text-ink-500">El avance lo informa el servidor. Puedes cerrar esta página: el proceso continúa y podrás retomarlo desde el historial.</p>

      <div className="mt-4 flex justify-end">
        <button type="button" className={buttonStyles.danger} disabled={isBusy} onClick={onCancel}>
          <XCircle size={16} aria-hidden="true" />
          Cancelar
        </button>
      </div>
    </div>
  );
}

function IssuesTable({ groups }) {
  return (
    <div className="relative overflow-x-auto rounded-lg border border-ink-200">
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead className="bg-ink-50 text-xs text-ink-500">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">Columna</th>
            <th scope="col" className="px-3 py-2 font-medium">Problema</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Casos</th>
            <th scope="col" className="px-3 py-2 font-medium">Filas de ejemplo</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {groups.map((group) => (
            <tr key={`${group.column}-${group.code}`}>
              <td className="px-3 py-2 font-medium text-ink-900">{group.column}</td>
              <td className={`px-3 py-2 ${group.severity === 'error' ? 'text-rose-700' : 'text-amber-700'}`}>
                {describeIssue(group)}
                {describeIssueHint(group) ? <span className="block text-xs text-ink-500">{describeIssueHint(group)}</span> : null}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-ink-900">{group.count}</td>
              <td className="px-3 py-2 tabular-nums text-ink-500">
                {group.sampleRows.join(', ')}
                {group.count > group.sampleRows.length ? ` y ${group.count - group.sampleRows.length} más` : ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function RunResult({ job, onDownload, onPurge, isBusy }) {
  const [confirmPurge, setConfirmPurge] = useState(false);
  const { summary, files } = job;
  const excludedRows = summary.excludedRows || 0;
  const invalidRows = summary.totalRows - summary.validRows - excludedRows;
  const steps = summary.rowSteps;
  const stats = [
    { label: 'Filas totales', value: summary.totalRows },
    { label: 'Filas en el archivo', value: steps?.outputRows ?? summary.validRows, tone: (steps?.outputRows ?? summary.validRows) ? 'text-mint-600' : 'text-rose-700' },
    { label: 'Filas rechazadas', value: invalidRows, tone: invalidRows ? 'text-rose-700' : undefined },
    { label: 'Advertencias', value: summary.warningCount, tone: summary.warningCount ? 'text-amber-700' : undefined }
  ];

  const outputRows = steps?.outputRows ?? summary.validRows;

  return (
    <div>
      {outputRows === 0 && summary.totalRows > 0 ? (
        <div className="mb-4">
          <Notice tone="danger" icon={AlertCircle} role="alert">El archivo salió sin filas: todas fueron rechazadas. Revisa los problemas de abajo, corrige las filas o repite la conversión ajustando las columnas.</Notice>
        </div>
      ) : null}
      {job.status === 'DOWNLOADED' ? (
        <div className="mb-4">
          <Notice tone="success" icon={CheckCircle2} role="status">Archivo descargado. Puedes volver a descargarlo hasta las {formatTime(job.expiresAt)}.</Notice>
        </div>
      ) : null}

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-md border border-ink-200 bg-ink-50 p-3">
            <dt className="text-xs font-medium text-ink-500">{stat.label}</dt>
            <dd className={`mt-1 text-xl font-semibold tabular-nums ${stat.tone || 'text-ink-900'}`}>{stat.value}</dd>
          </div>
        ))}
      </dl>
      {job.outputFileName ? (
        <p className="mt-3 text-sm text-ink-700">
          Archivo: <span className="font-mono">{job.outputFileName}</span>
          {summary.parts?.length ? (
            <span className="block text-xs text-ink-500">
              {job.workingTemplate?.output?.split?.mode === 'SHEETS' ? 'Hojas' : 'Archivos dentro del .zip'}: {summary.parts.map((part) => `${part.fileName || part.name} (${part.rows})`).join(', ')}
            </span>
          ) : null}
        </p>
      ) : null}
      {excludedRows || steps?.duplicateRows || (steps && steps.outputRows !== summary.validRows) ? (
        <p className="mt-2 text-sm text-ink-500">
          {[
            excludedRows ? `${excludedRows} ${excludedRows === 1 ? 'fila quedó fuera' : 'filas quedaron fuera'} por el filtro de la plantilla` : null,
            steps?.duplicateRows ? `${steps.duplicateRows} ${steps.duplicateRows === 1 ? 'duplicada quitada' : 'duplicadas quitadas'}` : null,
            steps && steps.outputRows < summary.validRows - steps.duplicateRows ? `${summary.validRows - steps.duplicateRows} filas agrupadas en ${steps.outputRows}` : null
          ].filter(Boolean).join(' · ')}.
        </p>
      ) : null}

      {summary.issueGroups?.length ? (
        <>
          <h3 className="mb-2 mt-5 text-sm font-semibold text-ink-900">Problemas encontrados</h3>
          <IssuesTable groups={summary.issueGroups} />
          {summary.truncatedGroups ? (
            <p className="mt-2 text-xs text-ink-500">Hay más tipos de problema de los que se muestran; los totales de arriba incluyen todas las filas.</p>
          ) : null}
        </>
      ) : null}

      {files?.rejects ? (
        <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50/60 p-4 text-sm">
          <h3 className="font-semibold text-ink-900">Corregir las filas rechazadas</h3>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-ink-700">
            <li>Descarga las filas rechazadas: cada una trae el motivo y cómo corregirlo.</li>
            <li>Corrígelas en Excel. Puedes dejar las columnas «Fila en el Excel» y «Problemas».</li>
            <li>Súbelas aquí: usaremos la misma configuración y te entregaremos un archivo solo con esas filas.</li>
          </ol>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className={buttonStyles.secondary} disabled={isBusy} onClick={() => onDownload('rejects')}>
              <FileWarning size={16} aria-hidden="true" />
              Descargar rechazadas ({files.rejectedRows})
            </button>
            <ReuseUploadButton reuseFromJobId={job.id} icon={Upload} className={buttonStyles.secondary}>Subir corregidas</ReuseUploadButton>
          </div>
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
        <ReuseUploadButton reuseFromJobId={job.id} icon={Repeat} className={buttonStyles.secondary}>Repetir con otro archivo</ReuseUploadButton>
        <button type="button" className={outputRows ? buttonStyles.primary : buttonStyles.secondary} disabled={isBusy} onClick={() => onDownload('output')}>
          <Download size={16} aria-hidden="true" />
          {job.status === 'DOWNLOADED' ? 'Descargar de nuevo' : 'Descargar archivo'}
        </button>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-ink-100 pt-4 text-sm">
        <p className="text-ink-500">Los archivos se eliminan automáticamente a las {formatTime(job.expiresAt)}.</p>
        {confirmPurge ? (
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-ink-700">¿Eliminar el archivo generado, los rechazos y el Excel original?</span>
            <button type="button" className={buttonStyles.danger} disabled={isBusy} onClick={onPurge}>Sí, eliminar</button>
            <button type="button" className={buttonStyles.secondary} onClick={() => setConfirmPurge(false)}>Cancelar</button>
          </span>
        ) : (
          <button type="button" className={buttonStyles.danger} disabled={isBusy} onClick={() => setConfirmPurge(true)}>
            <Trash2 size={16} aria-hidden="true" />
            Eliminar archivos ahora
          </button>
        )}
      </div>
    </div>
  );
}

const TERMINAL_MESSAGES = {
  PURGED: { tone: 'success', icon: CheckCircle2, title: 'Archivos eliminados', text: 'Los archivos temporales de este job ya no están en el servidor. Si necesitas el archivo otra vez, vuelve a convertirlo.' },
  CANCELLED: { tone: 'warning', icon: XCircle, title: 'Transformación cancelada', text: 'No se generó ningún archivo. Vuelve a subir el archivo para intentarlo de nuevo.' },
  EXPIRED: { tone: 'warning', icon: Clock, title: 'El job expiró', text: 'Los archivos temporales se eliminaron por tiempo. Vuelve a subir el Excel para continuar.' },
  FAILED: { tone: 'danger', icon: AlertCircle, title: 'No pudimos procesar el archivo', text: 'No se generó ningún archivo y los temporales se eliminaron.' }
};

export function RunTerminal({ job }) {
  const message = TERMINAL_MESSAGES[job.status];
  if (!message) return null;

  return (
    <div>
      <Notice tone={message.tone} icon={message.icon} role="status">
        <p className="font-semibold">{message.title}</p>
        <p className="mt-0.5">{message.text}</p>
        {job.error ? <p className="mt-1">{job.error.message} <span className="font-mono text-xs">({job.error.code})</span></p> : null}
      </Notice>
      {job.summary ? (
        <p className="mt-3 text-sm text-ink-500">
          Resultado: {job.summary.validRows} de {job.summary.totalRows} filas válidas.
        </p>
      ) : null}
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        {job.workingTemplate && ['PURGED', 'EXPIRED'].includes(job.status) ? (
          <ReuseUploadButton reuseFromJobId={job.id} icon={Repeat} className={buttonStyles.secondary}>Repetir con otro archivo</ReuseUploadButton>
        ) : null}
        <Link href="/" className={buttonStyles.primary}>
          <FilePlus2 size={16} aria-hidden="true" />
          Convertir otro archivo
        </Link>
      </div>
    </div>
  );
}

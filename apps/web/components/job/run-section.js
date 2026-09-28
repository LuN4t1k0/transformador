import Link from 'next/link';
import { AlertCircle, Check, CheckCircle2, Clock, Download, FilePlus2, Loader2, XCircle } from 'lucide-react';
import { describeIssue } from '../../lib/templates';
import { buttonStyles, Notice } from '../panel';

const STAGES = [
  { id: 'QUEUED', label: 'En cola' },
  { id: 'TRANSFORMING', label: 'Transformando filas' },
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
    <div className="overflow-x-auto rounded-lg border border-ink-200">
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
                <span className="ml-1 font-mono text-xs text-ink-400">{group.code}</span>
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

export function RunResult({ job, onDownload, isBusy }) {
  const { summary } = job;
  const invalidRows = summary.totalRows - summary.validRows;
  const stats = [
    { label: 'Filas totales', value: summary.totalRows },
    { label: 'Filas válidas', value: summary.validRows, tone: 'text-mint-600' },
    { label: 'Filas excluidas', value: invalidRows, tone: invalidRows ? 'text-rose-700' : undefined },
    { label: 'Advertencias', value: summary.warningCount, tone: summary.warningCount ? 'text-amber-700' : undefined }
  ];

  return (
    <div>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-md border border-ink-200 bg-ink-50 p-3">
            <dt className="text-xs font-medium text-ink-500">{stat.label}</dt>
            <dd className={`mt-1 text-xl font-semibold tabular-nums ${stat.tone || 'text-ink-900'}`}>{stat.value}</dd>
          </div>
        ))}
      </dl>

      {summary.issueGroups?.length ? (
        <>
          <h3 className="mb-2 mt-5 text-sm font-semibold text-ink-900">Problemas encontrados</h3>
          <IssuesTable groups={summary.issueGroups} />
          {summary.truncatedGroups ? (
            <p className="mt-2 text-xs text-ink-500">Hay más tipos de problema de los que se muestran; los totales de arriba incluyen todas las filas.</p>
          ) : null}
        </>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
        <p className="text-xs text-ink-500">Al descargar, el archivo temporal se elimina del servidor.</p>
        <button type="button" className={buttonStyles.primary} disabled={isBusy} onClick={onDownload}>
          <Download size={16} aria-hidden="true" />
          Descargar archivo
        </button>
      </div>
    </div>
  );
}

const TERMINAL_MESSAGES = {
  DOWNLOADED: { tone: 'success', icon: CheckCircle2, title: 'Archivo descargado', text: 'La copia temporal se eliminará del servidor.' },
  PURGED: { tone: 'success', icon: CheckCircle2, title: 'Archivo descargado', text: 'La copia temporal ya fue eliminada del servidor. Si necesitas el archivo otra vez, crea un nuevo job.' },
  CANCELLED: { tone: 'warning', icon: XCircle, title: 'Transformación cancelada', text: 'No se generó ningún archivo. Crea un nuevo job para volver a intentarlo.' },
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
      <div className="mt-5 flex justify-end">
        <Link href="/jobs/new" className={buttonStyles.primary}>
          <FilePlus2 size={16} aria-hidden="true" />
          Nuevo job
        </Link>
      </div>
    </div>
  );
}

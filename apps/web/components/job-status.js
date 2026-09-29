import { AlertCircle, CheckCircle2, CircleDashed, Clock, Loader2, XCircle } from 'lucide-react';

// One status language across the app: green ready, amber needs a look, red error, grey nothing left to do.
const tones = {
  review: { icon: CircleDashed, className: 'bg-amber-100 text-amber-700 ring-amber-200' },
  progress: { icon: Loader2, className: 'bg-cobalt-50 text-cobalt-700 ring-cobalt-100', spin: true },
  success: { icon: CheckCircle2, className: 'bg-mint-50 text-mint-600 ring-mint-100' },
  danger: { icon: AlertCircle, className: 'bg-rose-50 text-rose-700 ring-rose-200' },
  muted: { icon: XCircle, className: 'bg-ink-100 text-ink-500 ring-ink-200' },
  expired: { icon: Clock, className: 'bg-ink-100 text-ink-500 ring-ink-200' }
};

export const JOB_STATUS_VIEW = {
  QUEUED_ANALYSIS: { label: 'Leyendo archivo', tone: 'progress' },
  ANALYZING: { label: 'Leyendo archivo', tone: 'progress' },
  READY: { label: 'Por revisar', tone: 'review' },
  QUEUED_TRANSFORMATION: { label: 'En espera', tone: 'progress' },
  TRANSFORMING: { label: 'Generando', tone: 'progress' },
  VALIDATING: { label: 'Validando', tone: 'progress' },
  GENERATING: { label: 'Generando archivo', tone: 'progress' },
  READY_TO_DOWNLOAD: { label: 'Listo para descargar', tone: 'success' },
  DOWNLOADED: { label: 'Descargado', tone: 'success' },
  PURGED: { label: 'Descargado y eliminado', tone: 'success' },
  FAILED: { label: 'Con error', tone: 'danger' },
  CANCELLED: { label: 'Cancelado', tone: 'muted' },
  EXPIRED: { label: 'Expirado', tone: 'expired' }
};

export function JobStatusBadge({ status }) {
  const view = JOB_STATUS_VIEW[status] || { label: status, tone: 'muted' };
  const tone = tones[view.tone];
  const Icon = tone.icon;

  return (
    <span className={`inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2 text-xs font-semibold ring-1 ring-inset ${tone.className}`}>
      <Icon size={13} className={tone.spin ? 'animate-spin' : undefined} aria-hidden="true" />
      {view.label}
    </span>
  );
}

export function formatTime(isoDate) {
  return new Date(isoDate).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function formatDateTime(isoDate) {
  return new Date(isoDate).toLocaleString('es-CL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
}

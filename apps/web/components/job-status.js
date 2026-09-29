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

// Quiet variant for lists: a colored dot and the label, no pill.
const dotTones = {
  review: { dot: 'bg-amber-400', text: 'text-amber-700' },
  progress: { dot: 'bg-cobalt-600 animate-pulse', text: 'text-cobalt-700' },
  success: { dot: 'bg-mint-600', text: 'text-mint-600' },
  danger: { dot: 'bg-rose-600', text: 'text-rose-700' },
  muted: { dot: 'bg-ink-300', text: 'text-ink-500' },
  expired: { dot: 'bg-ink-300', text: 'text-ink-500' }
};

export function JobStatusText({ status }) {
  const view = JOB_STATUS_VIEW[status] || { label: status, tone: 'muted' };
  const tone = dotTones[view.tone];
  return (
    <span className={`inline-flex items-center gap-1.5 font-medium ${tone.text}`}>
      <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${tone.dot}`} />
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

import { AlertCircle, CheckCircle2, CircleDashed, HelpCircle } from 'lucide-react';

const variants = {
  OK: { label: 'Listo', icon: CheckCircle2, className: 'bg-mint-50 text-mint-600 ring-mint-100' },
  REQUIERE_CONFIRMACION: { label: 'Por confirmar', icon: HelpCircle, className: 'bg-amber-50 text-amber-700 ring-amber-200' },
  FALTANTE: { label: 'Falta origen', icon: AlertCircle, className: 'bg-rose-50 text-rose-700 ring-rose-200' },
  default: { label: null, icon: CircleDashed, className: 'bg-ink-100 text-ink-700 ring-ink-200' }
};

export function StatusPill({ value, label }) {
  const variant = variants[value] || variants.default;
  const Icon = variant.icon;

  return (
    <span className={`inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2 text-xs font-semibold ring-1 ring-inset ${variant.className}`}>
      <Icon size={13} aria-hidden="true" />
      {label || variant.label || value}
    </span>
  );
}

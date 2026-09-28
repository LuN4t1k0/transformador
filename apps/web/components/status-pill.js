const styles = {
  OK: 'bg-mint-50 text-mint-600 ring-mint-100',
  CONFIRMAR: 'bg-amber-50 text-amber-700 ring-amber-200',
  FALTANTE: 'bg-rose-50 text-rose-600 ring-rose-50',
  READY: 'bg-mint-50 text-mint-600 ring-mint-100',
  default: 'bg-ink-100 text-ink-700 ring-ink-200'
};

export function StatusPill({ value }) {
  return (
    <span className={`inline-flex h-6 items-center rounded-full px-2.5 text-xs font-semibold ring-1 ring-inset ${styles[value] || styles.default}`}>
      {value}
    </span>
  );
}

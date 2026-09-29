export function Panel({ title, description, actions, headingRef, children }) {
  return (
    <section className="rounded-md border border-ink-200 bg-white">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-ink-100 px-4 py-4 sm:px-5">
        <div className="min-w-0">
          <h2 ref={headingRef} tabIndex={-1} className="text-lg font-bold text-ink-900 focus:outline-none">{title}</h2>
          {description ? <p className="mt-1 text-sm text-ink-500">{description}</p> : null}
        </div>
        {actions}
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

export function Notice({ tone = 'info', icon: Icon, role, children }) {
  const tones = {
    info: 'border-cobalt-100 bg-cobalt-50 text-cobalt-700',
    success: 'border-mint-100 bg-mint-50 text-mint-600',
    warning: 'border-amber-200 bg-amber-50 text-amber-700',
    danger: 'border-rose-200 bg-rose-50 text-rose-700'
  };

  return (
    <div role={role} className={`flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${tones[tone]}`}>
      {Icon ? <Icon size={16} className="mt-0.5 shrink-0" aria-hidden="true" /> : null}
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export const buttonStyles = {
  primary: 'inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-md bg-cobalt-600 px-4 text-sm font-semibold text-white hover:bg-cobalt-700 disabled:cursor-not-allowed disabled:bg-ink-200 disabled:text-ink-500',
  secondary: 'inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-md border border-ink-200 bg-white px-3 text-sm font-semibold text-ink-700 hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-50',
  danger: 'inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-md border border-rose-200 bg-white px-3 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50'
};

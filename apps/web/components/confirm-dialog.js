'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { AlertTriangle, Loader2, Trash2 } from 'lucide-react';
import { buttonStyles } from './panel';

export function ConfirmDialog({
  title,
  children,
  confirmLabel = 'Confirmar',
  loadingLabel = 'Procesando…',
  tone = 'danger',
  onCancel,
  onConfirm
}) {
  const [state, setState] = useState({ busy: false, error: '' });
  const dialogRef = useRef(null);
  const cancelRef = useRef(null);
  const id = useId();
  const latest = useRef({ onCancel, busy: false });
  latest.current = { onCancel, busy: state.busy };

  useEffect(() => {
    const previous = document.activeElement;
    cancelRef.current?.focus();
    const onKey = (event) => {
      if (event.key === 'Escape' && !latest.current.busy) latest.current.onCancel();
      if (event.key === 'Tab' && dialogRef.current) {
        const focusable = [...dialogRef.current.querySelectorAll('button:not([disabled])')];
        const first = focusable[0];
        const last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, []);

  async function submit() {
    setState({ busy: true, error: '' });
    try {
      await onConfirm();
    } catch (error) {
      setState({ busy: false, error: error.message || 'No pudimos completar la acción.' });
    }
  }

  const accent = tone === 'danger' ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-700';
  const confirmClass = tone === 'danger'
    ? 'inline-flex h-10 items-center gap-2 rounded-md bg-rose-600 px-4 text-sm font-semibold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:bg-ink-200 disabled:text-ink-500'
    : buttonStyles.primary;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink-900/40 p-4 sm:items-center" onMouseDown={(event) => { if (event.target === event.currentTarget && !state.busy) onCancel(); }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={`${id}-text`} className="w-full max-w-md rounded-lg border border-ink-200 bg-white p-5 shadow-pop">
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${accent}`}><AlertTriangle size={18} aria-hidden="true" /></span>
            <div>
              <h2 id={`${id}-title`} className="text-lg font-bold text-ink-900">{title}</h2>
              <div id={`${id}-text`} className="mt-1 text-sm text-ink-700">{children}</div>
            </div>
          </div>
          {state.error ? <p role="alert" className="text-sm text-rose-700">{state.error}</p> : null}
          <div className="flex flex-wrap justify-end gap-2">
            <button ref={cancelRef} type="button" className={buttonStyles.secondary} disabled={state.busy} onClick={onCancel}>Cancelar</button>
            <button type="button" disabled={state.busy} className={confirmClass} onClick={submit}>
              {state.busy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Trash2 size={16} aria-hidden="true" />}
              {state.busy ? loadingLabel : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

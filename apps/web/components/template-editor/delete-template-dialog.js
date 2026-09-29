'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { AlertTriangle, Loader2, Trash2 } from 'lucide-react';
import { buttonStyles } from '../panel';

// Deleting a template is only enabled after typing «eliminar» or the template's exact name (the API checks it too).
export function DeleteTemplateDialog({ template, onCancel, onDelete }) {
  const [typed, setTyped] = useState('');
  const [state, setState] = useState({ deleting: false, error: '' });
  const inputRef = useRef(null);
  const dialogRef = useRef(null);
  const id = useId();
  const normalized = typed.trim().toLowerCase();
  const confirmed = normalized === 'eliminar' || normalized === template.name.trim().toLowerCase();

  const latest = useRef({ onCancel, deleting: false });
  latest.current = { onCancel, deleting: state.deleting };

  // Registered once: focus goes to the input on open and back to the opener on close.
  useEffect(() => {
    const previous = document.activeElement;
    inputRef.current?.focus();
    const onKey = (event) => {
      if (event.key === 'Escape' && !latest.current.deleting) latest.current.onCancel();
      // Keep keyboard focus inside the dialog.
      if (event.key === 'Tab' && dialogRef.current) {
        const focusable = [...dialogRef.current.querySelectorAll('input, button:not([disabled])')];
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

  async function submit(event) {
    event.preventDefault();
    if (!confirmed) return;
    setState({ deleting: true, error: '' });
    try {
      await onDelete(typed.trim());
    } catch (error) {
      setState({ deleting: false, error: error.message || 'No pudimos eliminar la plantilla.' });
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink-900/40 p-4 sm:items-center" onMouseDown={(event) => { if (event.target === event.currentTarget && !state.deleting) onCancel(); }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={`${id}-text`} className="w-full max-w-md rounded-lg border border-ink-200 bg-white p-5 shadow-pop">
        <form onSubmit={submit} className="space-y-4">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rose-50 text-rose-600"><AlertTriangle size={18} aria-hidden="true" /></span>
            <div>
              <h2 id={`${id}-title`} className="text-lg font-bold text-ink-900">Eliminar «{template.name}»</h2>
              <p id={`${id}-text`} className="mt-1 text-sm text-ink-700">
                La plantilla deja de aparecer para todo el equipo y no se podrá usar en conversiones nuevas. Las conversiones ya hechas conservan su historial. Si solo quieres ocultarla por un tiempo, archívala.
              </p>
            </div>
          </div>
          <div>
            <label htmlFor={`${id}-confirm`} className="mb-1 block text-sm text-ink-700">
              Para confirmar, escribe <strong>eliminar</strong> o el nombre de la plantilla.
            </label>
            <input
              ref={inputRef}
              id={`${id}-confirm`}
              className="h-10 w-full rounded-md border border-ink-200 px-3 text-sm"
              value={typed}
              autoComplete="off"
              onChange={(event) => setTyped(event.target.value)}
              disabled={state.deleting}
            />
          </div>
          {state.error ? <p role="alert" className="text-sm text-rose-700">{state.error}</p> : null}
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className={buttonStyles.secondary} disabled={state.deleting} onClick={onCancel}>Cancelar</button>
            <button type="submit" disabled={!confirmed || state.deleting} className="inline-flex h-10 items-center gap-2 rounded-md bg-rose-600 px-4 text-sm font-semibold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:bg-ink-200 disabled:text-ink-500">
              {state.deleting ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Trash2 size={16} aria-hidden="true" />}
              Eliminar plantilla
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

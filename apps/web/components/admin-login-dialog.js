'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { AlertCircle, KeyRound, Loader2, X } from 'lucide-react';
import { Notice, buttonStyles } from './panel';

export function AdminLoginDialog({ open, onCancel, onSuccess }) {
  const dialogRef = useRef(null);
  const busyRef = useRef(false);
  const titleId = useId();
  const descriptionId = useId();
  const [credentials, setCredentials] = useState({ username: '', password: '' });
  const [state, setState] = useState({ busy: false, error: '' });

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  function close() {
    if (busyRef.current) return;
    setState({ busy: false, error: '' });
    setCredentials({ username: '', password: '' });
    onCancel();
  }

  async function submit(event) {
    event.preventDefault();
    if (busyRef.current) return;
    busyRef.current = true;
    setState({ busy: true, error: '' });
    const response = await fetch('/admin/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(credentials)
    }).catch(() => null);
    if (!response?.ok) {
      const data = await response?.json().catch(() => null);
      busyRef.current = false;
      setState({ busy: false, error: data?.error?.message || 'No pudimos validar las credenciales.' });
      return;
    }
    onSuccess();
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-lg border border-ink-200 bg-white p-0 text-ink-900 shadow-pop backdrop:bg-ink-900/40"
      onCancel={(event) => { event.preventDefault(); close(); }}
      onClick={(event) => { if (event.target === event.currentTarget) close(); }}
    >
      <form className="p-5" onSubmit={submit}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id={titleId} className="text-lg font-bold">Activar modo avanzado</h2>
            <p id={descriptionId} className="mt-1 text-sm text-ink-500">Ingresa tus credenciales de administrador para crear y modificar plantillas.</p>
          </div>
          <button type="button" className="rounded-md p-1.5 text-ink-500 hover:bg-ink-50" aria-label="Cerrar" disabled={state.busy} onClick={close}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="mt-5 space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-ink-700">Usuario</span>
            <input
              type="text"
              autoComplete="username"
              autoFocus
              required
              value={credentials.username}
              onChange={(event) => setCredentials((current) => ({ ...current, username: event.target.value }))}
              className="h-11 w-full rounded-md border border-ink-200 bg-white px-3 text-ink-900"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-ink-700">Contraseña</span>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={credentials.password}
              onChange={(event) => setCredentials((current) => ({ ...current, password: event.target.value }))}
              className="h-11 w-full rounded-md border border-ink-200 bg-white px-3 text-ink-900"
            />
          </label>
          {state.error ? <Notice tone="danger" icon={AlertCircle} role="alert">{state.error}</Notice> : null}
        </div>

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" className={buttonStyles.secondary} disabled={state.busy} onClick={close}>Cancelar</button>
          <button type="submit" className={buttonStyles.primary} disabled={state.busy || !credentials.username || !credentials.password}>
            {state.busy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <KeyRound size={16} aria-hidden="true" />}
            {state.busy ? 'Validando…' : 'Activar'}
          </button>
        </div>
      </form>
    </dialog>
  );
}

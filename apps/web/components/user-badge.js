'use client';

import { useSession } from '../lib/hooks/use-session';

function initials(name) {
  return String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0].toUpperCase()).join('');
}

export function UserBadge({ variant = 'compact' }) {
  const state = useSession();

  if (state.error) {
    return (
      <span className="text-sm font-medium text-rose-700">
        {state.error.status === 401 ? 'Sesión no iniciada' : 'Servidor no disponible'}
      </span>
    );
  }
  if (!state.user) return null;

  return (
    <div className="flex min-w-0 items-center gap-2 text-sm text-ink-700" title={state.user.role === 'admin' ? 'Administrador autenticado' : 'Usuario'}>
      <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-cobalt-50 text-xs font-bold text-cobalt-700">{initials(state.user.displayName)}</span>
      <span className={variant === 'rail' ? 'min-w-0' : 'sr-only'}>
        <span className="block truncate">{state.user.displayName}</span>
        {state.user.role === 'admin' ? <span className="block text-xs text-ink-500">Administrador</span> : null}
      </span>
    </div>
  );
}

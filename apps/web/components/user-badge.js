'use client';

import { useEffect, useState } from 'react';
import { api } from '../lib/api';

function initials(name) {
  return String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0].toUpperCase()).join('');
}

export function UserBadge({ variant = 'compact' }) {
  const [state, setState] = useState({ user: null, error: null });

  useEffect(() => {
    api.getSession().then((user) => setState({ user, error: null })).catch((error) => setState({ user: null, error }));
  }, []);

  if (state.error) {
    return (
      <span className="text-sm font-medium text-rose-700">
        {state.error.status === 401 ? 'Sesión no iniciada' : 'Servidor no disponible'}
      </span>
    );
  }
  if (!state.user) return null;

  return (
    <div className="flex min-w-0 items-center gap-2 text-sm text-ink-700" title={state.user.displayName}>
      <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-cobalt-50 text-xs font-bold text-cobalt-700">{initials(state.user.displayName)}</span>
      <span className={variant === 'rail' ? 'truncate' : 'sr-only'}>{state.user.displayName}</span>
    </div>
  );
}

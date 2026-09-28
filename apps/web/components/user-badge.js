'use client';

import { useEffect, useState } from 'react';
import { UserCircle } from 'lucide-react';
import { api } from '../lib/api';

export function UserBadge() {
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
    <div className="flex h-9 min-w-0 items-center gap-2 rounded-md border border-ink-200 bg-white px-3 text-sm font-medium text-ink-700">
      <UserCircle size={17} className="shrink-0" aria-hidden="true" />
      <span className="truncate">{state.user.displayName}</span>
    </div>
  );
}

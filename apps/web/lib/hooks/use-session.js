'use client';

import { useEffect, useState } from 'react';
import { api } from '../api';

let cachedUser = null;
let pending = null;

export function useSession() {
  const [state, setState] = useState({ user: cachedUser, error: null, loading: !cachedUser });

  useEffect(() => {
    let active = true;
    pending = pending || api.getSession().then((user) => {
      cachedUser = user;
      return user;
    }).finally(() => {
      pending = null;
    });
    pending.then((user) => active && setState({ user, error: null, loading: false }))
      .catch((error) => active && setState({ user: null, error, loading: false }));
    return () => { active = false; };
  }, []);

  return state;
}

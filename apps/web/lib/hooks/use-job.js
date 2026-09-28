'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';

// HTTP responses and realtime events can arrive out of order (a fast worker may finish before the response
// that queued it is processed). Never replace the job with an older snapshot.
function newest(current, incoming) {
  if (!current || !incoming?.updatedAt || !current.updatedAt) return incoming;
  return new Date(incoming.updatedAt) >= new Date(current.updatedAt) ? incoming : current;
}

// Loads job metadata and keeps it in sync with realtime events. Every event carries the full job and each
// (re)subscription rehydrates it, so disconnections never leave the page with stale state.
export function useJob(jobId) {
  const [state, setState] = useState({ job: null, error: null, isLoading: true });
  const [isRealtimeConnected, setIsRealtimeConnected] = useState(true);

  useEffect(() => {
    let active = true;
    const unsubscribe = api.subscribe(jobId, ({ job }) => {
      if (active) setState((current) => ({ job: newest(current.job, job), error: null, isLoading: false }));
    });
    const stopConnectionWatch = api.onConnectionChange((connected) => active && setIsRealtimeConnected(connected));

    api.getJob(jobId)
      .then((job) => active && setState((current) => ({ job: newest(current.job, job), error: null, isLoading: false })))
      .catch((error) => active && setState({ job: null, error, isLoading: false }));

    return () => {
      active = false;
      unsubscribe();
      stopConnectionWatch();
    };
  }, [jobId]);

  const setJob = useCallback((job) => setState((current) => ({ ...current, job: newest(current.job, job) })), []);

  return { ...state, setJob, isRealtimeConnected };
}

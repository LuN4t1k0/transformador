'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';

// Loads job metadata and keeps it in sync with realtime events. Every event carries the full job,
// so a missed event is recovered on the next one or on reload (rehydration from getJob).
export function useJob(jobId) {
  const [state, setState] = useState({ job: null, error: null, isLoading: true });

  useEffect(() => {
    let active = true;
    // Subscribe first: getJob may resume a stalled worker that emits immediately.
    const unsubscribe = api.subscribe(jobId, ({ job }) => {
      if (active) setState({ job, error: null, isLoading: false });
    });

    api.getJob(jobId)
      .then((job) => active && setState({ job, error: null, isLoading: false }))
      .catch((error) => active && setState({ job: null, error, isLoading: false }));

    return () => {
      active = false;
      unsubscribe();
    };
  }, [jobId]);

  const setJob = useCallback((job) => setState((current) => ({ ...current, job })), []);

  return { ...state, setJob };
}

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';

const SAVE_DELAY_MS = 600;

// Local draft of the job's working template with debounced autosave. Server updates replace the draft only
// when there are no unsaved local edits, so typing is never overwritten by a save response or realtime event.
export function useWorkingTemplate(job, setJob) {
  const [draft, setDraft] = useState({ template: job.workingTemplate, confirmedIds: job.confirmedIds });
  const [saveState, setSaveState] = useState({ status: 'saved', error: null });
  const draftRef = useRef(draft);
  const versionRef = useRef(0);
  const savedVersionRef = useRef(0);
  const timerRef = useRef(null);
  const inFlightRef = useRef(null);

  useEffect(() => {
    if (versionRef.current !== savedVersionRef.current) return;
    const next = { template: job.workingTemplate, confirmedIds: job.confirmedIds };
    draftRef.current = next;
    setDraft(next);
  }, [job.workingTemplate, job.confirmedIds]);

  const flush = useCallback(async () => {
    clearTimeout(timerRef.current);
    if (inFlightRef.current) await inFlightRef.current.catch(() => {});
    if (versionRef.current === savedVersionRef.current) return true;

    const version = versionRef.current;
    setSaveState({ status: 'saving', error: null });
    const request = api.saveWorkingTemplate(job.id, draftRef.current);
    inFlightRef.current = request;
    try {
      const saved = await request;
      if (version === versionRef.current) {
        savedVersionRef.current = version;
        setJob(saved);
        setSaveState({ status: 'saved', error: null });
      }
      return true;
    } catch (error) {
      if (version === versionRef.current) setSaveState({ status: 'error', error });
      return false;
    } finally {
      inFlightRef.current = null;
    }
  }, [job.id, setJob]);

  const update = useCallback((updater) => {
    const next = typeof updater === 'function' ? updater(draftRef.current) : updater;
    draftRef.current = next;
    versionRef.current += 1;
    setDraft(next);
    setSaveState({ status: 'pending', error: null });
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(flush, SAVE_DELAY_MS);
  }, [flush]);

  // Server-side replacements (applying another template, changing sheet) discard local edits.
  const reset = useCallback((nextJob) => {
    clearTimeout(timerRef.current);
    versionRef.current += 1;
    savedVersionRef.current = versionRef.current;
    const next = { template: nextJob.workingTemplate, confirmedIds: nextJob.confirmedIds };
    draftRef.current = next;
    setDraft(next);
    setSaveState({ status: 'saved', error: null });
    setJob(nextJob);
  }, [setJob]);

  // Leaving the page with unsaved edits sends them without waiting.
  const jobIdRef = useRef(job.id);
  useEffect(() => () => {
    clearTimeout(timerRef.current);
    if (versionRef.current !== savedVersionRef.current) api.saveWorkingTemplate(jobIdRef.current, draftRef.current).catch(() => {});
  }, []);

  return { draft, update, flush, reset, saveState };
}

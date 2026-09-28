'use client';

import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'previley.advancedMode';
const EVENT = 'previley:advanced-mode';

function read() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

// Per-browser preference: simple mode (use saved templates) vs advanced mode (edit columns and templates).
export function useAdvancedMode() {
  const [advanced, setAdvanced] = useState(false);

  useEffect(() => {
    setAdvanced(read());
    const sync = () => setAdvanced(read());
    window.addEventListener(EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const update = useCallback((value) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, String(value));
    } catch {
      // Storage unavailable: the preference only lasts for this page.
    }
    setAdvanced(value);
    window.dispatchEvent(new Event(EVENT));
  }, []);

  return [advanced, update];
}

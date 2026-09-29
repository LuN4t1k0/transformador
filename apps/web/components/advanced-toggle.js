'use client';

import { SlidersHorizontal } from 'lucide-react';
import { useAdvancedMode } from '../lib/hooks/use-advanced-mode';

export function AdvancedToggle({ variant = 'compact' }) {
  const [advanced, setAdvanced] = useAdvancedMode();
  const isRail = variant === 'rail';

  return (
    <label
      className={`inline-flex cursor-pointer items-center gap-2 rounded-md text-sm text-ink-700 ${isRail ? 'w-full justify-between py-1' : 'h-9 px-2 hover:bg-ink-50'}`}
      title="Muestra la edición de columnas, filas y plantillas"
    >
      <span className="inline-flex items-center gap-2">
        {isRail ? null : <SlidersHorizontal size={16} className="text-ink-500" aria-hidden="true" />}
        <span className={isRail ? '' : 'sr-only'}>Modo avanzado</span>
      </span>
      <input
        type="checkbox"
        role="switch"
        className="peer sr-only"
        checked={advanced}
        onChange={(event) => setAdvanced(event.target.checked)}
      />
      <span aria-hidden="true" className="relative h-5 w-9 shrink-0 rounded-full bg-ink-200 transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:bg-cobalt-600 peer-checked:after:translate-x-4 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-cobalt-500" />
    </label>
  );
}

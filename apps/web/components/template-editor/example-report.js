'use client';

import { Sparkles } from 'lucide-react';
import { listPacks } from '../../lib/packs.js';
import { Notice } from '../panel';

// What was learned from the destination example and what is left for the assistant or for the user.
export function ExampleReport({ report, assistantAvailable = false }) {
  if (!(report?.mode === 'BY_EXAMPLE' || report?.mode === 'OUTPUT_ONLY')) return null;
  const keyLabels = listPacks().flatMap((pack) => (pack.keys || []).map((key) => key.label));
  const pending = report.unresolved.length + (report.suggested?.length || 0);

  return (
    <Notice tone={pending ? 'warning' : 'success'} icon={Sparkles}>
      <p className="font-semibold">
        De {report.learned + (report.suggested?.length || 0) + report.unresolved.length} columnas: {report.learned} deducidas
        {report.suggested?.length ? `, ${report.suggested.length} sugeridas por nombre` : ''}
        {report.unresolved.length ? `, ${report.unresolved.length} por definir` : ''}.
      </p>
      {report.alignment === 'NONE' && report.mode === 'BY_EXAMPLE' ? (
        <p className="mt-0.5">Los ejemplos no tienen filas en común{keyLabels.length ? ` (por ejemplo, el mismo ${keyLabels.join(' o ')})` : ''}, así que no pudimos comparar fila a fila.</p>
      ) : null}
      {report.suggested?.length ? (
        <p className="mt-0.5">
          <span className="font-medium">Revisa las sugeridas:</span>{' '}
          {report.suggested.map((name) => (report.byName?.[name]?.exceptions ? `${name} (cálculo que no calza en ${report.byName[name].exceptions} ${report.byName[name].exceptions === 1 ? 'fila' : 'filas'} del ejemplo)` : name)).join(', ')}.
        </p>
      ) : null}
      {report.unresolved.length ? <p className="mt-0.5"><span className="font-medium">Por definir:</span> {report.unresolved.join(', ')}.</p> : null}
      {pending ? (
        <p className="mt-0.5">{assistantAvailable ? 'Pídele al asistente (más abajo) que proponga lo que falta, o complétalo a mano en cada columna.' : 'Complétalo a mano en cada columna.'}</p>
      ) : null}
      {report.ignored?.length ? <p className="mt-0.5 text-ink-500">Ignoramos del ejemplo: {report.ignored.join(', ')} (columnas ocultas o vacías).</p> : null}
    </Notice>
  );
}

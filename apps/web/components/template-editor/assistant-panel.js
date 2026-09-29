'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Check, Eye, EyeOff, Loader2, ShieldCheck, Sparkles, X } from 'lucide-react';
import { previewRows } from '@previley-transformer/template-engine/src/rows.js';
import { previewParameters } from '@previley-transformer/template-engine/src/params.js';
import { previewDesign } from '@previley-transformer/template-engine/src/output-design.js';
import { api } from '../../lib/api';
import { describeSource, describeTransformations } from '../../lib/templates';
import { formatCell, reviveSampleRows } from '../../lib/template-editor';
import { maskValue } from '../../lib/preview';
import { buttonStyles, Notice, Panel } from '../panel';
import { FilePreview } from './file-preview';

const EXAMPLES = 'Ej: «El TOTAL es el sueldo más el bono», «Si la AFP es Capital escribe 03», «Separa el RUT en número y dígito verificador».';

// Models sometimes answer with Markdown; the explanation is shown as plain text.
function plainText(text) {
  return text.replace(/\*\*(.+?)\*\*/g, '$1').replace(/^#+\s*/gm, '').replace(/^\s*[*-]\s+/gm, '• ');
}

function percent(rate) {
  return rate === undefined || rate === null ? '—' : `${Math.round(rate * 100)}%`;
}

function describeColumn(column, names) {
  if (!column) return '—';
  return [describeSource(column.source, names), ...describeTransformations(column)].join(' · ');
}

// Current vs proposed, column by column, with how much of the destination example each one reproduces.
function Comparison({ current, result }) {
  const proposal = result.proposal;
  const before = new Map((result.before?.columns || []).map((column) => [column.outputName.toLowerCase(), column]));
  const after = new Map((result.after?.columns || []).map((column) => [column.outputName.toLowerCase(), column]));
  const currentByName = new Map(current.columns.map((column) => [column.outputName.toLowerCase(), column]));
  const names = new Map(proposal.columns.map((column) => [column.id, column.outputName]));
  const currentNames = new Map(current.columns.map((column) => [column.id, column.outputName]));
  const rows = proposal.columns.map((column) => {
    const previous = currentByName.get(column.outputName.toLowerCase());
    const changed = !previous || JSON.stringify([previous.source, previous.transformations]) !== JSON.stringify([column.source, column.transformations]);
    return { column, previous, changed };
  });

  return (
    <div className="overflow-x-auto rounded-lg border border-ink-200">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="bg-ink-50 text-xs text-ink-500">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">Columna</th>
            <th scope="col" className="px-3 py-2 font-medium">Ahora</th>
            <th scope="col" className="px-3 py-2 font-medium">Propuesta</th>
            {result.after ? <th scope="col" className="px-3 py-2 font-medium">Calce con el ejemplo</th> : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {rows.map(({ column, previous, changed }) => {
            const key = column.outputName.toLowerCase();
            return (
              <tr key={column.id} className={changed ? 'bg-cobalt-50/40' : ''}>
                <th scope="row" className="px-3 py-1.5 font-medium text-ink-900">{column.outputName}</th>
                <td className="px-3 py-1.5 text-xs text-ink-500">{describeColumn(previous, currentNames)}</td>
                <td className={`px-3 py-1.5 text-xs ${changed ? 'font-medium text-ink-900' : 'text-ink-500'}`}>{changed ? describeColumn(column, names) : 'Sin cambios'}</td>
                {result.after ? (
                  <td className="whitespace-nowrap px-3 py-1.5 text-xs tabular-nums">
                    <span className="text-ink-400">{percent(before.get(key)?.rate)}</span>
                    <span className="px-1 text-ink-400" aria-hidden="true">→</span>
                    <span className={after.get(key)?.rate === 1 ? 'font-semibold text-mint-600' : 'font-semibold text-amber-700'}>{percent(after.get(key)?.rate)}</span>
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// The template as it would be after applying the proposal (the template's own data stays).
function proposedTemplate(template, proposal) {
  const { rowSteps, ...rest } = template;
  return { ...rest, output: proposal.output, columns: proposal.columns, ...(proposal.rowSteps ? { rowSteps: proposal.rowSteps } : {}) };
}

// The destination example as the user uploaded it, to compare by eye with the proposal. Columns the proposal
// treats as sensitive (e.g. RUT) are masked the same way.
function DestinationExample({ example, columns }) {
  const rows = reviveSampleRows(example.rows).slice(0, 5);
  const byName = new Map(columns.map((column) => [column.outputName.toLowerCase(), column]));
  return (
    <div className="overflow-x-auto rounded-lg border border-ink-200">
      <table className="w-full text-left text-sm">
        <thead className="bg-ink-50 text-xs text-ink-500">
          <tr>{example.headers.map((header) => <th key={header} scope="col" className="whitespace-nowrap px-3 py-2 font-medium">{header}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {rows.map((row, index) => (
            <tr key={index}>
              {example.headers.map((header) => {
                const column = byName.get(header.toLowerCase());
                const text = formatCell(row.values[header]);
                return <td key={header} className="whitespace-nowrap px-3 py-1.5 text-ink-900">{(column ? maskValue(column, text) : text) || <span className="text-ink-300">—</span>}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// What the file would look like with the proposal, next to the destination example, before applying anything.
function ProposalPreview({ template, proposal, sample, outputExample }) {
  const proposed = useMemo(() => proposedTemplate(template, proposal), [template, proposal]);
  const preview = useMemo(() => {
    try {
      const params = previewParameters(proposed.parameters || []);
      const rows = previewRows(sample.rows, proposed, new Date(), params);
      return { ...rows, design: previewDesign(proposed, rows.results, { inputName: (sample.fileName || '').replace(/\.xlsx$/i, ''), sheet: sample.sheet, now: new Date(), params }) };
    } catch {
      return null;
    }
  }, [proposed, sample]);

  return (
    <div className="space-y-4 rounded-lg border border-cobalt-200 bg-cobalt-50/30 p-3">
      <div>
        <h3 className="mb-2 text-sm font-semibold text-ink-900">Así quedaría tu archivo con la propuesta</h3>
        {preview ? <FilePreview template={proposed} results={preview.results} sampleCount={sample.rows.length} design={preview.design} /> : <p className="text-sm text-rose-700">No se pudo generar la vista previa de esta propuesta.</p>}
      </div>
      {outputExample ? (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-ink-900">Tu ejemplo de destino <span className="font-normal text-ink-500">(primeras filas de «{outputExample.fileName}»)</span></h3>
          <DestinationExample example={outputExample} columns={proposed.columns} />
          <p className="mt-1 text-xs text-ink-500">Compara formatos y columnas: si las personas son distintas, los valores no tienen por qué coincidir.</p>
        </div>
      ) : null}
    </div>
  );
}

// Asks the AI assistant for a template proposal based on the examples and the user's instructions. Nothing is
// applied until the user reviews the proposal.
export function AssistantPanel({ template, sample, outputExample, onApply }) {
  const [status, setStatus] = useState(null);
  const [instruction, setInstruction] = useState('');
  const [state, setState] = useState({ loading: false, error: '', result: null });
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    api.getAssistantStatus().then(setStatus).catch(() => setStatus({ enabled: false }));
  }, []);

  if (!status?.enabled || !sample?.exampleRows) return null;

  async function ask() {
    setState({ loading: true, error: '', result: null });
    setShowPreview(false);
    try {
      const result = await api.proposeTemplate({
        template,
        input: { headers: sample.headers, rows: sample.exampleRows },
        output: outputExample ? { headers: outputExample.headers, rows: outputExample.rows } : null,
        instruction
      });
      setState({ loading: false, error: result.proposal ? '' : 'El asistente no logró una propuesta válida. Prueba con instrucciones más concretas.', result: result.proposal ? result : null });
    } catch (error) {
      setState({ loading: false, error: error.message, result: null });
    }
  }

  const { result } = state;

  return (
    <Panel
      title={<span className="inline-flex items-center gap-2"><Sparkles size={16} className="text-cobalt-600" aria-hidden="true" />Asistente</span>}
      description={outputExample ? 'Propone o corrige la plantilla comparando tus dos archivos, y sigue tus instrucciones. Tú revisas y decides si la aplicas.' : 'Ajusta la plantilla según tus instrucciones. Con un ejemplo de destino además comprueba cada columna fila a fila.'}
    >
      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-500" htmlFor="assistant-instruction">Instrucciones (opcional)</label>
          <textarea id="assistant-instruction" rows={2} maxLength={2000} className="w-full rounded-md border border-ink-200 px-2 py-1.5 text-sm" placeholder={EXAMPLES} value={instruction} onChange={(event) => setInstruction(event.target.value)} />
        </div>
        <p className="flex items-start gap-1.5 text-xs text-ink-500">
          <ShieldCheck size={14} className="mt-0.5 shrink-0 text-mint-600" aria-hidden="true" />
          Se envían a la IA los encabezados y hasta {status.maxRows} filas de cada archivo. Nombres, RUT y otros datos personales se reemplazan por valores ficticios; montos, fechas y valores que se repiten (como la AFP) se envían tal cual. Tus archivos completos no salen del sistema.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className={buttonStyles.primary} disabled={state.loading} onClick={ask}>
            {state.loading ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Sparkles size={16} aria-hidden="true" />}
            {state.loading ? 'El asistente está trabajando…' : result ? 'Pedir otra propuesta' : 'Pedir propuesta'}
          </button>
          {state.loading ? <span className="text-xs text-ink-500">Puede tardar hasta un minuto.</span> : null}
        </div>

        {state.error ? <Notice tone="danger" icon={AlertCircle} role="alert">{state.error}</Notice> : null}

        {result ? (
          <div className="space-y-3 border-t border-ink-100 pt-3" aria-live="polite">
            {result.after ? (
              <p className="text-sm font-semibold text-ink-900">
                Calce con tu ejemplo: {percent(result.before?.overall)} → {percent(result.after.overall)}
              </p>
            ) : outputExample ? (
              <Notice tone="warning" icon={AlertCircle}>
                Tus dos archivos no tienen filas en común (por ejemplo, las mismas personas por su RUT), así que el asistente no pudo comprobar la propuesta fila a fila. Revísala en la vista previa antes de guardarla, o usa ejemplos que incluyan las mismas personas.
              </Notice>
            ) : null}
            {result.explanation ? <p className="whitespace-pre-line text-sm text-ink-700">{plainText(result.explanation)}</p> : null}
            <Comparison current={template} result={result} />
            {showPreview ? <ProposalPreview template={template} proposal={result.proposal} sample={sample} outputExample={outputExample} /> : null}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-ink-400">{result.model ? `${result.model} · ` : ''}{result.turns} {result.turns === 1 ? 'ronda' : 'rondas'}</span>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={buttonStyles.secondary} aria-expanded={showPreview} onClick={() => setShowPreview(!showPreview)}>
                  {showPreview ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
                  {showPreview ? 'Ocultar vista previa' : 'Previsualizar'}
                </button>
                <button type="button" className={buttonStyles.secondary} onClick={() => setState({ loading: false, error: '', result: null })}>
                  <X size={16} aria-hidden="true" />
                  Descartar
                </button>
                <button
                  type="button"
                  className={buttonStyles.primary}
                  onClick={() => {
                    onApply(result.proposal);
                    setState({ loading: false, error: '', result: null });
                  }}
                >
                  <Check size={16} aria-hidden="true" />
                  Aplicar propuesta
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </Panel>
  );
}

'use client';

import { useState } from 'react';
import { ClipboardPaste, Plus, X } from 'lucide-react';
import { OperandPicker, pickerInputClass } from './operand-picker';

const labelClass = 'mb-1 block text-xs font-medium text-ink-500';
const removeButton = 'flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-ink-200 text-ink-500 hover:bg-ink-50 disabled:opacity-40';
const addButton = 'inline-flex h-9 items-center gap-1 rounded-md border border-ink-200 px-2 text-sm font-medium text-ink-700 hover:bg-ink-50 disabled:opacity-40';

export const CONDITION_OPERATORS = [
  { value: 'EQ', label: 'es igual a' },
  { value: 'NEQ', label: 'es distinto de' },
  { value: 'GT', label: 'es mayor que' },
  { value: 'GTE', label: 'es mayor o igual que' },
  { value: 'LT', label: 'es menor que' },
  { value: 'LTE', label: 'es menor o igual que' },
  { value: 'CONTAINS', label: 'contiene' },
  { value: 'STARTS_WITH', label: 'empieza con' },
  { value: 'ENDS_WITH', label: 'termina con' },
  { value: 'IN', label: 'es uno de (separados por coma)' },
  { value: 'EMPTY', label: 'está vacío' },
  { value: 'NOT_EMPTY', label: 'no está vacío' }
];

export const DATE_OPERATIONS = [
  { value: 'DAYS_BETWEEN', label: 'Días entre dos fechas', operands: ['Desde', 'Hasta'] },
  { value: 'ADD_DAYS', label: 'Sumar días a una fecha', operands: ['Fecha', 'Días'] },
  { value: 'ADD_MONTHS', label: 'Sumar meses a una fecha', operands: ['Fecha', 'Meses'] },
  { value: 'YEAR', label: 'Año de una fecha', operands: ['Fecha'] },
  { value: 'MONTH', label: 'Mes de una fecha', operands: ['Fecha'] },
  { value: 'DAY', label: 'Día de una fecha', operands: ['Fecha'] },
  { value: 'START_OF_MONTH', label: 'Primer día del mes', operands: ['Fecha'] },
  { value: 'END_OF_MONTH', label: 'Último día del mes', operands: ['Fecha'] },
  { value: 'TODAY', label: 'Fecha de proceso (hoy)', operands: [] }
];

function firstOperand(headers) {
  return headers?.length ? { type: 'COLUMN', column: headers[0] } : { type: 'TEXT', value: '' };
}

export function defaultRule(type, headers) {
  const first = firstOperand(headers);
  if (type === 'CASE') return { type, cases: [{ match: 'ALL', conditions: [{ left: first, op: 'EQ', right: { type: 'TEXT', value: '' } }], result: { type: 'TEXT', value: '' } }], otherwise: { type: 'EMPTY' } };
  if (type === 'MAP') return { type, input: first, entries: [{ from: '', to: '' }], otherwise: { mode: 'KEEP' } };
  if (type === 'COALESCE') return { type, operands: [first, { type: 'TEXT', value: '' }] };
  if (type === 'TEMPLATE') return { type, text: headers?.length ? `{${headers[0]}}` : '' };
  if (type === 'DATE_CALC') return { type, op: 'DAYS_BETWEEN', operands: [first, first] };
  if (type === 'ROW_NUMBER') return { type, start: 1 };
  return null;
}

// Si / entonces / si no, with several branches.
export function CaseEditor({ idPrefix, source, headers, suggestions, outputColumns, onChange }) {
  const pickerProps = { headers, suggestions, outputColumns, allowText: true };
  const setCase = (index, changes) => onChange({ ...source, cases: source.cases.map((branch, position) => (position === index ? { ...branch, ...changes } : branch)) });
  const setCondition = (caseIndex, conditionIndex, changes) => setCase(caseIndex, {
    conditions: source.cases[caseIndex].conditions.map((condition, position) => (position === conditionIndex ? { ...condition, ...changes } : condition))
  });

  return (
    <div className="space-y-3">
      {source.cases.map((branch, caseIndex) => (
        <div key={caseIndex} className="space-y-2 rounded-lg border border-ink-200 bg-ink-50/60 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-semibold text-ink-900">{caseIndex === 0 ? 'Si' : 'Si no, si'}</span>
            {branch.conditions.length > 1 ? (
              <select aria-label="Tipo de coincidencia" className="h-8 rounded-md border border-ink-200 bg-white px-2 text-xs" value={branch.match} onChange={(event) => setCase(caseIndex, { match: event.target.value })}>
                <option value="ALL">se cumplen todas las condiciones</option>
                <option value="ANY">se cumple alguna condición</option>
              </select>
            ) : null}
            <button type="button" className="text-xs text-ink-500 hover:text-rose-700" onClick={() => onChange({ ...source, cases: source.cases.filter((_, position) => position !== caseIndex) })}>Quitar caso</button>
          </div>
          {branch.conditions.map((condition, conditionIndex) => (
            <div key={conditionIndex} className="flex flex-wrap items-center gap-2">
              <OperandPicker id={`${idPrefix}-c${caseIndex}-${conditionIndex}-l`} label="Valor a revisar" operand={condition.left} {...pickerProps} onChange={(left) => setCondition(caseIndex, conditionIndex, { left })} />
              <select aria-label="Condición" className="h-9 rounded-md border border-ink-200 bg-white px-2 text-sm" value={condition.op} onChange={(event) => setCondition(caseIndex, conditionIndex, { op: event.target.value, right: condition.right || { type: 'TEXT', value: '' } })}>
                {CONDITION_OPERATORS.map((operator) => <option key={operator.value} value={operator.value}>{operator.label}</option>)}
              </select>
              {!['EMPTY', 'NOT_EMPTY'].includes(condition.op) ? (
                <OperandPicker id={`${idPrefix}-c${caseIndex}-${conditionIndex}-r`} label="Comparar con" operand={condition.right} {...pickerProps} onChange={(right) => setCondition(caseIndex, conditionIndex, { right })} />
              ) : null}
              <button type="button" aria-label="Quitar condición" className={removeButton} disabled={branch.conditions.length === 1} onClick={() => setCase(caseIndex, { conditions: branch.conditions.filter((_, position) => position !== conditionIndex) })}>
                <X size={15} aria-hidden="true" />
              </button>
            </div>
          ))}
          <button type="button" className={addButton} disabled={branch.conditions.length >= 5} onClick={() => setCase(caseIndex, { conditions: [...branch.conditions, { left: firstOperand(headers), op: 'EQ', right: { type: 'TEXT', value: '' } }] })}>
            <Plus size={15} aria-hidden="true" />
            Otra condición
          </button>
          <div className="flex flex-wrap items-center gap-2 border-t border-ink-200 pt-2">
            <span className="text-sm font-semibold text-ink-900">entonces</span>
            <OperandPicker id={`${idPrefix}-c${caseIndex}-result`} label="Resultado" operand={branch.result} {...pickerProps} allowEmpty emptyLabel="Dejar vacía" onChange={(result) => setCase(caseIndex, { result })} />
          </div>
        </div>
      ))}
      <button type="button" className={addButton} disabled={source.cases.length >= 20} onClick={() => onChange({ ...source, cases: [...source.cases, defaultRule('CASE', headers).cases[0]] })}>
        <Plus size={15} aria-hidden="true" />
        Agregar caso
      </button>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-ink-900">Si no se cumple ningún caso</span>
        <OperandPicker id={`${idPrefix}-otherwise`} label="Valor por defecto" operand={source.otherwise} {...pickerProps} allowEmpty emptyLabel="Dejar vacía" onChange={(otherwise) => onChange({ ...source, otherwise })} />
      </div>
    </div>
  );
}

// Translates values with a two-column table; supports pasting two columns copied from Excel.
export function MapEditor({ idPrefix, source, headers, suggestions, outputColumns, onChange }) {
  const [pasting, setPasting] = useState(false);
  const [pasted, setPasted] = useState('');
  const setEntry = (index, changes) => onChange({ ...source, entries: source.entries.map((entry, position) => (position === index ? { ...entry, ...changes } : entry)) });

  function applyPaste() {
    const entries = pasted.split(/\r?\n/).map((line) => line.split('\t')).filter((parts) => parts[0]?.trim()).map(([from, to = '']) => ({ from: from.trim(), to: to.trim() }));
    if (entries.length) onChange({ ...source, entries: [...source.entries.filter((entry) => entry.from.trim()), ...entries] });
    setPasting(false);
    setPasted('');
  }

  return (
    <div className="space-y-3">
      <div>
        <label className={labelClass} htmlFor={`${idPrefix}-map-input`}>Valor a traducir</label>
        <OperandPicker id={`${idPrefix}-map-input`} operand={source.input} headers={headers} suggestions={suggestions} outputColumns={outputColumns} onChange={(input) => onChange({ ...source, input })} />
      </div>
      <div className="overflow-hidden rounded-lg border border-ink-200">
        <div className="grid grid-cols-[1fr_1fr_40px] gap-2 bg-ink-50 px-2 py-1.5 text-xs font-medium text-ink-500">
          <span>Si el valor es</span><span>Escribir</span><span />
        </div>
        <div className="max-h-72 space-y-1 overflow-y-auto p-2">
          {source.entries.map((entry, index) => (
            <div key={index} className="grid grid-cols-[1fr_1fr_40px] gap-2">
              <input aria-label={`Valor original ${index + 1}`} className={pickerInputClass} value={entry.from} onChange={(event) => setEntry(index, { from: event.target.value })} />
              <input aria-label={`Valor nuevo ${index + 1}`} className={pickerInputClass} value={entry.to} onChange={(event) => setEntry(index, { to: event.target.value })} />
              <button type="button" aria-label={`Quitar fila ${index + 1}`} className={removeButton} onClick={() => onChange({ ...source, entries: source.entries.filter((_, position) => position !== index) })}>
                <X size={15} aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={addButton} onClick={() => onChange({ ...source, entries: [...source.entries, { from: '', to: '' }] })}>
          <Plus size={15} aria-hidden="true" />
          Agregar fila
        </button>
        <button type="button" className={addButton} onClick={() => setPasting(!pasting)}>
          <ClipboardPaste size={15} aria-hidden="true" />
          Pegar desde Excel
        </button>
      </div>
      {pasting ? (
        <div className="space-y-2">
          <label className={labelClass} htmlFor={`${idPrefix}-map-paste`}>Copia dos columnas en Excel (valor original y valor nuevo) y pégalas aquí</label>
          <textarea id={`${idPrefix}-map-paste`} rows={5} className="w-full rounded-md border border-ink-200 p-2 font-mono text-xs" value={pasted} onChange={(event) => setPasted(event.target.value)} />
          <button type="button" className={addButton} onClick={applyPaste}>Agregar filas pegadas</button>
        </div>
      ) : null}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className={labelClass} htmlFor={`${idPrefix}-map-otherwise`}>Si el valor no está en la tabla</label>
          <select
            id={`${idPrefix}-map-otherwise`}
            className="h-9 rounded-md border border-ink-200 bg-white px-2 text-sm"
            value={source.otherwise?.mode || 'KEEP'}
            onChange={(event) => onChange({ ...source, otherwise: event.target.value === 'TEXT' ? { mode: 'TEXT', value: '' } : { mode: event.target.value } })}
          >
            <option value="KEEP">Dejar el valor original</option>
            <option value="EMPTY">Dejar vacía</option>
            <option value="TEXT">Escribir un texto</option>
          </select>
        </div>
        {source.otherwise?.mode === 'TEXT' ? (
          <input aria-label="Texto por defecto" className="h-9 w-48 rounded-md border border-ink-200 px-2 text-sm" value={source.otherwise.value} onChange={(event) => onChange({ ...source, otherwise: { mode: 'TEXT', value: event.target.value } })} />
        ) : null}
        <label className="inline-flex items-center gap-2 pb-2 text-sm text-ink-700">
          <input type="checkbox" className="h-4 w-4 accent-cobalt-600" checked={source.matchCase === true} onChange={(event) => onChange({ ...source, matchCase: event.target.checked || undefined })} />
          Distinguir mayúsculas y tildes
        </label>
      </div>
    </div>
  );
}

export function CoalesceEditor({ idPrefix, source, headers, suggestions, outputColumns, onChange }) {
  return (
    <div className="space-y-2">
      <p className="text-xs text-ink-500">Se usa el primero que tenga valor, en este orden.</p>
      {source.operands.map((operand, index) => (
        <div key={index} className="flex items-center gap-2">
          <span className="w-5 shrink-0 text-right text-xs tabular-nums text-ink-400">{index + 1}</span>
          <OperandPicker id={`${idPrefix}-coalesce-${index}`} operand={operand} headers={headers} suggestions={suggestions} outputColumns={outputColumns} allowText onChange={(next) => onChange({ ...source, operands: source.operands.map((current, position) => (position === index ? next : current)) })} />
          <button type="button" aria-label={`Quitar opción ${index + 1}`} className={removeButton} disabled={source.operands.length <= 2} onClick={() => onChange({ ...source, operands: source.operands.filter((_, position) => position !== index) })}>
            <X size={15} aria-hidden="true" />
          </button>
        </div>
      ))}
      <button type="button" className={addButton} disabled={source.operands.length >= 10} onClick={() => onChange({ ...source, operands: [...source.operands, firstOperand(headers)] })}>
        <Plus size={15} aria-hidden="true" />
        Otra opción
      </button>
    </div>
  );
}

export function TemplateTextEditor({ idPrefix, source, headers, suggestions, outputColumns, onChange }) {
  const fileColumns = headers || suggestions;
  const insert = (token) => onChange({ ...source, text: `${source.text}${token}` });

  return (
    <div className="space-y-2">
      <label className={labelClass} htmlFor={`${idPrefix}-template`}>Texto (las variables van entre llaves)</label>
      <input id={`${idPrefix}-template`} className={`${pickerInputClass} font-mono`} value={source.text} placeholder="{Nombre} {Apellido} - {Código}" onChange={(event) => onChange({ ...source, text: event.target.value })} />
      <div className="flex flex-wrap gap-2">
        <select aria-label="Insertar columna del Excel" className="h-8 rounded-md border border-ink-200 bg-white px-2 text-xs" value="" onChange={(event) => event.target.value && insert(`{${event.target.value}}`)}>
          <option value="">+ Columna del Excel</option>
          {fileColumns.map((header) => <option key={header} value={header}>{header}</option>)}
        </select>
        {outputColumns.length ? (
          <select aria-label="Insertar columna de la plantilla" className="h-8 rounded-md border border-ink-200 bg-white px-2 text-xs" value="" onChange={(event) => event.target.value && insert(`{@${event.target.value}}`)}>
            <option value="">+ Columna anterior de la plantilla</option>
            {outputColumns.map((column) => <option key={column.id} value={column.outputName}>{column.outputName}</option>)}
          </select>
        ) : null}
      </div>
    </div>
  );
}

export function DateCalcEditor({ idPrefix, source, headers, suggestions, outputColumns, onChange }) {
  const operation = DATE_OPERATIONS.find((candidate) => candidate.value === source.op) || DATE_OPERATIONS[0];

  function changeOperation(op) {
    const next = DATE_OPERATIONS.find((candidate) => candidate.value === op);
    const operands = next.operands.map((label, index) => source.operands[index] || (label === 'Días' || label === 'Meses' ? { type: 'NUMBER', value: 1 } : firstOperand(headers)));
    onChange({ type: 'DATE_CALC', op, operands, ...(op === 'DAYS_BETWEEN' && source.inclusive ? { inclusive: true } : {}) });
  }

  return (
    <div className="space-y-2">
      <div className="max-w-xs">
        <label className={labelClass} htmlFor={`${idPrefix}-date-op`}>Operación</label>
        <select id={`${idPrefix}-date-op`} className={pickerInputClass} value={source.op} onChange={(event) => changeOperation(event.target.value)}>
          {DATE_OPERATIONS.map((candidate) => <option key={candidate.value} value={candidate.value}>{candidate.label}</option>)}
        </select>
      </div>
      {operation.operands.map((label, index) => (
        <div key={label} className="flex items-center gap-2">
          <span className="w-16 shrink-0 text-xs text-ink-500">{label}</span>
          <OperandPicker id={`${idPrefix}-date-${index}`} label={label} operand={source.operands[index]} headers={headers} suggestions={suggestions} outputColumns={outputColumns} allowText onChange={(next) => onChange({ ...source, operands: source.operands.map((current, position) => (position === index ? next : current)) })} />
        </div>
      ))}
      {source.op === 'DAYS_BETWEEN' ? (
        <label className="inline-flex items-center gap-2 text-sm text-ink-700">
          <input type="checkbox" className="h-4 w-4 accent-cobalt-600" checked={source.inclusive === true} onChange={(event) => onChange({ ...source, inclusive: event.target.checked || undefined })} />
          Contar ambos días (del 1 al 3 son 3 días)
        </label>
      ) : null}
      {!['DAYS_BETWEEN', 'YEAR', 'MONTH', 'DAY'].includes(source.op) ? <p className="text-xs text-ink-500">El resultado es una fecha: elige cómo escribirla en «Formato».</p> : null}
    </div>
  );
}

export function RowNumberEditor({ idPrefix, source, onChange }) {
  return (
    <div className="max-w-xs">
      <label className={labelClass} htmlFor={`${idPrefix}-row-start`}>Empieza en</label>
      <input
        id={`${idPrefix}-row-start`}
        type="number"
        min={0}
        className={pickerInputClass}
        value={source.start ?? 1}
        onChange={(event) => onChange({ ...source, start: Math.max(0, Number(event.target.value) || 0) })}
      />
      <p className="mt-1 text-xs text-ink-500">Numera las filas del archivo final en orden: 1, 2, 3…</p>
    </div>
  );
}

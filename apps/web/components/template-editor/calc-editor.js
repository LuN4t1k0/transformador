'use client';

import { Plus, X } from 'lucide-react';
import { inputClass } from './source-editor';

const labelClass = 'mb-1 block text-xs font-medium text-ink-500';

export const CALC_OPERATIONS = [
  { value: 'PERCENT', label: 'Porcentaje de' },
  { value: 'SUM', label: 'Suma' },
  { value: 'SUBTRACT', label: 'Resta' },
  { value: 'MULTIPLY', label: 'Multiplicación' },
  { value: 'DIVIDE', label: 'División' },
  { value: 'AVERAGE', label: 'Promedio' }
];

const ROUNDING = [
  { value: 'ROUND:0', label: 'Redondear a entero' },
  { value: 'ROUND:1', label: 'Redondear a 1 decimal' },
  { value: 'ROUND:2', label: 'Redondear a 2 decimales' },
  { value: 'FLOOR:0', label: 'Truncar a entero (hacia abajo)' },
  { value: 'CEIL:0', label: 'Redondear hacia arriba' },
  { value: 'NONE', label: 'Sin redondear' }
];

export function defaultCalc(column) {
  return { type: 'CALC', op: 'PERCENT', value: 10, operands: [column ? { type: 'COLUMN', column } : { type: 'NUMBER', value: 0 }], round: { mode: 'ROUND', decimals: 0 } };
}

function encode(operand) {
  if (operand.type === 'OUTPUT') return `out:${operand.columnId}`;
  if (operand.type === 'COLUMN') return `col:${operand.column}`;
  return 'num';
}

function decode(value, previous) {
  if (value.startsWith('out:')) return { type: 'OUTPUT', columnId: value.slice(4) };
  if (value.startsWith('col:')) return { type: 'COLUMN', column: value.slice(4) };
  return { type: 'NUMBER', value: previous?.type === 'NUMBER' ? previous.value : 0 };
}

function OperandPicker({ id, operand, headers, suggestions, outputColumns, onChange }) {
  const fileColumns = headers || suggestions;
  const current = encode(operand);
  const known = current === 'num' || fileColumns.includes(operand.column) || outputColumns.some((column) => column.id === operand.columnId);

  return (
    <div className="flex min-w-0 flex-1 gap-2">
      <select id={id} aria-label="Valor del cálculo" className={`${inputClass} flex-1`} value={current} onChange={(event) => onChange(decode(event.target.value, operand))}>
        {!known ? <option value={current}>{operand.column || operand.columnId} (no disponible)</option> : null}
        {outputColumns.length ? (
          <optgroup label="Columnas anteriores de esta plantilla">
            {outputColumns.map((column) => <option key={column.id} value={`out:${column.id}`}>{column.outputName}</option>)}
          </optgroup>
        ) : null}
        {fileColumns.length ? (
          <optgroup label="Columnas del Excel">
            {fileColumns.map((header) => <option key={header} value={`col:${header}`}>{header}</option>)}
          </optgroup>
        ) : null}
        <option value="num">Un número…</option>
      </select>
      {operand.type === 'NUMBER' ? (
        <input
          aria-label="Número"
          inputMode="decimal"
          className="h-9 w-28 shrink-0 rounded-md border border-ink-200 bg-white px-2 text-sm text-ink-900"
          defaultValue={String(operand.value).replace('.', ',')}
          onBlur={(event) => {
            const number = Number(event.target.value.trim().replace(/\./g, '').replace(',', '.'));
            if (Number.isFinite(number)) onChange({ type: 'NUMBER', value: number });
          }}
        />
      ) : null}
    </div>
  );
}

// Structured calculation editor: no free-form formulas, only whitelisted operations over columns and numbers.
export function CalcEditor({ idPrefix, source, headers, suggestions = [], outputColumns = [], onChange }) {
  const set = (changes) => onChange({ ...source, ...changes });
  const setOperand = (index, operand) => set({ operands: source.operands.map((current, position) => (position === index ? operand : current)) });
  const rounding = source.round?.mode === 'NONE' ? 'NONE' : `${source.round?.mode || 'ROUND'}:${source.round?.decimals ?? 0}`;

  function changeOperation(op) {
    if (op === 'PERCENT') set({ op, value: source.value ?? 10, operands: [source.operands[0]] });
    else set({ op, value: undefined, operands: source.operands.length >= 2 ? source.operands : [...source.operands, { type: 'NUMBER', value: 0 }] });
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[200px_minmax(0,1fr)]">
        <div>
          <label className={labelClass} htmlFor={`${idPrefix}-calc-op`}>Operación</label>
          <select id={`${idPrefix}-calc-op`} className={inputClass} value={source.op} onChange={(event) => changeOperation(event.target.value)}>
            {CALC_OPERATIONS.map((operation) => <option key={operation.value} value={operation.value}>{operation.label}</option>)}
          </select>
        </div>

        {source.op === 'PERCENT' ? (
          <div>
            <label className={labelClass} htmlFor={`${idPrefix}-calc-0`}>Porcentaje</label>
            <div className="flex flex-wrap items-center gap-2">
              <input
                aria-label="Porcentaje"
                inputMode="decimal"
                className="h-9 w-24 rounded-md border border-ink-200 bg-white px-2 text-sm text-ink-900"
                defaultValue={String(source.value ?? '').replace('.', ',')}
                onBlur={(event) => {
                  const number = Number(event.target.value.trim().replace(',', '.'));
                  if (Number.isFinite(number)) set({ value: number });
                }}
              />
              <span className="text-sm text-ink-700">% de</span>
              <OperandPicker id={`${idPrefix}-calc-0`} operand={source.operands[0]} headers={headers} suggestions={suggestions} outputColumns={outputColumns} onChange={(operand) => setOperand(0, operand)} />
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {source.operands.map((operand, index) => (
              <div key={index} className="flex items-center gap-2">
                <span className="w-5 shrink-0 text-center text-sm font-semibold text-ink-500" aria-hidden="true">
                  {index === 0 ? '' : { SUM: '+', SUBTRACT: '−', MULTIPLY: '×', DIVIDE: '÷', AVERAGE: '·' }[source.op]}
                </span>
                <OperandPicker id={`${idPrefix}-calc-${index}`} operand={operand} headers={headers} suggestions={suggestions} outputColumns={outputColumns} onChange={(next) => setOperand(index, next)} />
                <button
                  type="button"
                  aria-label={`Quitar valor ${index + 1}`}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-ink-200 text-ink-500 hover:bg-ink-50 disabled:opacity-40"
                  disabled={source.operands.length <= 2}
                  onClick={() => set({ operands: source.operands.filter((_, position) => position !== index) })}
                >
                  <X size={15} aria-hidden="true" />
                </button>
              </div>
            ))}
            <button
              type="button"
              className="inline-flex h-9 items-center gap-1 rounded-md border border-ink-200 px-2 text-sm font-medium text-ink-700 hover:bg-ink-50 disabled:opacity-40"
              disabled={source.operands.length >= 10}
              onClick={() => set({ operands: [...source.operands, { type: 'NUMBER', value: 0 }] })}
            >
              <Plus size={15} aria-hidden="true" />
              Agregar valor
            </button>
          </div>
        )}
      </div>

      <div className="max-w-xs">
        <label className={labelClass} htmlFor={`${idPrefix}-calc-round`}>Resultado</label>
        <select
          id={`${idPrefix}-calc-round`}
          className={inputClass}
          value={rounding}
          onChange={(event) => {
            const [mode, decimals] = event.target.value.split(':');
            set({ round: mode === 'NONE' ? { mode } : { mode, decimals: Number(decimals) } });
          }}
        >
          {ROUNDING.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </div>
    </div>
  );
}

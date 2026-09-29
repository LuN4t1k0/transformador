'use client';

import { useTemplateParameters } from './parameters-context';

export const pickerInputClass = 'h-9 w-full min-w-0 rounded-md border border-ink-200 bg-white px-2 text-sm text-ink-900';
const smallInputClass = 'h-9 shrink-0 rounded-md border border-ink-200 bg-white px-2 text-sm text-ink-900';

function encode(operand) {
  if (!operand || operand.type === 'EMPTY') return 'empty';
  if (operand.type === 'PARAM') return `param:${operand.paramId}`;
  if (operand.type === 'OUTPUT') return `out:${operand.columnId}`;
  if (operand.type === 'COLUMN') return `col:${operand.column}`;
  if (operand.type === 'TEXT') return 'txt';
  return 'num';
}

function decode(value, previous) {
  if (value === 'empty') return { type: 'EMPTY' };
  if (value.startsWith('param:')) return { type: 'PARAM', paramId: value.slice(6) };
  if (value.startsWith('out:')) return { type: 'OUTPUT', columnId: value.slice(4) };
  if (value.startsWith('col:')) return { type: 'COLUMN', column: value.slice(4) };
  if (value === 'txt') return { type: 'TEXT', value: previous?.type === 'TEXT' ? previous.value : '' };
  return { type: 'NUMBER', value: previous?.type === 'NUMBER' ? previous.value : 0 };
}

// Picks the value a function uses: an earlier column of the template, a file column, a number or a text.
export function OperandPicker({ id, label = 'Valor', operand, headers, suggestions = [], outputColumns = [], outputLabel = 'Columnas anteriores de esta plantilla', allowText = false, allowEmpty = false, emptyLabel = 'Vacío', onChange }) {
  const parameters = useTemplateParameters();
  const fileColumns = headers || suggestions;
  const current = encode(operand);
  // Without a test Excel there is no header list to check against, so file columns are shown as written.
  const known = ['num', 'txt', 'empty'].includes(current)
    || fileColumns.includes(operand?.column)
    || outputColumns.some((column) => column.id === operand?.columnId)
    || parameters.some((parameter) => parameter.id === operand?.paramId);

  return (
    <div className="flex min-w-0 flex-1 gap-2">
      <select id={id} aria-label={label} className={`${pickerInputClass} flex-1`} value={current} onChange={(event) => onChange(decode(event.target.value, operand))}>
        {!known ? <option value={current}>{operand?.column || operand?.columnId || operand?.paramId}{headers || operand?.type !== 'COLUMN' ? ' (no disponible)' : ''}</option> : null}
        {allowEmpty ? <option value="empty">{emptyLabel}</option> : null}
        {outputColumns.length ? (
          <optgroup label={outputLabel}>
            {outputColumns.map((column) => <option key={column.id} value={`out:${column.id}`}>{column.outputName}</option>)}
          </optgroup>
        ) : null}
        {fileColumns.length ? (
          <optgroup label="Columnas del Excel">
            {fileColumns.map((header) => <option key={header} value={`col:${header}`}>{header}</option>)}
          </optgroup>
        ) : null}
        {parameters.length ? (
          <optgroup label="Parámetros (se piden al generar)">
            {parameters.map((parameter) => <option key={parameter.id} value={`param:${parameter.id}`}>{parameter.name}</option>)}
          </optgroup>
        ) : null}
        <optgroup label="Escribir">
          {allowText ? <option value="txt">Un texto…</option> : null}
          <option value="num">Un número…</option>
        </optgroup>
      </select>
      {operand?.type === 'NUMBER' ? (
        <input
          key={`num-${id}`}
          aria-label={`${label}: número`}
          inputMode="decimal"
          className={`${smallInputClass} w-28`}
          defaultValue={String(operand.value).replace('.', ',')}
          onBlur={(event) => {
            const number = Number(event.target.value.trim().replace(/\./g, '').replace(',', '.'));
            if (Number.isFinite(number)) onChange({ type: 'NUMBER', value: number });
          }}
        />
      ) : null}
      {operand?.type === 'TEXT' ? (
        <input
          key={`txt-${id}`}
          aria-label={`${label}: texto`}
          className={`${smallInputClass} w-40`}
          defaultValue={operand.value}
          onBlur={(event) => onChange({ type: 'TEXT', value: event.target.value })}
        />
      ) : null}
    </div>
  );
}

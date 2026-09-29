'use client';

import { Plus, X } from 'lucide-react';
import { inputClass } from './source-editor';

const TYPES = [
  { value: 'TEXT', label: 'Texto' },
  { value: 'NUMBER', label: 'Número' },
  { value: 'DATE', label: 'Fecha' }
];

const PLACEHOLDERS = { TEXT: 'Ej: 202405', NUMBER: 'Ej: 10,5', DATE: 'Ej: 31-05-2024' };

function newId(parameters) {
  const ids = new Set(parameters.map((parameter) => parameter.id));
  let n = parameters.length + 1;
  while (ids.has(`param_${n}`)) n += 1;
  return `param_${n}`;
}

function newName(parameters) {
  const names = new Set(parameters.map((parameter) => parameter.name.toLowerCase()));
  let n = parameters.length + 1;
  while (names.has(`parámetro ${n}`)) n += 1;
  return `Parámetro ${n}`;
}

// Values asked for when generating (a period, a company code, a cut-off date…). The default value is also
// what the preview uses.
export function ParametersEditor({ parameters = [], onChange }) {
  const set = (index, changes) => onChange(parameters.map((parameter, position) => (position === index ? { ...parameter, ...changes } : parameter)));

  return (
    <div className="space-y-3">
      {parameters.length ? (
        <div className="space-y-2">
          {parameters.map((parameter, index) => (
            <div key={parameter.id} className="grid gap-2 rounded-md border border-ink-200 p-2 sm:grid-cols-[minmax(0,1fr)_120px_minmax(0,1fr)_auto_auto] sm:items-center">
              <input aria-label={`Nombre del parámetro ${index + 1}`} maxLength={60} className={inputClass} value={parameter.name} onChange={(event) => set(index, { name: event.target.value.replace(/[{}|:]/g, '') })} />
              <select aria-label={`Tipo del parámetro ${index + 1}`} className={inputClass} value={parameter.type} onChange={(event) => set(index, { type: event.target.value, defaultValue: '' })}>
                {TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
              </select>
              <input aria-label={`Valor por defecto del parámetro ${index + 1}`} className={inputClass} value={parameter.defaultValue || ''} placeholder={`Por defecto (${PLACEHOLDERS[parameter.type]})`} onChange={(event) => set(index, { defaultValue: event.target.value })} />
              <label className="inline-flex items-center gap-2 text-sm text-ink-700">
                <input type="checkbox" className="h-4 w-4 accent-cobalt-600" checked={parameter.required} onChange={(event) => set(index, { required: event.target.checked })} />
                Obligatorio
              </label>
              <button type="button" aria-label={`Quitar el parámetro ${parameter.name}`} className="flex h-9 w-9 items-center justify-center rounded-md border border-ink-200 text-ink-500 hover:bg-ink-50 hover:text-rose-700" onClick={() => onChange(parameters.filter((_, position) => position !== index))}>
                <X size={15} aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      ) : null}
      <button
        type="button"
        className="inline-flex h-9 items-center gap-1 rounded-md border border-ink-200 px-2 text-sm font-medium text-ink-700 hover:bg-ink-50 disabled:opacity-40"
        disabled={parameters.length >= 20}
        onClick={() => onChange([...parameters, { id: newId(parameters), name: newName(parameters), type: 'TEXT', required: true, defaultValue: '' }])}
      >
        <Plus size={15} aria-hidden="true" />
        Agregar parámetro
      </button>
      <p className="text-xs text-ink-500">
        Úsalos como origen de una columna, en condiciones y filtros, en textos con <code className="font-mono">{'{$Nombre}'}</code> o en el nombre del archivo. El valor por defecto se usa en la vista previa.
      </p>
    </div>
  );
}

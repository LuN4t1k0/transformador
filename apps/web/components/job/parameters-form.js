'use client';

import { SlidersHorizontal } from 'lucide-react';
import { parseParameterValue } from '@previley-transformer/template-engine/src/params.js';

const inputClass = 'h-9 w-full min-w-0 rounded-md border border-ink-200 bg-white px-2 text-sm text-ink-900';

// A problem with what was typed, or null when it is valid (blank values fall back to the default).
export function parameterProblem(parameter, value) {
  const typed = value === undefined || value === null || String(value).trim() === '' ? parameter.defaultValue : value;
  try {
    const parsed = parseParameterValue(parameter, typed);
    if (parsed === null && parameter.required) return 'Obligatorio';
    return null;
  } catch (error) {
    return error.message;
  }
}

export function parametersBlockedReason(parameters = [], values = {}) {
  const invalid = parameters.find((parameter) => parameterProblem(parameter, values[parameter.id]));
  return invalid ? `Completa el parámetro «${invalid.name}».` : null;
}

// Values the template asks for before generating the file.
export function ParametersForm({ parameters = [], values, onChange, disabled = false }) {
  if (!parameters.length) return null;
  return (
    <fieldset className="rounded-lg border border-ink-200 p-3" disabled={disabled}>
      <legend className="flex items-center gap-1.5 px-1 text-sm font-semibold text-ink-900">
        <SlidersHorizontal size={15} className="text-cobalt-600" aria-hidden="true" />
        Datos para este archivo
      </legend>
      <div className="grid gap-3 sm:grid-cols-2">
        {parameters.map((parameter) => {
          const value = values[parameter.id] ?? '';
          const problem = value !== '' ? parameterProblem(parameter, value) : null;
          const id = `run-param-${parameter.id}`;
          return (
            <div key={parameter.id}>
              <label className="mb-1 block text-xs font-medium text-ink-500" htmlFor={id}>
                {parameter.name}{parameter.required ? ' *' : ''}
              </label>
              <input
                id={id}
                className={`${inputClass} ${problem ? 'border-rose-300' : ''}`}
                inputMode={parameter.type === 'NUMBER' ? 'decimal' : undefined}
                placeholder={parameter.defaultValue ? `Por defecto: ${parameter.defaultValue}` : parameter.type === 'DATE' ? 'DD-MM-AAAA' : ''}
                value={value}
                aria-invalid={Boolean(problem)}
                aria-describedby={problem ? `${id}-problem` : undefined}
                onChange={(event) => onChange({ ...values, [parameter.id]: event.target.value })}
              />
              {problem ? <p id={`${id}-problem`} className="mt-1 text-xs text-rose-700">{problem}</p> : null}
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}

'use client';

import { applyFormat, DATE_INPUT_OPTIONS, DATE_OUTPUT_OPTIONS, parseFormat, RUT_FORMAT_OPTIONS } from '../../lib/template-editor';
import { inputClass } from './source-editor';

const labelClass = 'mb-1 block text-xs font-medium text-ink-500';
const checkboxClass = 'inline-flex items-center gap-2 text-sm text-ink-700';

export function FormatEditor({ idPrefix, column, onChange }) {
  const format = parseFormat(column);
  const set = (changes) => onChange(applyFormat(column, { ...format, ...changes }));

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[200px_minmax(0,1fr)]">
        <div>
          <label className={labelClass} htmlFor={`${idPrefix}-kind`}>Formato</label>
          <select id={`${idPrefix}-kind`} className={inputClass} value={format.kind} onChange={(event) => set({ kind: event.target.value })}>
            <option value="NONE">Texto tal cual</option>
            <option value="RUT">RUT</option>
            <option value="DATE">Fecha</option>
            <option value="NUMBER">Número</option>
          </select>
        </div>

        <div className="min-w-0">
          {format.kind === 'RUT' ? (
            <div className="grid gap-2">
              <div>
                <label className={labelClass} htmlFor={`${idPrefix}-rut`}>Cómo escribir el RUT</label>
                <select id={`${idPrefix}-rut`} className={inputClass} value={format.rutFormat} onChange={(event) => set({ rutFormat: event.target.value })}>
                  {RUT_FORMAT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
              <label className={checkboxClass}>
                <input type="checkbox" className="h-4 w-4 accent-cobalt-600" checked={format.validateRut} onChange={(event) => set({ validateRut: event.target.checked })} />
                Marcar como error si el dígito verificador no es válido
              </label>
            </div>
          ) : null}

          {format.kind === 'DATE' ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <label className={labelClass} htmlFor={`${idPrefix}-date-in`}>Viene como</label>
                <select id={`${idPrefix}-date-in`} className={inputClass} value={format.dateInput} onChange={(event) => set({ dateInput: event.target.value })}>
                  {DATE_INPUT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass} htmlFor={`${idPrefix}-date-out`}>Escribir como</label>
                <select id={`${idPrefix}-date-out`} className={inputClass} value={format.dateOutput} onChange={(event) => set({ dateOutput: event.target.value })}>
                  {DATE_OUTPUT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
            </div>
          ) : null}

          {format.kind === 'NUMBER' ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className={labelClass} htmlFor={`${idPrefix}-input-decimal`}>En el archivo, los decimales se separan con</label>
                <select id={`${idPrefix}-input-decimal`} className={inputClass} value={format.inputDecimalSeparator} onChange={(event) => set({ inputDecimalSeparator: event.target.value })}>
                  <option value="AUTO">Detectar (1.234 = mil; 1,5 = uno coma cinco; 1234.56 = decimal)</option>
                  <option value=",">Coma (1.234,56)</option>
                  <option value=".">Punto (1,234.56)</option>
                </select>
              </div>
              <div>
                <label className={labelClass} htmlFor={`${idPrefix}-decimals`}>Decimales</label>
                <select
                  id={`${idPrefix}-decimals`}
                  className={inputClass}
                  value={format.numberDecimals === null ? 'KEEP' : String(format.numberDecimals)}
                  onChange={(event) => set({ numberDecimals: event.target.value === 'KEEP' ? null : Number(event.target.value) })}
                >
                  <option value="0">Entero (sin decimales)</option>
                  <option value="1">1 decimal</option>
                  <option value="2">2 decimales</option>
                  <option value="3">3 decimales</option>
                  <option value="4">4 decimales</option>
                  <option value="KEEP">Mantener los del archivo</option>
                </select>
              </div>
              <div>
                <label className={labelClass} htmlFor={`${idPrefix}-separator`}>Separador decimal al escribir</label>
                <select id={`${idPrefix}-separator`} className={inputClass} value={format.decimalSeparator} onChange={(event) => set({ decimalSeparator: event.target.value })} disabled={format.numberDecimals === 0}>
                  <option value=".">Punto (1234.50)</option>
                  <option value=",">Coma (1234,50)</option>
                </select>
              </div>
              {format.numberDecimals === 0 ? (
                <label className={`${checkboxClass} sm:col-span-2`}>
                  <input type="checkbox" className="h-4 w-4 accent-cobalt-600" checked={format.validateInteger} onChange={(event) => set({ validateInteger: event.target.checked })} />
                  Marcar como error si el valor no es numérico
                </label>
              ) : null}
            </div>
          ) : null}

          {format.kind === 'NONE' ? <p className="pt-6 text-sm text-ink-500">Se copia el valor sin convertirlo. Puedes ajustar mayúsculas y espacios abajo.</p> : null}
        </div>
      </div>

      <fieldset className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <legend className="sr-only">Opciones de texto</legend>
        <label className="inline-flex items-center gap-2 text-sm text-ink-700">
          <span className="text-xs font-medium text-ink-500">Letras</span>
          <select aria-label="Mayúsculas o minúsculas" className="h-8 rounded-md border border-ink-200 bg-white px-2 text-sm" value={format.textCase} onChange={(event) => set({ textCase: event.target.value })}>
            <option value="NONE">Como vienen</option>
            <option value="UPPERCASE">MAYÚSCULAS</option>
            <option value="LOWERCASE">minúsculas</option>
          </select>
        </label>
        <label className={checkboxClass}>
          <input type="checkbox" className="h-4 w-4 accent-cobalt-600" checked={format.removeAccents} onChange={(event) => set({ removeAccents: event.target.checked })} />
          Quitar tildes
        </label>
        <label className={checkboxClass}>
          <input type="checkbox" className="h-4 w-4 accent-cobalt-600" checked={format.normalizeSpaces} onChange={(event) => set({ normalizeSpaces: event.target.checked })} />
          Limpiar espacios
        </label>
      </fieldset>
    </div>
  );
}

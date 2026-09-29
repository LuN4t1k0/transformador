'use client';

import { applyFormat, DATE_INPUT_OPTIONS, DATE_OUTPUT_OPTIONS, domainFormats as getDomainFormats, parseFormat } from '../../lib/template-editor';
import { inputClass } from './source-editor';

const labelClass = 'mb-1 block text-xs font-medium text-ink-500';
const checkboxClass = 'inline-flex items-center gap-2 text-sm text-ink-700';

export function FormatEditor({ idPrefix, column, onChange }) {
  const format = parseFormat(column);
  const set = (changes) => onChange(applyFormat(column, { ...format, ...changes }));
  // Formats contributed by the domain packs (e.g. RUT), shown next to the core ones.
  const domainFormats = getDomainFormats();
  const domain = domainFormats.find((candidate) => candidate.kind === format.kind);

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[200px_minmax(0,1fr)]">
        <div>
          <label className={labelClass} htmlFor={`${idPrefix}-kind`}>Formato</label>
          <select id={`${idPrefix}-kind`} className={inputClass} value={format.kind} onChange={(event) => set({ kind: event.target.value })}>
            <option value="NONE">Texto tal cual</option>
            {domainFormats.map((domain) => <option key={domain.kind} value={domain.kind}>{domain.label}</option>)}
            <option value="DATE">Fecha</option>
            <option value="NUMBER">Número</option>
          </select>
        </div>

        <div className="min-w-0">
          {domain ? (
            <div className="grid gap-2">
              <div>
                <label className={labelClass} htmlFor={`${idPrefix}-domain`}>{domain.option.label}</label>
                <select id={`${idPrefix}-domain`} className={inputClass} value={format.domainOption ?? domain.option.default} onChange={(event) => set({ domainOption: event.target.value })}>
                  {domain.option.choices.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
              {domain.validation ? (
                <label className={checkboxClass}>
                  <input type="checkbox" className="h-4 w-4 accent-cobalt-600" checked={format.domainValidate} onChange={(event) => set({ domainValidate: event.target.checked })} />
                  {domain.validation.label}
                </label>
              ) : null}
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
            <option value="TITLE_CASE">Nombre Propio</option>
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
        <label className={checkboxClass}>
          <input type="checkbox" className="h-4 w-4 accent-cobalt-600" checked={format.digitsOnly} onChange={(event) => set({ digitsOnly: event.target.checked })} />
          Dejar solo dígitos
        </label>
      </fieldset>

      <details className="rounded-md border border-ink-200" open={Boolean(format.replacements.length || format.substring || format.pad)}>
        <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-ink-700 hover:bg-ink-50">Más opciones de texto: reemplazar, extraer una parte, rellenar</summary>
        <div className="space-y-3 border-t border-ink-100 p-3">
          <div className="space-y-2">
            <p className="text-xs font-medium text-ink-500">Reemplazar</p>
            {format.replacements.map((replacement, index) => (
              <div key={index} className="flex flex-wrap items-center gap-2 text-sm">
                <input aria-label={`Buscar ${index + 1}`} className="h-8 w-32 rounded-md border border-ink-200 px-2 font-mono text-sm" value={replacement.find} placeholder="buscar" onChange={(event) => set({ replacements: format.replacements.map((item, position) => (position === index ? { ...item, find: event.target.value } : item)) })} />
                <span className="text-ink-500">por</span>
                <input aria-label={`Reemplazar ${index + 1}`} className="h-8 w-32 rounded-md border border-ink-200 px-2 font-mono text-sm" value={replacement.replace} placeholder="(nada)" onChange={(event) => set({ replacements: format.replacements.map((item, position) => (position === index ? { ...item, replace: event.target.value } : item)) })} />
                <button type="button" className="text-xs text-ink-500 hover:text-rose-700" onClick={() => set({ replacements: format.replacements.filter((_, position) => position !== index) })}>Quitar</button>
              </div>
            ))}
            <button type="button" className="text-xs font-medium text-cobalt-700 hover:underline" onClick={() => set({ replacements: [...format.replacements, { find: '', replace: '' }] })}>+ Agregar reemplazo</button>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm">
            <label className={checkboxClass}>
              <input type="checkbox" className="h-4 w-4 accent-cobalt-600" checked={Boolean(format.substring)} onChange={(event) => set({ substring: event.target.checked ? { start: 1, length: 3 } : null })} />
              Extraer parte:
            </label>
            {format.substring ? (
              <>
                <span className="text-ink-500">desde el carácter</span>
                <input aria-label="Desde el carácter" type="number" min={1} className="h-8 w-16 rounded-md border border-ink-200 px-2" value={format.substring.start} onChange={(event) => set({ substring: { ...format.substring, start: Math.max(1, Number(event.target.value) || 1) } })} />
                <span className="text-ink-500">cantidad</span>
                <input aria-label="Cantidad de caracteres" type="number" min={1} className="h-8 w-16 rounded-md border border-ink-200 px-2" value={format.substring.length || ''} placeholder="todo" onChange={(event) => set({ substring: { ...format.substring, length: Number(event.target.value) || undefined } })} />
              </>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm">
            <label className={checkboxClass}>
              <input type="checkbox" className="h-4 w-4 accent-cobalt-600" checked={Boolean(format.pad)} onChange={(event) => set({ pad: event.target.checked ? { length: 8, char: '0', side: 'LEFT' } : null })} />
              Rellenar hasta
            </label>
            {format.pad ? (
              <>
                <input aria-label="Largo del relleno" type="number" min={1} className="h-8 w-16 rounded-md border border-ink-200 px-2" value={format.pad.length} onChange={(event) => set({ pad: { ...format.pad, length: Math.max(1, Number(event.target.value) || 1) } })} />
                <span className="text-ink-500">caracteres con</span>
                <input aria-label="Carácter de relleno" maxLength={1} className="h-8 w-10 rounded-md border border-ink-200 px-2 text-center font-mono" value={format.pad.char} onChange={(event) => event.target.value && set({ pad: { ...format.pad, char: event.target.value } })} />
                <select aria-label="Lado del relleno" className="h-8 rounded-md border border-ink-200 bg-white px-2" value={format.pad.side} onChange={(event) => set({ pad: { ...format.pad, side: event.target.value } })}>
                  <option value="LEFT">a la izquierda</option>
                  <option value="RIGHT">a la derecha</option>
                </select>
              </>
            ) : null}
          </div>
        </div>
      </details>
    </div>
  );
}

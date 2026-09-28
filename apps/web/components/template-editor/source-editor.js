'use client';

import { Plus, X } from 'lucide-react';

export const inputClass = 'h-9 w-full min-w-0 rounded-md border border-ink-200 bg-white px-2 text-sm text-ink-900';
const labelClass = 'mb-1 block text-xs font-medium text-ink-500';

const SOURCE_TYPES = [
  { value: 'COLUMN', label: 'Columna del archivo' },
  { value: 'SPLIT', label: 'Separar por palabras' },
  { value: 'CONCAT', label: 'Unir varias columnas' },
  { value: 'CONSTANT', label: 'Valor fijo' },
  { value: 'EMPTY', label: 'Vacía' }
];

// Header picker: a select when the file headers are known, otherwise free text with suggestions.
export function HeaderInput({ id, value, headers, suggestions = [], onChange, label }) {
  if (headers) {
    const isMissing = value && !headers.includes(value);
    return (
      <select id={id} aria-label={label} className={inputClass} value={value || ''} onChange={(event) => onChange(event.target.value)}>
        <option value="">Elegir columna…</option>
        {isMissing ? <option value={value}>{value} (no está en el archivo)</option> : null}
        {headers.map((header) => <option key={header} value={header}>{header}</option>)}
      </select>
    );
  }
  return (
    <>
      <input id={id} aria-label={label} list={`${id}-suggestions`} className={inputClass} value={value || ''} placeholder="Nombre del encabezado en el Excel" onChange={(event) => onChange(event.target.value)} />
      <datalist id={`${id}-suggestions`}>
        {suggestions.map((name) => <option key={name} value={name} />)}
      </datalist>
    </>
  );
}

function defaultColumn(source) {
  if (!source) return '';
  if (source.column) return source.column;
  return source.parts?.find((part) => part.type === 'COLUMN')?.column || '';
}

function convertSource(source, type) {
  const column = defaultColumn(source);
  if (type === 'COLUMN') return { type: 'COLUMN', column };
  if (type === 'SPLIT') return { type: 'SPLIT_WORD', column, index: 0 };
  if (type === 'CONCAT') return { type: 'CONCAT', separator: ' ', parts: [{ type: 'COLUMN', column }] };
  if (type === 'CONSTANT') return { type: 'CONSTANT', value: '' };
  return { type: 'EMPTY' };
}

export function SourceEditor({ idPrefix, source, headers, suggestions, onChange }) {
  const kind = source.type.startsWith('SPLIT') ? 'SPLIT' : source.type;

  return (
    <div className="grid gap-3 sm:grid-cols-[200px_minmax(0,1fr)]">
      <div>
        <label className={labelClass} htmlFor={`${idPrefix}-type`}>Origen</label>
        <select id={`${idPrefix}-type`} className={inputClass} value={kind} onChange={(event) => onChange(convertSource(source, event.target.value))}>
          {SOURCE_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
        </select>
      </div>

      <div className="min-w-0">
        {source.type === 'COLUMN' ? (
          <>
            <label className={labelClass} htmlFor={`${idPrefix}-column`}>Columna</label>
            <HeaderInput id={`${idPrefix}-column`} value={source.column} headers={headers} suggestions={suggestions} onChange={(column) => onChange({ ...source, column })} />
          </>
        ) : null}

        {kind === 'SPLIT' ? (
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_150px_80px]">
            <div className="min-w-0">
              <label className={labelClass} htmlFor={`${idPrefix}-column`}>Columna</label>
              <HeaderInput id={`${idPrefix}-column`} value={source.column} headers={headers} suggestions={suggestions} onChange={(column) => onChange({ ...source, column })} />
            </div>
            <div>
              <label className={labelClass} htmlFor={`${idPrefix}-split`}>Tomar</label>
              <select
                id={`${idPrefix}-split`}
                className={inputClass}
                value={source.type}
                onChange={(event) => {
                  const position = (source.type === 'SPLIT_WORD' ? source.index : source.start) ?? 0;
                  onChange(event.target.value === 'SPLIT_WORD'
                    ? { type: 'SPLIT_WORD', column: source.column, index: position }
                    : { type: 'SPLIT_WORD_RANGE', column: source.column, start: position });
                }}
              >
                <option value="SPLIT_WORD">Solo la palabra</option>
                <option value="SPLIT_WORD_RANGE">Desde la palabra</option>
              </select>
            </div>
            <div>
              <label className={labelClass} htmlFor={`${idPrefix}-word`}>N.º</label>
              <input
                id={`${idPrefix}-word`}
                type="number"
                min={1}
                max={50}
                className={inputClass}
                value={((source.type === 'SPLIT_WORD' ? source.index : source.start) ?? 0) + 1}
                onChange={(event) => {
                  const position = Math.max(0, Math.min(49, Number(event.target.value || 1) - 1));
                  onChange(source.type === 'SPLIT_WORD' ? { ...source, index: position } : { ...source, start: position });
                }}
              />
            </div>
          </div>
        ) : null}

        {source.type === 'CONSTANT' ? (
          <>
            <label className={labelClass} htmlFor={`${idPrefix}-constant`}>Valor</label>
            <input id={`${idPrefix}-constant`} className={inputClass} value={source.value} placeholder="Ej: 01" onChange={(event) => onChange({ ...source, value: event.target.value })} />
          </>
        ) : null}

        {source.type === 'CONCAT' ? (
          <div className="space-y-2">
            {source.parts.map((part, index) => (
              <div key={index} className="flex items-end gap-2">
                <div className="w-28 shrink-0">
                  <label className={labelClass} htmlFor={`${idPrefix}-part-${index}-type`}>Parte {index + 1}</label>
                  <select
                    id={`${idPrefix}-part-${index}-type`}
                    className={inputClass}
                    value={part.type}
                    onChange={(event) => {
                      const parts = [...source.parts];
                      parts[index] = event.target.value === 'COLUMN' ? { type: 'COLUMN', column: '' } : { type: 'CONSTANT', value: '' };
                      onChange({ ...source, parts });
                    }}
                  >
                    <option value="COLUMN">Columna</option>
                    <option value="CONSTANT">Texto</option>
                  </select>
                </div>
                <div className="min-w-0 flex-1">
                  {part.type === 'COLUMN' ? (
                    <HeaderInput
                      id={`${idPrefix}-part-${index}`}
                      label={`Columna de la parte ${index + 1}`}
                      value={part.column}
                      headers={headers}
                      suggestions={suggestions}
                      onChange={(column) => {
                        const parts = [...source.parts];
                        parts[index] = { ...part, column };
                        onChange({ ...source, parts });
                      }}
                    />
                  ) : (
                    <input
                      aria-label={`Texto de la parte ${index + 1}`}
                      className={inputClass}
                      value={part.value}
                      onChange={(event) => {
                        const parts = [...source.parts];
                        parts[index] = { ...part, value: event.target.value };
                        onChange({ ...source, parts });
                      }}
                    />
                  )}
                </div>
                <button
                  type="button"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-ink-200 text-ink-500 hover:bg-ink-50 disabled:opacity-40"
                  aria-label={`Quitar parte ${index + 1}`}
                  disabled={source.parts.length === 1}
                  onClick={() => onChange({ ...source, parts: source.parts.filter((_, partIndex) => partIndex !== index) })}
                >
                  <X size={15} aria-hidden="true" />
                </button>
              </div>
            ))}
            <div className="flex flex-wrap items-end gap-2">
              <button
                type="button"
                className="inline-flex h-9 items-center gap-1 rounded-md border border-ink-200 px-2 text-sm font-medium text-ink-700 hover:bg-ink-50 disabled:opacity-40"
                disabled={source.parts.length >= 10}
                onClick={() => onChange({ ...source, parts: [...source.parts, { type: 'COLUMN', column: '' }] })}
              >
                <Plus size={15} aria-hidden="true" />
                Agregar parte
              </button>
              <div className="w-32">
                <label className={labelClass} htmlFor={`${idPrefix}-separator`}>Separador</label>
                <input id={`${idPrefix}-separator`} maxLength={5} className={`${inputClass} font-mono`} value={source.separator} placeholder="(ninguno)" onChange={(event) => onChange({ ...source, separator: event.target.value })} />
              </div>
            </div>
          </div>
        ) : null}

        {source.type === 'EMPTY' ? <p className="pt-6 text-sm text-ink-500">La columna saldrá vacía en el archivo final.</p> : null}
      </div>
    </div>
  );
}

'use client';

import { Plus, X } from 'lucide-react';
import { CalcEditor, defaultCalc } from './calc-editor';
import { CaseEditor, CoalesceEditor, DateCalcEditor, defaultRule, MapEditor, RowNumberEditor, TemplateTextEditor } from './rule-editors';
import { useTemplateParameters } from './parameters-context';

export const inputClass = 'h-9 w-full min-w-0 rounded-md border border-ink-200 bg-white px-2 text-sm text-ink-900';
const labelClass = 'mb-1 block text-xs font-medium text-ink-500';

const SOURCE_GROUPS = [
  { label: 'Tomar del archivo', types: [
    { value: 'COLUMN', label: 'Columna del archivo' },
    { value: 'SPLIT', label: 'Separar (por palabras u otro separador)' },
    { value: 'CONCAT', label: 'Unir varias columnas' },
    { value: 'COALESCE', label: 'Primer valor no vacío' }
  ] },
  { label: 'Reglas', types: [
    { value: 'CASE', label: 'Condición (si… entonces…)' },
    { value: 'MAP', label: 'Tabla de equivalencias' }
  ] },
  { label: 'Texto', types: [
    { value: 'TEMPLATE', label: 'Texto con variables' },
    { value: 'CONSTANT', label: 'Valor fijo' }
  ] },
  { label: 'Números y fechas', types: [
    { value: 'CALC', label: 'Cálculo (%, suma, resta…)' },
    { value: 'DATE_CALC', label: 'Operación con fechas' },
    { value: 'ROW_NUMBER', label: 'Número correlativo' }
  ] },
  { label: 'Otros', types: [{ value: 'EMPTY', label: 'Vacía' }] }
];

const RULE_EDITORS = { CASE: CaseEditor, MAP: MapEditor, COALESCE: CoalesceEditor, TEMPLATE: TemplateTextEditor, DATE_CALC: DateCalcEditor, ROW_NUMBER: RowNumberEditor, CALC: CalcEditor };

function SourceTypeSelect({ id, value, onChange }) {
  const parameters = useTemplateParameters();
  return (
    <select id={id} className={inputClass} value={value} onChange={(event) => onChange(event.target.value)}>
      {SOURCE_GROUPS.map((group) => (
        <optgroup key={group.label} label={group.label}>
          {group.types.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
          {group.label === 'Otros' && (parameters.length || value === 'PARAM') ? <option value="PARAM">Parámetro (se pide al generar)</option> : null}
        </optgroup>
      ))}
    </select>
  );
}

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

export function convertSource(source, type, headers, parameters = []) {
  const column = defaultColumn(source);
  if (type === 'PARAM') return { type: 'PARAM', paramId: parameters[0]?.id || '' };
  if (RULE_EDITORS[type] && type !== 'CALC') return defaultRule(type, column ? [column, ...(headers || [])] : headers);
  if (type === 'COLUMN') return { type: 'COLUMN', column };
  if (type === 'SPLIT') return { type: 'SPLIT_WORD', column, index: 0 };
  if (type === 'CONCAT') return { type: 'CONCAT', separator: ' ', parts: [{ type: 'COLUMN', column }] };
  if (type === 'CONSTANT') return { type: 'CONSTANT', value: '' };
  if (type === 'CALC') return defaultCalc(column);
  return { type: 'EMPTY' };
}

export function SourceEditor({ idPrefix, source, headers, suggestions, outputColumns = [], onChange }) {
  const parameters = useTemplateParameters();
  const RuleEditor = RULE_EDITORS[source.type];
  if (RuleEditor) {
    return (
      <div className="space-y-3">
        <div className="max-w-xs">
          <label className={labelClass} htmlFor={`${idPrefix}-type`}>Origen</label>
          <SourceTypeSelect id={`${idPrefix}-type`} value={source.type} onChange={(type) => onChange(convertSource(source, type, headers, parameters))} />
        </div>
        <RuleEditor idPrefix={idPrefix} source={source} headers={headers} suggestions={suggestions} outputColumns={outputColumns} onChange={onChange} />
      </div>
    );
  }

  const kind = source.type.startsWith('SPLIT') ? 'SPLIT' : source.type;

  return (
    <div className="grid gap-3 sm:grid-cols-[200px_minmax(0,1fr)]">
      <div>
        <label className={labelClass} htmlFor={`${idPrefix}-type`}>Origen</label>
        <SourceTypeSelect id={`${idPrefix}-type`} value={kind} onChange={(type) => onChange(convertSource(source, type, headers, parameters))} />
      </div>

      <div className="min-w-0">
        {source.type === 'PARAM' ? (
          <>
            <label className={labelClass} htmlFor={`${idPrefix}-param`}>Parámetro</label>
            <select id={`${idPrefix}-param`} className={inputClass} value={source.paramId} onChange={(event) => onChange({ type: 'PARAM', paramId: event.target.value })}>
              {!parameters.some((parameter) => parameter.id === source.paramId) ? <option value={source.paramId}>Elegir parámetro…</option> : null}
              {parameters.map((parameter) => <option key={parameter.id} value={parameter.id}>{parameter.name}</option>)}
            </select>
            <p className="mt-1 text-xs text-ink-500">Toma el valor que se escribe al generar el archivo (igual para todas las filas).</p>
          </>
        ) : null}
        {source.type === 'COLUMN' ? (
          <>
            <label className={labelClass} htmlFor={`${idPrefix}-column`}>Columna</label>
            <HeaderInput id={`${idPrefix}-column`} value={source.column} headers={headers} suggestions={suggestions} onChange={(column) => onChange({ ...source, column })} />
          </>
        ) : null}

        {kind === 'SPLIT' ? (
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_150px_80px_90px]">
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
            <div>
              <label className={labelClass} htmlFor={`${idPrefix}-delimiter`}>Separador</label>
              <input
                id={`${idPrefix}-delimiter`}
                maxLength={5}
                className={`${inputClass} font-mono`}
                value={source.delimiter || ''}
                placeholder="espacio"
                onChange={(event) => {
                  const { delimiter, ...rest } = source;
                  onChange(event.target.value ? { ...rest, delimiter: event.target.value } : rest);
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

        {source.type === 'EMPTY' ? (
          headers ? (
            <>
              <label className={labelClass} htmlFor={`${idPrefix}-column`}>Columna (o déjala vacía)</label>
              <HeaderInput id={`${idPrefix}-column`} value="" headers={headers} suggestions={suggestions} onChange={(column) => column && onChange({ type: 'COLUMN', column })} />
            </>
          ) : <p className="pt-6 text-sm text-ink-500">La columna saldrá vacía en el archivo final.</p>
        ) : null}
      </div>
    </div>
  );
}

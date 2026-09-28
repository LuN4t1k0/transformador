'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  FileSpreadsheet,
  FileUp,
  Info,
  ListFilter,
  ShieldCheck
} from 'lucide-react';
import { Shell } from '../components/shell';
import { StatusPill } from '../components/status-pill';
import { formatFileSize, validateExcelFile } from '../lib/file-validation';
import { createInitialMapping, evaluateMapping, MAPPING_STATUS, updateMappingEntry } from '../lib/mapping';
import { sampleDetectedColumns } from '../lib/sample-analysis';
import { describeSource, describeTransformations, getTemplate, templates } from '../lib/templates';

const steps = [
  { id: 'source', label: 'Archivo y plantilla', shortLabel: 'Archivo' },
  { id: 'mapping', label: 'Mapeo de columnas', shortLabel: 'Mapeo' },
  { id: 'review', label: 'Revisión', shortLabel: 'Revisión' }
];

const stepTips = [
  'Sube el Excel tal como lo exportas. El análisis se hace en el servidor: aquí no se leen ni se muestran los datos de las filas.',
  'Revisa las filas marcadas. «Por confirmar» indica una regla que puede no ser exacta; «Falta origen» indica un campo requerido sin columna asignada.',
  'Verifica el resumen antes de crear el job. Podrás volver a cualquier paso anterior sin perder lo configurado.'
];

function pluralize(count, singular, plural) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function getBlockedReason({ currentStep, file, template, evaluation, submitted }) {
  if (currentStep === 0) {
    if (!file) return 'Selecciona un archivo .xlsx para continuar.';
    if (!template) return 'Selecciona una plantilla para continuar.';
  }
  if (currentStep === 1 && !evaluation.isComplete) {
    const parts = [];
    if (evaluation.counts.missing) parts.push(pluralize(evaluation.counts.missing, 'campo sin origen', 'campos sin origen'));
    if (evaluation.counts.pending) parts.push(pluralize(evaluation.counts.pending, 'sugerencia por confirmar', 'sugerencias por confirmar'));
    return `Resuelve ${parts.join(' y ')} para continuar.`;
  }
  if (currentStep === 2 && submitted) return 'El job ya fue creado con esta configuración.';
  return null;
}

function getPrimaryLabel(currentStep, submitted) {
  if (currentStep === 0) return 'Continuar al mapeo';
  if (currentStep === 1) return 'Revisar';
  return submitted ? 'Job creado' : 'Crear job';
}

function Stepper({ currentStep, onSelect }) {
  return (
    <nav aria-label="Pasos">
      <ol className="grid grid-cols-3 gap-2">
        {steps.map((step, index) => {
          const isActive = index === currentStep;
          const isDone = index < currentStep;

          return (
            <li key={step.id} className="min-w-0">
              <button
                type="button"
                className={`flex h-10 w-full items-center gap-2 rounded-md border px-3 text-left text-sm font-semibold ${
                  isActive
                    ? 'border-cobalt-500 bg-cobalt-50 text-cobalt-700'
                    : isDone
                      ? 'border-mint-100 bg-mint-50 text-mint-600 hover:border-mint-600'
                      : 'cursor-default border-ink-200 bg-white text-ink-500'
                }`}
                aria-current={isActive ? 'step' : undefined}
                disabled={!isDone}
                onClick={() => onSelect(index)}
              >
                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs ${
                  isDone ? 'bg-mint-600 text-white' : isActive ? 'bg-cobalt-600 text-white' : 'bg-ink-100 text-ink-500'
                }`}>
                  {isDone ? <Check size={13} aria-hidden="true" /> : index + 1}
                </span>
                <span className="truncate sm:hidden">{step.shortLabel}</span>
                <span className="hidden truncate sm:inline">{step.label}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function Panel({ title, description, actions, children }) {
  return (
    <section className="rounded-lg border border-ink-200 bg-white shadow-panel">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-ink-100 px-4 py-4 sm:px-5">
        <div className="min-w-0">
          <h2 data-step-heading tabIndex={-1} className="text-base font-semibold text-ink-900 focus:outline-none">{title}</h2>
          {description ? <p className="mt-1 text-sm text-ink-500">{description}</p> : null}
        </div>
        {actions}
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

function FileDropzone({ file, error, onFile }) {
  const [isDragging, setIsDragging] = useState(false);

  function handleDrop(event) {
    event.preventDefault();
    setIsDragging(false);
    const dropped = event.dataTransfer.files?.[0];
    if (dropped) onFile(dropped);
  }

  return (
    <div>
      <label
        className={`flex min-h-40 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed px-5 py-6 text-center transition-colors ${
          isDragging
            ? 'border-cobalt-500 bg-cobalt-50'
            : error
              ? 'border-rose-200 bg-rose-50'
              : 'border-ink-300 bg-ink-50 hover:border-cobalt-500 hover:bg-cobalt-50/50'
        }`}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        <input
          className="sr-only"
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          aria-describedby="file-help"
          onChange={(event) => {
            const selected = event.target.files?.[0];
            // Cancelling the picker yields no file: keep the previous selection.
            if (selected) onFile(selected);
            event.target.value = '';
          }}
        />
        <span className="flex h-11 w-11 items-center justify-center rounded-md bg-white text-cobalt-600 ring-1 ring-ink-200">
          {file ? <FileSpreadsheet size={22} aria-hidden="true" /> : <FileUp size={22} aria-hidden="true" />}
        </span>
        {file ? (
          <>
            <span className="mt-3 max-w-full truncate text-sm font-semibold text-ink-900">{file.name}</span>
            <span className="mt-1 text-xs text-ink-500">{formatFileSize(file.size)} · <span className="font-semibold text-cobalt-600">Cambiar archivo</span></span>
          </>
        ) : (
          <>
            <span className="mt-3 text-sm font-semibold text-ink-900">Arrastra tu Excel aquí o <span className="text-cobalt-600">elige un archivo</span></span>
            <span id="file-help" className="mt-1 text-xs text-ink-500">Solo .xlsx, hasta 25 MB.</span>
          </>
        )}
      </label>
      {error ? (
        <p role="alert" className="mt-2 flex items-start gap-2 text-sm text-rose-700">
          <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : null}
    </div>
  );
}

function SourceStep({ file, fileError, onFile, templateId, onTemplate }) {
  return (
    <Panel title="Archivo y plantilla" description="Elige el Excel de origen y el formato en que quieres recibirlo.">
      <h3 className="mb-2 text-sm font-semibold text-ink-900">1. Archivo de origen</h3>
      <FileDropzone file={file} error={fileError} onFile={onFile} />

      <h3 className="mb-2 mt-6 text-sm font-semibold text-ink-900">2. Plantilla de salida</h3>
      <div className="grid gap-2" role="radiogroup" aria-label="Plantilla de salida">
        {templates.map((template) => {
          const isSelected = template.id === templateId;
          const requiredCount = template.columns.filter((column) => column.required).length;

          return (
            <button
              key={template.id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              className={`flex w-full items-start gap-3 rounded-lg border p-4 text-left ${
                isSelected ? 'border-cobalt-500 bg-cobalt-50' : 'border-ink-200 bg-white hover:bg-ink-50'
              }`}
              onClick={() => onTemplate(template.id)}
            >
              <FileSpreadsheet className="mt-0.5 shrink-0 text-cobalt-600" size={20} aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-ink-900">{template.name}</span>
                <span className="mt-1 block text-sm text-ink-500">{template.description}</span>
                <span className="mt-2 block text-xs text-ink-500">
                  {template.columns.length} columnas ({requiredCount} requeridas) · hoja «{template.output.sheetName}» · .{template.output.format}
                </span>
              </span>
              {isSelected ? <CheckCircle2 className="shrink-0 text-cobalt-600" size={18} aria-hidden="true" /> : null}
            </button>
          );
        })}
      </div>
    </Panel>
  );
}

function MappingSummary({ counts }) {
  const percent = Math.round((counts.ok / counts.total) * 100);

  return (
    <div className="mb-4 rounded-md border border-ink-200 bg-ink-50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="font-semibold text-ink-900">{counts.ok} de {counts.total} campos listos</span>
        <span className="flex flex-wrap gap-1.5">
          {counts.pending ? <StatusPill value={MAPPING_STATUS.REQUIERE_CONFIRMACION} label={`${counts.pending} por confirmar`} /> : null}
          {counts.missing ? <StatusPill value={MAPPING_STATUS.FALTANTE} label={`${counts.missing} sin origen`} /> : null}
          {!counts.pending && !counts.missing ? <StatusPill value={MAPPING_STATUS.OK} label="Todo resuelto" /> : null}
        </span>
      </div>
      <div
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink-200"
        role="progressbar"
        aria-label="Campos listos"
        aria-valuenow={counts.ok}
        aria-valuemin={0}
        aria-valuemax={counts.total}
      >
        <div className="h-full rounded-full bg-mint-600 transition-[width]" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function MappingRow({ row, detectedColumns, onChange, onConfirm }) {
  const { column, entry, status, reason } = row;
  const selectId = `mapping-${column.id}`;
  const transformations = describeTransformations(column);
  const sourceNote = describeSource(entry);
  const tone = status === MAPPING_STATUS.FALTANTE
    ? 'bg-rose-50/60'
    : status === MAPPING_STATUS.REQUIERE_CONFIRMACION ? 'bg-amber-50/60' : '';

  return (
    <li className={`grid gap-3 p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_128px] md:items-start ${tone}`}>
      <div className="min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="text-xs tabular-nums text-ink-400">{column.position}</span>
          <label htmlFor={selectId} className="text-sm font-semibold text-ink-900">{column.outputName}</label>
          {column.required ? <span className="text-xs text-ink-500">Requerido</span> : <span className="text-xs text-ink-400">Opcional</span>}
        </div>
        {transformations.length ? (
          <ul className="mt-1.5 flex flex-wrap gap-1" aria-label="Transformaciones aplicadas">
            {transformations.map((label) => (
              <li key={label} className="rounded bg-ink-100 px-1.5 py-0.5 text-xs text-ink-700">{label}</li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="min-w-0">
        <select
          id={selectId}
          className="h-10 w-full rounded-md border border-ink-200 bg-white px-3 text-sm text-ink-900"
          value={entry.type === 'EMPTY' ? '' : entry.column}
          aria-describedby={reason ? `${selectId}-reason` : undefined}
          onChange={(event) => onChange(column, event.target.value)}
        >
          <option value="">{column.required ? 'Sin origen' : 'Dejar vacía'}</option>
          {detectedColumns.map((detected) => (
            <option key={detected} value={detected}>{detected}</option>
          ))}
        </select>
        {sourceNote ? <p className="mt-1 text-xs text-ink-500">{sourceNote}</p> : null}
      </div>

      <div className="flex items-center gap-2 md:flex-col md:items-end">
        <StatusPill value={status} />
        {status === MAPPING_STATUS.REQUIERE_CONFIRMACION ? (
          <button
            type="button"
            className="inline-flex h-7 items-center gap-1 rounded-md border border-amber-200 bg-white px-2 text-xs font-semibold text-amber-700 hover:bg-amber-50"
            onClick={() => onConfirm(column.id)}
          >
            <Check size={13} aria-hidden="true" />
            Confirmar
          </button>
        ) : null}
      </div>

      {reason && status !== MAPPING_STATUS.OK ? (
        <p id={`${selectId}-reason`} className="text-xs text-ink-700 md:col-span-3">{reason}</p>
      ) : null}
    </li>
  );
}

function MappingStep({ evaluation, onChange, onConfirm }) {
  const [showPendingOnly, setShowPendingOnly] = useState(false);
  const pendingCount = evaluation.counts.pending + evaluation.counts.missing;
  const rows = showPendingOnly
    ? evaluation.rows.filter((row) => row.status !== MAPPING_STATUS.OK)
    : evaluation.rows;

  return (
    <Panel
      title="Mapeo de columnas"
      description="Cada campo de la plantilla toma su valor de una columna de tu archivo. Revisa las sugerencias marcadas."
      actions={(
        <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-ink-200 px-3 text-sm font-medium text-ink-700 hover:bg-ink-50">
          <input
            type="checkbox"
            className="h-4 w-4 accent-cobalt-600"
            checked={showPendingOnly}
            onChange={(event) => setShowPendingOnly(event.target.checked)}
          />
          <ListFilter size={15} aria-hidden="true" />
          Solo pendientes ({pendingCount})
        </label>
      )}
    >
      <MappingSummary counts={evaluation.counts} />

      <p className="mb-3 flex items-start gap-2 text-xs text-ink-500">
        <Info size={14} className="mt-px shrink-0" aria-hidden="true" />
        Las columnas de origen son de ejemplo mientras se conecta el análisis real del archivo.
      </p>

      {rows.length ? (
        <ul className="divide-y divide-ink-100 overflow-hidden rounded-lg border border-ink-200">
          {rows.map((row) => (
            <MappingRow
              key={row.column.id}
              row={row}
              detectedColumns={sampleDetectedColumns}
              onChange={onChange}
              onConfirm={onConfirm}
            />
          ))}
        </ul>
      ) : (
        <div className="flex flex-col items-center rounded-lg border border-mint-100 bg-mint-50 px-4 py-8 text-center">
          <CheckCircle2 className="text-mint-600" size={24} aria-hidden="true" />
          <p className="mt-2 text-sm font-semibold text-ink-900">No quedan campos pendientes</p>
          <p className="mt-1 text-sm text-ink-500">Puedes continuar a la revisión.</p>
        </div>
      )}
    </Panel>
  );
}

function ReviewStep({ file, template, evaluation, submitted }) {
  return (
    <Panel title="Revisión" description="Así se construirá el archivo final. Vuelve a cualquier paso si necesitas corregir algo.">
      <dl className="grid gap-3 sm:grid-cols-3">
        <div className="min-w-0 rounded-md border border-ink-200 bg-ink-50 p-3">
          <dt className="text-xs font-medium text-ink-500">Archivo</dt>
          <dd className="mt-1 truncate text-sm font-semibold text-ink-900">{file.name}</dd>
          <dd className="text-xs text-ink-500">{formatFileSize(file.size)}</dd>
        </div>
        <div className="min-w-0 rounded-md border border-ink-200 bg-ink-50 p-3">
          <dt className="text-xs font-medium text-ink-500">Plantilla</dt>
          <dd className="mt-1 truncate text-sm font-semibold text-ink-900">{template.name}</dd>
          <dd className="text-xs text-ink-500">Hoja «{template.output.sheetName}»</dd>
        </div>
        <div className="min-w-0 rounded-md border border-ink-200 bg-ink-50 p-3">
          <dt className="text-xs font-medium text-ink-500">Campos</dt>
          <dd className="mt-1 text-sm font-semibold text-ink-900">{evaluation.counts.ok}/{evaluation.counts.total} listos</dd>
          <dd className="text-xs text-ink-500">
            {pluralize(evaluation.rows.filter((row) => row.entry.type === 'EMPTY').length, 'columna vacía', 'columnas vacías')}
          </dd>
        </div>
      </dl>

      <h3 className="mb-2 mt-6 text-sm font-semibold text-ink-900">Columnas del archivo final</h3>
      <div className="overflow-x-auto rounded-lg border border-ink-200">
        <table className="w-full min-w-[480px] text-left text-sm">
          <thead className="bg-ink-50 text-xs text-ink-500">
            <tr>
              <th scope="col" className="w-10 px-3 py-2 font-medium">#</th>
              <th scope="col" className="px-3 py-2 font-medium">Columna</th>
              <th scope="col" className="px-3 py-2 font-medium">Origen</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {evaluation.rows.map(({ column, entry }) => (
              <tr key={column.id}>
                <td className="px-3 py-2 tabular-nums text-ink-400">{column.position}</td>
                <td className="px-3 py-2 font-medium text-ink-900">{column.outputName}</td>
                <td className="px-3 py-2 text-ink-700">{describeSource(entry) || entry.column}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {submitted ? (
        <div role="status" className="mt-5 flex items-start gap-2 rounded-md border border-mint-100 bg-mint-50 px-3 py-2 text-sm text-mint-600">
          <CheckCircle2 size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>
            <span className="font-semibold">Configuración lista.</span>{' '}
            El envío al procesamiento se habilitará cuando el servidor esté conectado.
          </span>
        </div>
      ) : null}
    </Panel>
  );
}

function ContextPanel({ currentStep, file, template, evaluation }) {
  return (
    <aside className="flex flex-col gap-4 lg:sticky lg:top-4 lg:self-start">
      <section className="rounded-lg border border-ink-200 bg-white p-4 shadow-panel">
        <h2 className="text-sm font-semibold text-ink-900">Resumen</h2>
        <dl className="mt-3 space-y-3 text-sm">
          <div>
            <dt className="text-xs text-ink-500">Archivo</dt>
            <dd className="truncate font-medium text-ink-900">{file ? file.name : <span className="text-ink-400">Sin seleccionar</span>}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-500">Plantilla</dt>
            <dd className="truncate font-medium text-ink-900">{template ? template.name : <span className="text-ink-400">Sin seleccionar</span>}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-500">Mapeo</dt>
            <dd className="mt-1 flex flex-wrap gap-1.5">
              {file ? (
                <>
                  <StatusPill value={MAPPING_STATUS.OK} label={`${evaluation.counts.ok} listos`} />
                  {evaluation.counts.pending ? <StatusPill value={MAPPING_STATUS.REQUIERE_CONFIRMACION} label={`${evaluation.counts.pending} por confirmar`} /> : null}
                  {evaluation.counts.missing ? <StatusPill value={MAPPING_STATUS.FALTANTE} label={`${evaluation.counts.missing} sin origen`} /> : null}
                </>
              ) : <span className="text-ink-400">Disponible al subir un archivo</span>}
            </dd>
          </div>
        </dl>
      </section>

      <section className="rounded-lg border border-cobalt-100 bg-cobalt-50 p-4 text-sm text-ink-700">
        <p className="flex items-center gap-2 font-semibold text-cobalt-700">
          <Info size={16} aria-hidden="true" />
          {steps[currentStep].label}
        </p>
        <p className="mt-2 leading-6">{stepTips[currentStep]}</p>
      </section>

      <p className="flex items-start gap-2 px-1 text-xs leading-5 text-ink-500">
        <ShieldCheck size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
        Tus archivos son temporales: se eliminan tras la descarga o, como máximo, en 24 horas.
      </p>
    </aside>
  );
}

function WizardFooter({ currentStep, blockedReason, submitted, onBack, onPrimary }) {
  const isLastStep = currentStep === steps.length - 1;

  return (
    <div className="sticky bottom-0 mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-ink-200 bg-canvas/95 py-3 backdrop-blur">
      {currentStep > 0 ? (
        <button
          type="button"
          className="inline-flex h-10 items-center gap-2 rounded-md border border-ink-200 bg-white px-3 text-sm font-semibold text-ink-700 hover:bg-ink-50"
          onClick={onBack}
        >
          <ArrowLeft size={16} aria-hidden="true" />
          Volver
        </button>
      ) : <span />}
      <div className="flex min-w-0 flex-1 items-center justify-end gap-3">
        {blockedReason ? (
          <p id="primary-blocked-reason" className="min-w-0 text-right text-xs text-ink-500 sm:text-sm">{blockedReason}</p>
        ) : null}
        <button
          type="button"
          className="inline-flex h-10 shrink-0 items-center gap-2 rounded-md bg-cobalt-600 px-4 text-sm font-semibold text-white hover:bg-cobalt-700 disabled:cursor-not-allowed disabled:bg-ink-200 disabled:text-ink-500"
          disabled={Boolean(blockedReason)}
          aria-describedby={blockedReason ? 'primary-blocked-reason' : undefined}
          onClick={onPrimary}
        >
          {getPrimaryLabel(currentStep, submitted)}
          {isLastStep ? <Check size={16} aria-hidden="true" /> : <ArrowRight size={16} aria-hidden="true" />}
        </button>
      </div>
    </div>
  );
}

export default function HomePage() {
  const [currentStep, setCurrentStep] = useState(0);
  const [file, setFile] = useState(null);
  const [fileError, setFileError] = useState('');
  const [templateId, setTemplateId] = useState(templates[0].id);
  const [mapping, setMapping] = useState(() => createInitialMapping(templates[0].columns, sampleDetectedColumns));
  const [confirmedIds, setConfirmedIds] = useState(() => new Set());
  const [submitted, setSubmitted] = useState(false);
  const hasMounted = useRef(false);

  const template = getTemplate(templateId);
  const evaluation = useMemo(
    () => evaluateMapping(template.columns, mapping, confirmedIds),
    [template, mapping, confirmedIds]
  );
  const blockedReason = getBlockedReason({ currentStep, file, template, evaluation, submitted });

  useEffect(() => {
    // Move focus to the new step heading so keyboard and screen reader users follow the wizard.
    if (!hasMounted.current) {
      hasMounted.current = true;
      return;
    }
    document.querySelector('[data-step-heading]')?.focus();
  }, [currentStep]);

  function resetMapping(nextTemplate) {
    setMapping(createInitialMapping(nextTemplate.columns, sampleDetectedColumns));
    setConfirmedIds(new Set());
    setSubmitted(false);
  }

  function handleFile(selected) {
    const error = validateExcelFile(selected);
    setFileError(error || '');
    if (error) return;
    setFile({ name: selected.name, size: selected.size });
    resetMapping(template);
  }

  function handleTemplate(nextTemplateId) {
    if (nextTemplateId === templateId) return;
    setTemplateId(nextTemplateId);
    resetMapping(getTemplate(nextTemplateId));
  }

  function handleMappingChange(column, detectedColumn) {
    setMapping((current) => ({ ...current, [column.id]: updateMappingEntry(column, detectedColumn) }));
    setConfirmedIds((current) => {
      const next = new Set(current);
      next.delete(column.id);
      return next;
    });
    setSubmitted(false);
  }

  function handleConfirm(columnId) {
    setConfirmedIds((current) => new Set(current).add(columnId));
    setSubmitted(false);
  }

  function handlePrimaryAction() {
    if (blockedReason) return;
    if (currentStep === steps.length - 1) {
      setSubmitted(true);
      return;
    }
    setCurrentStep((step) => step + 1);
  }

  return (
    <Shell>
      <div className="mx-auto max-w-6xl">
        <div className="mb-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-cobalt-600">Nuevo job</p>
          <h1 className="mt-1 text-2xl font-semibold text-ink-900">Transformar archivo Excel</h1>
          <p className="mt-2 max-w-2xl text-sm text-ink-500">
            Convierte tu Excel al formato de una plantilla previsional en tres pasos. Nada se procesa hasta que confirmes.
          </p>
        </div>

        <Stepper currentStep={currentStep} onSelect={setCurrentStep} />

        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0">
            {currentStep === 0 ? (
              <SourceStep
                file={file}
                fileError={fileError}
                onFile={handleFile}
                templateId={templateId}
                onTemplate={handleTemplate}
              />
            ) : null}
            {currentStep === 1 ? (
              <MappingStep evaluation={evaluation} onChange={handleMappingChange} onConfirm={handleConfirm} />
            ) : null}
            {currentStep === 2 ? (
              <ReviewStep file={file} template={template} evaluation={evaluation} submitted={submitted} />
            ) : null}

            <WizardFooter
              currentStep={currentStep}
              blockedReason={blockedReason}
              submitted={submitted}
              onBack={() => setCurrentStep((step) => Math.max(0, step - 1))}
              onPrimary={handlePrimaryAction}
            />
          </div>

          <ContextPanel currentStep={currentStep} file={file} template={template} evaluation={evaluation} />
        </div>
      </div>
    </Shell>
  );
}

'use client';

import { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, FileSpreadsheet, FileUp, Info, Link2, Wand2 } from 'lucide-react';
import { Shell } from '../components/shell';

const steps = [
  { id: 'file', label: 'Archivo' },
  { id: 'template', label: 'Plantilla' },
  { id: 'mapping', label: 'Mapeo' },
  { id: 'create', label: 'Crear' }
];

const expectedColumns = [
  { name: 'RUT', required: true, suggestion: 'RUT' },
  { name: 'APELLIDO PATERNO', required: true, suggestion: 'Nombre completo' },
  { name: 'APELLIDO MATERNO', required: true, suggestion: 'Nombre completo' },
  { name: 'NOMBRE', required: true, suggestion: 'Nombre completo' },
  { name: 'N.º LICENCIA', required: false, suggestion: '' },
  { name: 'PERIODO', required: true, suggestion: 'Periodo' },
  { name: 'FEC. INICIO', required: true, suggestion: 'Fecha Inicio' },
  { name: 'FEC. FIN', required: true, suggestion: 'Fecha Termino' },
  { name: 'DIAS LICENCIA', required: true, suggestion: 'dias_licencia' },
  { name: 'IMPONIBLE', required: true, suggestion: 'Remuneracion' },
  { name: 'TOTAL', required: true, suggestion: 'total_aporte_afp' }
];

const detectedColumns = [
  'RUT',
  'Nombre completo',
  'Remuneracion',
  'Periodo',
  'Fecha Inicio',
  'Fecha Termino',
  'AFP',
  'dias_licencia',
  'total_aporte_afp'
];

function Stepper({ currentStep }) {
  return (
    <ol className="grid grid-cols-4 gap-2">
      {steps.map((step, index) => {
        const isActive = index === currentStep;
        const isDone = index < currentStep;

        return (
          <li key={step.id} className="min-w-0">
            <div className={`flex h-10 items-center gap-2 rounded-md border px-3 text-sm font-semibold ${
              isActive
                ? 'border-cobalt-500 bg-cobalt-50 text-cobalt-700'
                : isDone
                  ? 'border-mint-100 bg-mint-50 text-mint-600'
                  : 'border-ink-200 bg-white text-ink-500'
            }`}>
              <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs ${
                isDone ? 'bg-mint-600 text-white' : isActive ? 'bg-cobalt-600 text-white' : 'bg-ink-100 text-ink-500'
              }`}>
                {isDone ? <Check size={13} aria-hidden="true" /> : index + 1}
              </span>
              <span className="truncate">{step.label}</span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function Panel({ title, description, children }) {
  return (
    <section className="rounded-lg border border-ink-200 bg-white shadow-panel">
      <div className="border-b border-ink-100 px-5 py-4">
        <h2 className="text-base font-semibold text-ink-900">{title}</h2>
        {description ? <p className="mt-1 text-sm text-ink-500">{description}</p> : null}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function HelpPanel({ currentStep }) {
  const messages = [
    {
      title: 'Primero recibimos el Excel',
      text: 'En esta etapa solo elegimos el archivo. El analisis real debe ocurrir en el backend para mantener el procesamiento efimero.'
    },
    {
      title: 'Luego elegimos el destino',
      text: 'La plantilla define columnas, orden, formatos y validaciones. PlanVital PAGEX es la primera plantilla real.'
    },
    {
      title: 'Aqui acompanamos el mapeo',
      text: 'El usuario confirma sugerencias y resuelve campos faltantes. Si algo no es deterministico, no lo escondemos.'
    },
    {
      title: 'Finalmente creamos el archivo',
      text: 'La transformacion completa se encola, muestra progreso real y elimina temporales despues de descargar o expirar.'
    }
  ];
  const message = messages[currentStep];

  return (
    <aside className="rounded-lg border border-ink-200 bg-ink-900 p-5 text-white shadow-panel">
      <div className="flex h-9 w-9 items-center justify-center rounded-md bg-white/10">
        <Info size={18} aria-hidden="true" />
      </div>
      <h2 className="mt-4 text-base font-semibold">{message.title}</h2>
      <p className="mt-2 text-sm leading-6 text-white/72">{message.text}</p>
    </aside>
  );
}

function FileStep({ fileName, setFileName }) {
  return (
    <Panel
      title="Subir archivo"
      description="Selecciona el Excel que sera analizado. Todavia no guardamos filas ni mostramos datos sensibles."
    >
      <label className="flex min-h-44 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-ink-300 bg-ink-50 px-5 text-center hover:border-cobalt-500 hover:bg-cobalt-50/50">
        <input
          className="sr-only"
          type="file"
          accept=".xlsx"
          onChange={(event) => setFileName(event.target.files?.[0]?.name || '')}
        />
        <span className="flex h-11 w-11 items-center justify-center rounded-md bg-white text-cobalt-600 ring-1 ring-ink-200">
          <FileUp size={22} aria-hidden="true" />
        </span>
        <span className="mt-3 text-sm font-semibold text-ink-900">
          {fileName || 'Elegir archivo .xlsx'}
        </span>
        <span className="mt-1 text-xs text-ink-500">Retencion temporal menor a 24 horas.</span>
      </label>
    </Panel>
  );
}

function TemplateStep({ template, setTemplate }) {
  return (
    <Panel
      title="Seleccionar plantilla"
      description="Elige el formato de salida. La plantilla es persistente; el Excel es transitorio."
    >
      <button
        className={`flex w-full items-start gap-3 rounded-lg border p-4 text-left ${
          template === 'planvital-pagex' ? 'border-cobalt-500 bg-cobalt-50' : 'border-ink-200 bg-white hover:bg-ink-50'
        }`}
        onClick={() => setTemplate('planvital-pagex')}
      >
        <FileSpreadsheet className="mt-0.5 text-cobalt-600" size={20} aria-hidden="true" />
        <span>
          <span className="block text-sm font-semibold text-ink-900">PlanVital PAGEX</span>
          <span className="mt-1 block text-sm text-ink-500">Primera plantilla real para validar el motor generico.</span>
        </span>
      </button>
    </Panel>
  );
}

function MappingStep({ mapping, setMapping }) {
  const missingRequired = useMemo(() => {
    return expectedColumns.filter((column) => column.required && !mapping[column.name]).length;
  }, [mapping]);

  return (
    <Panel
      title="Mapear columnas"
      description="Confirma las sugerencias. Los campos ambiguos quedan visibles para revision antes de crear el archivo."
    >
      <div className="mb-4 flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700">
        <Wand2 size={16} aria-hidden="true" />
        {missingRequired === 0 ? 'Todos los campos requeridos tienen origen.' : `${missingRequired} campo(s) requerido(s) aun sin origen.`}
      </div>

      <div className="divide-y divide-ink-100 rounded-lg border border-ink-200">
        {expectedColumns.map((column) => {
          const selectId = `mapping-${column.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

          return (
          <div key={column.name} className="grid gap-3 p-3 md:grid-cols-[220px_1fr] md:items-center">
            <div>
              <label htmlFor={selectId} className="text-sm font-semibold text-ink-900">{column.name}</label>
              <p className="text-xs text-ink-500">{column.required ? 'Requerido' : 'Opcional'}</p>
            </div>
            <div className="flex items-center gap-2">
              <Link2 size={16} className="text-ink-400" aria-hidden="true" />
              <select
                id={selectId}
                className="h-10 min-w-0 flex-1 rounded-md border border-ink-200 bg-white px-3 text-sm text-ink-900"
                value={mapping[column.name] || ''}
                onChange={(event) => setMapping((current) => ({ ...current, [column.name]: event.target.value }))}
              >
                <option value="">Sin origen</option>
                {detectedColumns.map((detected) => (
                  <option key={detected} value={detected}>{detected}</option>
                ))}
              </select>
            </div>
          </div>
          );
        })}
      </div>
    </Panel>
  );
}

function CreateStep({ fileName, template, mapping }) {
  const mappedCount = Object.values(mapping).filter(Boolean).length;

  return (
    <Panel
      title="Crear archivo"
      description="Resumen antes de enviar el job. El siguiente paso tecnico es conectar este wizard a upload, analisis y BullMQ."
    >
      <dl className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-md border border-ink-200 bg-ink-50 p-3">
          <dt className="text-xs font-medium text-ink-500">Archivo</dt>
          <dd className="mt-1 truncate text-sm font-semibold text-ink-900">{fileName || 'Pendiente'}</dd>
        </div>
        <div className="rounded-md border border-ink-200 bg-ink-50 p-3">
          <dt className="text-xs font-medium text-ink-500">Plantilla</dt>
          <dd className="mt-1 text-sm font-semibold text-ink-900">{template ? 'PlanVital PAGEX' : 'Pendiente'}</dd>
        </div>
        <div className="rounded-md border border-ink-200 bg-ink-50 p-3">
          <dt className="text-xs font-medium text-ink-500">Mapeos</dt>
          <dd className="mt-1 text-sm font-semibold text-ink-900">{mappedCount}/{expectedColumns.length}</dd>
        </div>
      </dl>

      <button
        className="mt-5 inline-flex h-11 items-center justify-center gap-2 rounded-md bg-ink-900 px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-ink-200"
        disabled={!fileName || !template}
      >
        <Check size={16} aria-hidden="true" />
        Crear job de transformacion
      </button>
    </Panel>
  );
}

export default function HomePage() {
  const [currentStep, setCurrentStep] = useState(0);
  const [fileName, setFileName] = useState('');
  const [template, setTemplate] = useState('planvital-pagex');
  const [mapping, setMapping] = useState(() => {
    return Object.fromEntries(expectedColumns.map((column) => [column.name, column.suggestion]));
  });

  const canContinue = currentStep === 0 ? Boolean(fileName) : currentStep === 1 ? Boolean(template) : true;

  return (
    <Shell>
      <div className="mx-auto max-w-6xl">
        <div className="mb-5">
          <p className="text-xs font-semibold uppercase text-cobalt-600">Nuevo archivo</p>
          <h1 className="mt-1 text-2xl font-semibold text-ink-900">Crear transformacion</h1>
          <p className="mt-2 max-w-2xl text-sm text-ink-500">
            Un flujo paso a paso para acompanar al usuario en el mapeo y generar el archivo final sin esconder decisiones ambiguas.
          </p>
        </div>

        <Stepper currentStep={currentStep} />

        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div>
            {currentStep === 0 ? <FileStep fileName={fileName} setFileName={setFileName} /> : null}
            {currentStep === 1 ? <TemplateStep template={template} setTemplate={setTemplate} /> : null}
            {currentStep === 2 ? <MappingStep mapping={mapping} setMapping={setMapping} /> : null}
            {currentStep === 3 ? <CreateStep fileName={fileName} template={template} mapping={mapping} /> : null}

            <div className="mt-4 flex items-center justify-between">
              <button
                className="inline-flex h-10 items-center gap-2 rounded-md border border-ink-200 bg-white px-3 text-sm font-semibold text-ink-700 disabled:cursor-not-allowed disabled:opacity-40"
                disabled={currentStep === 0}
                onClick={() => setCurrentStep((step) => Math.max(0, step - 1))}
              >
                <ArrowLeft size={16} aria-hidden="true" />
                Volver
              </button>
              <button
                className="inline-flex h-10 items-center gap-2 rounded-md bg-cobalt-600 px-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-ink-200"
                disabled={!canContinue || currentStep === steps.length - 1}
                onClick={() => setCurrentStep((step) => Math.min(steps.length - 1, step + 1))}
              >
                Continuar
                <ArrowRight size={16} aria-hidden="true" />
              </button>
            </div>
          </div>

          <HelpPanel currentStep={currentStep} />
        </div>
      </div>
    </Shell>
  );
}

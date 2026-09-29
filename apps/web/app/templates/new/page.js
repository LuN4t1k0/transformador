'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertCircle, ArrowLeft, Copy, FilePlus2, FileSpreadsheet, Loader2, PencilLine, Search, Sparkles } from 'lucide-react';
import { FileDropzone } from '../../../components/file-dropzone';
import { buttonStyles, Notice, Panel } from '../../../components/panel';
import { Shell } from '../../../components/shell';
import { TemplateWizard } from '../../../components/template-editor/template-wizard';
import { api } from '../../../lib/api';
import { validateExcelFile } from '../../../lib/file-validation';
import { createColumn, reviveSampleRows } from '../../../lib/template-editor';

const EMPTY_TEMPLATE = {
  name: '',
  description: '',
  destination: '',
  process: '',
  input: { headerRow: 1 },
  output: { format: 'XLSX', sheetName: 'DATOS' },
  columns: [createColumn([])]
};

const METHODS = [
  {
    id: 'example',
    icon: Sparkles,
    title: 'Desde un ejemplo',
    badge: 'Recomendado',
    description: 'Sube el Excel que recibes y, si lo tienes, un ejemplo del archivo que te piden. Deducimos columnas, orden y formatos.'
  },
  {
    id: 'from',
    icon: Copy,
    title: 'A partir de otra plantilla',
    description: 'Parte de una plantilla existente y cambia solo lo que es distinto, por ejemplo para otra entidad o servicio.'
  },
  {
    id: 'blank',
    icon: PencilLine,
    title: 'Desde cero',
    description: 'Define cada columna a mano.'
  }
];

function MethodChooser({ onChoose }) {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {METHODS.map(({ id, icon: Icon, title, badge, description }) => (
        <button
          key={id}
          type="button"
          className={`flex h-full flex-col items-start gap-2 rounded-lg border bg-white p-4 text-left shadow-panel hover:border-cobalt-500 ${id === 'example' ? 'border-cobalt-500' : 'border-ink-200'}`}
          onClick={() => onChoose(id)}
        >
          <span className="flex items-center gap-2">
            <Icon size={18} className="text-cobalt-600" aria-hidden="true" />
            <span className="text-sm font-semibold text-ink-900">{title}</span>
          </span>
          {badge ? <span className="rounded-full bg-cobalt-50 px-2 text-xs font-semibold text-cobalt-700">{badge}</span> : null}
          <span className="text-sm text-ink-500">{description}</span>
        </button>
      ))}
    </div>
  );
}

// Shows which sheet of each example was used and lets the user pick another one (re-runs the inference).
function ExampleSources({ examples, onChangeSheet, isBusy }) {
  const { draft } = examples;
  const item = (kind, label) => {
    const info = draft[kind];
    if (!info) return null;
    return (
      <label className="flex min-w-0 flex-1 basis-64 flex-col text-xs text-ink-500">
        {label}: <span className="truncate font-medium text-ink-900">{info.fileName}</span>
        <select className="mt-1 h-9 rounded-md border border-ink-200 bg-white px-2 text-sm text-ink-900" value={info.sheet} disabled={isBusy} onChange={(event) => onChangeSheet(kind, event.target.value)}>
          {info.sheets.map((sheet) => <option key={sheet.name} value={sheet.name}>Hoja «{sheet.name}» · {sheet.rowCount} filas · {sheet.columnCount} columnas</option>)}
        </select>
      </label>
    );
  };
  return (
    <div className="flex flex-wrap items-end gap-3">
      {item('input', 'Excel que recibes')}
      {item('output', 'Ejemplo del destino')}
      {isBusy ? <Loader2 size={18} className="mb-2 animate-spin text-cobalt-600" aria-hidden="true" /> : null}
    </div>
  );
}

function ExampleStep({ onDraft }) {
  const [input, setInput] = useState(null);
  const [output, setOutput] = useState(null);
  const [errors, setErrors] = useState({ input: '', output: '' });
  const [state, setState] = useState({ loading: false, error: null });

  function pick(kind, setter) {
    return (file) => {
      const error = validateExcelFile(file);
      setErrors((current) => ({ ...current, [kind]: error || '' }));
      if (!error) setter(file);
    };
  }

  async function submit() {
    setState({ loading: true, error: null });
    try {
      onDraft(await api.createTemplateDraft({ input, output }), { input, output });
    } catch (error) {
      setState({ loading: false, error });
    }
  }

  return (
    <Panel title="Sube tus ejemplos" description="Los archivos solo se usan para preparar la plantilla: no se guardan.">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <h3 className="mb-1 text-sm font-semibold text-ink-900">1. El Excel que recibes</h3>
          <p className="mb-2 text-xs text-ink-500">Tal como te llega (por ejemplo, el reporte de licencias). Sus columnas serán el origen.</p>
          <FileDropzone file={input} error={errors.input} onFile={pick('input', setInput)} />
        </div>
        <div>
          <h3 className="mb-1 text-sm font-semibold text-ink-900">2. Ejemplo del archivo que te piden <span className="font-normal text-ink-500">(opcional)</span></h3>
          <p className="mb-2 text-xs text-ink-500">Un archivo ya hecho en el formato del destino. Si incluye algunas de las mismas filas del Excel anterior (por ejemplo, las mismas personas por su RUT), deducimos cada columna comparando fila a fila; si no, sugerimos por nombres de columna.</p>
          <FileDropzone file={output} error={errors.output} onFile={pick('output', setOutput)} />
        </div>
      </div>
      {state.error ? <div className="mt-4"><Notice tone="danger" icon={AlertCircle} role="alert">{state.error.message}</Notice></div> : null}
      <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
        {!input && !output ? <p className="text-sm text-ink-500">Sube al menos uno de los dos archivos.</p> : null}
        <button type="button" className={buttonStyles.primary} disabled={(!input && !output) || state.loading} onClick={submit}>
          {state.loading ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Sparkles size={16} aria-hidden="true" />}
          {state.loading ? 'Analizando ejemplos…' : 'Preparar plantilla'}
        </button>
      </div>
    </Panel>
  );
}

function BaseTemplatePicker({ onPick }) {
  const [templates, setTemplates] = useState(null);
  const [query, setQuery] = useState('');
  const [loadingId, setLoadingId] = useState(null);

  useEffect(() => {
    api.listTemplates().then(setTemplates).catch(() => setTemplates([]));
  }, []);

  const visible = useMemo(() => {
    const text = query.trim().toLowerCase();
    return (templates || []).filter((t) => !text || `${t.name} ${t.destination} ${t.process}`.toLowerCase().includes(text));
  }, [templates, query]);

  return (
    <Panel title="¿De qué plantilla partimos?" description="Se crea una plantilla nueva; la original no cambia.">
      <label className="relative mb-3 block">
        <span className="sr-only">Buscar plantilla</span>
        <Search size={15} className="pointer-events-none absolute left-2.5 top-2.5 text-ink-400" aria-hidden="true" />
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nombre, destino o proceso" className="h-9 w-full rounded-md border border-ink-200 bg-white pl-8 pr-2 text-sm" />
      </label>
      {!templates ? <p className="flex items-center gap-2 text-sm text-ink-500"><Loader2 size={16} className="animate-spin" aria-hidden="true" />Cargando…</p> : null}
      <div className="grid gap-2">
        {visible.map((template) => (
          <button
            key={template.id}
            type="button"
            disabled={Boolean(loadingId)}
            className="flex items-start gap-3 rounded-lg border border-ink-200 bg-white p-3 text-left hover:border-cobalt-500"
            onClick={async () => {
              setLoadingId(template.id);
              onPick(await api.getTemplate(template.id));
            }}
          >
            {loadingId === template.id ? <Loader2 size={18} className="mt-0.5 animate-spin text-cobalt-600" aria-hidden="true" /> : <FileSpreadsheet size={18} className="mt-0.5 text-cobalt-600" aria-hidden="true" />}
            <span>
              <span className="block text-sm font-semibold text-ink-900">{template.name} <span className="font-normal text-ink-500">v{template.version}</span></span>
              <span className="block text-xs text-ink-500">{[template.destination, template.process].filter(Boolean).join(' · ') || 'Sin clasificar'} · {template.columnCount} columnas</span>
            </span>
          </button>
        ))}
      </div>
    </Panel>
  );
}

function fromBase(base) {
  return {
    ...base.configuration,
    name: `${base.name} (copia)`,
    description: base.description,
    destination: base.destination,
    process: base.process
  };
}

function NewTemplate() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromId = searchParams.get('from');
  const [method, setMethod] = useState(fromId ? 'from' : null);
  const [editor, setEditor] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [examples, setExamples] = useState(null);
  const [rerunning, setRerunning] = useState(false);

  function editorFromDraft(draft) {
    return {
      key: `example-${draft.input?.sheet}-${draft.output?.sheet}-${Date.now()}`,
      initial: { ...draft.template, name: '' },
      report: { ...draft.report, ignored: draft.output?.ignoredHeaders || [] },
      note: draft.output ? `Deducida de «${draft.input?.fileName || '—'}» y del ejemplo «${draft.output.fileName}».` : `Creada desde los encabezados de «${draft.input.fileName}».`,
      sample: draft.input ? { fileName: draft.input.fileName, sheet: draft.input.sheet, headers: draft.input.headers, rows: reviveSampleRows(draft.input.sampleRows), exampleRows: draft.input.exampleRows, percentHeaders: draft.input.percentHeaders || [] } : null,
      outputExample: draft.output?.exampleRows ? { fileName: draft.output.fileName, headers: draft.output.headers, rows: draft.output.exampleRows, percentHeaders: draft.output.percentHeaders || [] } : null
    };
  }

  async function changeExampleSheet(kind, sheet) {
    setRerunning(true);
    try {
      const sheets = { inputSheet: examples.draft.input?.sheet, outputSheet: examples.draft.output?.sheet, [`${kind}Sheet`]: sheet };
      const draft = await api.createTemplateDraft({ ...examples.files, ...sheets });
      setExamples({ ...examples, draft });
      setEditor(editorFromDraft(draft));
    } catch (error) {
      setLoadError(error);
    } finally {
      setRerunning(false);
    }
  }

  useEffect(() => {
    if (!fromId) return;
    api.getTemplate(fromId).then((base) => setEditor({ initial: fromBase(base), note: `Basada en «${base.name}» v${base.version}. Cambia lo necesario y guárdala con otro nombre.` })).catch(setLoadError);
  }, [fromId]);

  async function save(template) {
    const created = await api.createTemplate(template);
    router.push(`/templates/${created.id}`);
  }

  let body;
  if (loadError) body = <Notice tone="danger" icon={AlertCircle} role="alert">{loadError.message}</Notice>;
  else if (editor) {
    body = (
      <>
        <TemplateWizard
          key={editor.key || 'editor'}
          initial={editor.initial}
          initialSample={editor.sample}
          outputExample={editor.outputExample || null}
          report={editor.report}
          note={editor.note}
          files={examples ? <ExampleSources examples={examples} isBusy={rerunning} onChangeSheet={changeExampleSheet} /> : null}
          onSubmit={save}
        />
      </>
    );
  } else if (method === 'example') {
    body = (
      <ExampleStep
        onDraft={(draft, files) => {
          setExamples({ files, draft });
          setEditor(editorFromDraft(draft));
        }}
      />
    );
  } else if (method === 'from') {
    body = fromId ? <p className="flex items-center gap-2 text-sm text-ink-500"><Loader2 size={16} className="animate-spin" aria-hidden="true" />Cargando plantilla…</p> : (
      <BaseTemplatePicker onPick={(base) => setEditor({ key: base.id, initial: fromBase(base), note: `Basada en «${base.name}» v${base.version}. Cambia lo necesario y guárdala con otro nombre.` })} />
    );
  } else if (method === 'blank') {
    body = <TemplateWizard initial={EMPTY_TEMPLATE} onSubmit={save} />;
  } else {
    body = <MethodChooser onChoose={setMethod} />;
  }

  return (
    <div className="mx-auto max-w-6xl">
      <Link href="/templates" className="inline-flex items-center gap-1 text-sm font-medium text-ink-500 hover:text-ink-900">
        <ArrowLeft size={15} aria-hidden="true" />
        Plantillas
      </Link>
      <div className="mb-5 mt-3 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-ink-900">Nueva plantilla</h1>
        {method || editor ? (
          <button type="button" className="inline-flex items-center gap-1 text-sm font-medium text-cobalt-700 hover:underline" onClick={() => { setMethod(null); setEditor(null); setExamples(null); if (fromId) router.replace('/templates/new'); }}>
            <FilePlus2 size={15} aria-hidden="true" />
            Elegir otra forma de crearla
          </button>
        ) : null}
      </div>
      {body}
    </div>
  );
}

export default function NewTemplatePage() {
  return (
    <Shell>
      <Suspense fallback={null}>
        <NewTemplate />
      </Suspense>
    </Shell>
  );
}

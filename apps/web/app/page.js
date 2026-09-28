import { AlertTriangle, CheckCircle2, ChevronDown, Download, FileUp, Play, RefreshCcw, ShieldCheck } from 'lucide-react';
import { Shell } from '../components/shell';
import { StatusPill } from '../components/status-pill';
import { columns, job, mappings, previewRows, sheets, validation } from '../lib/mock-data';

function Panel({ title, action, children }) {
  return (
    <section className="rounded-lg border border-ink-200 bg-white shadow-panel">
      <div className="flex min-h-12 items-center justify-between border-b border-ink-100 px-4">
        <h2 className="text-sm font-semibold text-ink-900">{title}</h2>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function Metric({ label, value, tone = 'default' }) {
  const toneClass = tone === 'success' ? 'text-mint-600' : tone === 'warning' ? 'text-amber-700' : 'text-ink-900';
  return (
    <div className="min-w-0 rounded-md border border-ink-200 bg-ink-50 px-3 py-2">
      <p className="truncate text-xs font-medium text-ink-500">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
}

function DataTable({ minWidth, headers, rows, renderRow }) {
  return (
    <div className="overflow-x-auto">
      <table className={`w-full ${minWidth} border-separate border-spacing-0 text-sm`}>
        <thead>
          <tr className="text-left text-xs font-semibold uppercase text-ink-500">
            {headers.map((header) => (
              <th key={header} className="border-b border-ink-200 pb-2">{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>{rows.map(renderRow)}</tbody>
      </table>
    </div>
  );
}

function UploadPanel() {
  return (
    <Panel
      title="Archivo"
      action={<StatusPill value={job.status} />}
    >
      <div className="grid gap-4 lg:grid-cols-[1fr_220px]">
        <label className="flex min-h-32 cursor-pointer flex-col justify-center rounded-lg border border-dashed border-ink-300 bg-ink-50 px-5 hover:border-cobalt-500 hover:bg-cobalt-50/50">
          <input className="sr-only" type="file" accept=".xlsx" />
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-white text-cobalt-600 ring-1 ring-ink-200">
              <FileUp size={20} aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm font-semibold text-ink-900">{job.fileName}</p>
              <p className="text-xs text-ink-500">{job.fileSize} · expira {job.expiresAt}</p>
            </div>
          </div>
        </label>

        <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
          <button className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-cobalt-600 px-3 text-sm font-semibold text-white hover:bg-cobalt-700">
            <RefreshCcw size={16} aria-hidden="true" />
            Reanalizar
          </button>
          <button className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-ink-200 bg-white px-3 text-sm font-semibold text-ink-700 hover:bg-ink-50">
            <Download size={16} aria-hidden="true" />
            Descargar
          </button>
        </div>
      </div>
    </Panel>
  );
}

function SheetsPanel() {
  return (
    <Panel title="Hojas">
      <div className="grid gap-2">
        {sheets.map((sheet) => (
          <button
            key={sheet.name}
            className={`grid grid-cols-[1fr_auto] items-center rounded-md border px-3 py-2 text-left ${
              sheet.status === 'selected'
                ? 'border-cobalt-500 bg-cobalt-50'
                : 'border-ink-200 bg-white hover:bg-ink-50'
            }`}
          >
            <span>
              <span className="block text-sm font-semibold text-ink-900">{sheet.name}</span>
              <span className="text-xs text-ink-500">{sheet.range} · {sheet.rows} filas · {sheet.columns} columnas</span>
            </span>
            <ChevronDown size={16} className="text-ink-500" aria-hidden="true" />
          </button>
        ))}
      </div>
    </Panel>
  );
}

function ColumnsTable() {
  return (
    <Panel title="Analisis de columnas">
      <DataTable
        minWidth="min-w-[760px]"
        headers={['Encabezado', 'Fisico', 'Semantico', 'Conf.', 'Evidencia']}
        rows={columns}
        renderRow={(column) => (
          <tr key={column.header} className="border-b border-ink-100">
            <td className="border-b border-ink-100 py-2.5 font-medium text-ink-900">{column.header}</td>
            <td className="border-b border-ink-100 py-2.5 text-ink-700">{column.physical}</td>
            <td className="border-b border-ink-100 py-2.5 text-ink-700">{column.semantic}</td>
            <td className="border-b border-ink-100 py-2.5 text-ink-700">{column.confidence}</td>
            <td className="border-b border-ink-100 py-2.5 text-ink-500">{column.evidence}</td>
          </tr>
        )}
      />
    </Panel>
  );
}

function MappingTable() {
  return (
    <Panel
      title="Mapping PlanVital PAGEX"
      action={<button className="h-8 rounded-md border border-ink-200 bg-white px-3 text-xs font-semibold text-ink-700 hover:bg-ink-50">Nueva version</button>}
    >
      <DataTable
        minWidth="min-w-[860px]"
        headers={['Salida', 'Origen', 'Tipo', 'Req.', 'Estado']}
        rows={mappings}
        renderRow={(mapping) => (
          <tr key={mapping.output}>
            <td className="border-b border-ink-100 py-2.5 font-medium text-ink-900">{mapping.output}</td>
            <td className="border-b border-ink-100 py-2.5 text-ink-700">{mapping.source}</td>
            <td className="border-b border-ink-100 py-2.5 text-ink-700">{mapping.type}</td>
            <td className="border-b border-ink-100 py-2.5 text-ink-700">{mapping.required ? 'Si' : 'No'}</td>
            <td className="border-b border-ink-100 py-2.5"><StatusPill value={mapping.state} /></td>
          </tr>
        )}
      />
    </Panel>
  );
}

function PreviewPanel() {
  return (
    <Panel title="Preview">
      <div className="space-y-2">
        {previewRows.map((row) => (
          <div key={`${row.column}-${row.input}`} className="grid gap-3 rounded-md border border-ink-200 bg-white p-3 lg:grid-cols-[1fr_1fr_180px]">
            <div className="min-w-0">
              <p className="text-xs font-medium text-ink-500">Entrada</p>
              <p className="truncate text-sm font-semibold text-ink-900">{row.input}</p>
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-ink-500">Salida</p>
              <p className="truncate text-sm font-semibold text-mint-600">{row.output}</p>
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-ink-500">{row.column}</p>
              <p className="truncate text-sm text-ink-700">{row.rule}</p>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function ValidationPanel() {
  return (
    <aside className="space-y-4">
      <Panel
        title="Progreso"
        action={<span className="text-xs font-semibold text-mint-600">{job.progress}%</span>}
      >
        <div className="h-2 rounded-full bg-ink-100">
          <div className="h-2 rounded-full bg-mint-600" style={{ width: `${job.progress}%` }} />
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          <Metric label="Filas" value={validation.rows} />
          <Metric label="Warnings" value={validation.warnings} tone="warning" />
          <Metric label="Errores" value={validation.errors} tone="success" />
        </div>
      </Panel>

      <Panel title="Validacion">
        <div className="mb-4 flex items-center gap-2 rounded-md bg-mint-50 px-3 py-2 text-sm font-medium text-mint-600">
          <ShieldCheck size={17} aria-hidden="true" />
          Modo {validation.mode}
        </div>
        <div className="space-y-2">
          {validation.items.map((item) => (
            <div key={`${item.column}-${item.code}`} className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-amber-700">
                <AlertTriangle size={15} aria-hidden="true" />
                {item.column}
              </div>
              <p className="mt-1 text-xs text-amber-700">{item.code} · {item.message}</p>
            </div>
          ))}
        </div>
      </Panel>

      <button className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-ink-900 px-4 text-sm font-semibold text-white hover:bg-ink-700">
        <Play size={16} aria-hidden="true" />
        Transformar
      </button>
      <button className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md border border-ink-200 bg-white px-4 text-sm font-semibold text-ink-700 hover:bg-ink-50">
        <CheckCircle2 size={16} aria-hidden="true" />
        Guardar plantilla
      </button>
    </aside>
  );
}

export default function HomePage() {
  return (
    <Shell>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase text-cobalt-600">Job {job.id}</p>
          <h1 className="mt-1 text-2xl font-semibold text-ink-900">Transformacion PAGEX</h1>
        </div>
        <div className="flex items-center gap-2 text-sm text-ink-500">
          <span className="h-2 w-2 rounded-full bg-mint-600" />
          Socket conectado
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <UploadPanel />
          <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
            <SheetsPanel />
            <ColumnsTable />
          </div>
          <MappingTable />
          <PreviewPanel />
        </div>
        <ValidationPanel />
      </div>
    </Shell>
  );
}

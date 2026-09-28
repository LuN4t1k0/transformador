import { FileSpreadsheet } from 'lucide-react';
import { Shell } from '../../components/shell';
import { describeSource, describeTransformations, templates } from '../../lib/templates';

export const metadata = { title: 'Plantillas · Previley Transformer' };

function sourceLabel(source) {
  return describeSource(source) || `Columna «${source.column}»`;
}

export default function TemplatesPage() {
  return (
    <Shell>
      <div className="mx-auto max-w-6xl">
        <div className="mb-5">
          <h1 className="text-2xl font-semibold text-ink-900">Plantillas</h1>
          <p className="mt-1 text-sm text-ink-500">Formatos de salida disponibles y la columna de origen que cada campo espera por defecto.</p>
        </div>

        <div className="space-y-5">
          {templates.map((template) => (
            <section key={template.id} className="rounded-lg border border-ink-200 bg-white shadow-panel">
              <div className="flex items-start gap-3 border-b border-ink-100 px-4 py-4 sm:px-5">
                <FileSpreadsheet className="mt-0.5 shrink-0 text-cobalt-600" size={20} aria-hidden="true" />
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-ink-900">{template.name}</h2>
                  <p className="mt-1 text-sm text-ink-500">{template.description}</p>
                  <p className="mt-1 text-xs text-ink-500">
                    Lee la hoja «{template.input.sheet}» · genera la hoja «{template.output.sheetName}» en .{template.output.format} · {template.columns.length} columnas
                  </p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="bg-ink-50 text-xs text-ink-500">
                    <tr>
                      <th scope="col" className="w-10 px-4 py-2 font-medium">#</th>
                      <th scope="col" className="px-4 py-2 font-medium">Columna</th>
                      <th scope="col" className="px-4 py-2 font-medium">Origen por defecto</th>
                      <th scope="col" className="px-4 py-2 font-medium">Transformaciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100">
                    {[...template.columns].sort((a, b) => a.position - b.position).map((column) => (
                      <tr key={column.id}>
                        <td className="px-4 py-2 tabular-nums text-ink-400">{column.position}</td>
                        <td className="px-4 py-2">
                          <span className="font-medium text-ink-900">{column.outputName}</span>
                          {column.required ? null : <span className="ml-2 text-xs text-ink-400">Opcional</span>}
                        </td>
                        <td className="px-4 py-2 text-ink-700">{sourceLabel(column.source)}</td>
                        <td className="px-4 py-2">
                          <span className="flex flex-wrap gap-1">
                            {describeTransformations(column).map((label) => (
                              <span key={label} className="rounded bg-ink-100 px-1.5 py-0.5 text-xs text-ink-700">{label}</span>
                            ))}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      </div>
    </Shell>
  );
}

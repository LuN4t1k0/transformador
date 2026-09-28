'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, FilePlus2, History, Loader2 } from 'lucide-react';
import { formatDateTime, JobStatusBadge } from '../../components/job-status';
import { buttonStyles, Notice } from '../../components/panel';
import { Shell } from '../../components/shell';
import { api } from '../../lib/api';
import { ReuseUploadButton } from '../../components/reuse-upload-button';

export default function JobsPage() {
  const [jobs, setJobs] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.listJobs().then(setJobs).catch(setError);
  }, []);

  return (
    <Shell>
      <div className="mx-auto max-w-6xl">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-ink-900">Historial</h1>
            <p className="mt-1 text-sm text-ink-500">Tus últimas conversiones. Solo guardamos datos del proceso, nunca el contenido de las filas.</p>
          </div>
          <Link href="/jobs/new" className={buttonStyles.primary}>
            <FilePlus2 size={16} aria-hidden="true" />
            Convertir archivo
          </Link>
        </div>

        {error ? (
          <Notice tone="danger" icon={AlertCircle} role="alert">No pudimos cargar el historial: {error.message}</Notice>
        ) : !jobs ? (
          <p className="flex items-center gap-2 text-sm text-ink-500">
            <Loader2 size={16} className="animate-spin" aria-hidden="true" />
            Cargando…
          </p>
        ) : jobs.length === 0 ? (
          <div className="flex flex-col items-center rounded-lg border border-dashed border-ink-300 bg-white px-4 py-12 text-center">
            <History className="text-ink-400" size={26} aria-hidden="true" />
            <p className="mt-2 text-sm font-semibold text-ink-900">Todavía no has convertido archivos</p>
            <p className="mt-1 text-sm text-ink-500">Sube un Excel para empezar.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-ink-200 bg-white shadow-panel">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-ink-50 text-xs text-ink-500">
                <tr>
                  <th scope="col" className="px-4 py-2.5 font-medium">Archivo</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Plantilla</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Estado</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Fecha</th>
                  <th scope="col" className="px-4 py-2.5 font-medium"><span className="sr-only">Acciones</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {jobs.map((job) => (
                  <tr key={job.id} className="hover:bg-ink-50">
                    <td className="max-w-xs px-4 py-3">
                      <Link href={`/jobs/${job.id}`} className="block truncate font-medium text-cobalt-700 hover:underline">{job.fileName}</Link>
                    </td>
                    <td className="px-4 py-3 text-ink-700">{job.template ? `${job.template.name} v${job.template.version}` : job.workingTemplate ? <span className="text-ink-500">Nueva, sin guardar</span> : <span className="text-ink-400">Sin elegir</span>}</td>
                    <td className="px-4 py-3"><JobStatusBadge status={job.status} /></td>
                    <td className="px-4 py-3 tabular-nums text-ink-500">{formatDateTime(job.createdAt)}</td>
                    <td className="px-4 py-3 text-right">
                      {job.workingTemplate ? (
                        <ReuseUploadButton reuseFromJobId={job.id} className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-semibold text-cobalt-700 hover:underline">Repetir con otro archivo</ReuseUploadButton>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Shell>
  );
}

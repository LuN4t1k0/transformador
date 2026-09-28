'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, CheckCircle2, Clock, Download, FileWarning, Loader2, Play, X } from 'lucide-react';
import { evaluateColumns } from '@previley-transformer/template-engine/src/mapping.js';
import { api } from '../../lib/api';
import { downloadBlob } from '../../lib/download';
import { validateExcelFile } from '../../lib/file-validation';
import { waitForJob } from '../../lib/wait-for-job';
import { buttonStyles } from '../panel';

const STATUS = {
  pending: { label: 'En espera', icon: Clock, className: 'text-ink-500' },
  uploading: { label: 'Subiendo…', icon: Loader2, className: 'text-cobalt-700', spin: true },
  analyzing: { label: 'Leyendo archivo…', icon: Loader2, className: 'text-cobalt-700', spin: true },
  generating: { label: 'Generando…', icon: Loader2, className: 'text-cobalt-700', spin: true },
  done: { label: 'Listo', icon: CheckCircle2, className: 'text-mint-600' },
  review: { label: 'Necesita revisión', icon: AlertCircle, className: 'text-amber-700' },
  error: { label: 'Error', icon: AlertCircle, className: 'text-rose-700' }
};

function isReadyToGenerate(job) {
  if (!job.selectedSheet || !job.workingTemplate) return false;
  const headers = job.sheets.find((sheet) => sheet.name === job.selectedSheet)?.headers || [];
  return evaluateColumns(job.workingTemplate.columns, headers, new Set(job.confirmedIds)).isComplete;
}

// Converts several files with the same template, one after another, so per-user limits are respected.
export function BatchConvert({ files, defaultTemplateId, onClose }) {
  const [templates, setTemplates] = useState(null);
  const [templateId, setTemplateId] = useState(defaultTemplateId || '');
  const [rows, setRows] = useState(() => files.map((file) => ({ file, status: validateExcelFile(file) ? 'error' : 'pending', message: validateExcelFile(file) || '', job: null })));
  const [running, setRunning] = useState(false);

  useEffect(() => {
    api.listTemplates().then((list) => {
      setTemplates(list);
      setTemplateId((current) => current || list[0]?.id || '');
    }).catch(() => setTemplates([]));
  }, []);

  function patch(index, changes) {
    setRows((current) => current.map((row, rowIndex) => (rowIndex === index ? { ...row, ...changes } : row)));
  }

  async function processRow(index) {
    const { file } = rows[index];
    try {
      patch(index, { status: 'uploading' });
      let job = await api.createJob({ file, templateId });
      patch(index, { status: 'analyzing', job });
      job = await waitForJob(job.id, (current) => current.status === 'READY');
      if (job.status !== 'READY') throw new Error(job.error?.message || 'No pudimos leer el archivo.');
      if (!isReadyToGenerate(job)) {
        patch(index, { status: 'review', job, message: job.selectedSheet ? 'Hay columnas por revisar.' : 'El archivo tiene varias hojas: elige cuál usar.' });
        return;
      }
      await api.transformJob(job.id, { mode: 'LENIENT' });
      patch(index, { status: 'generating', job });
      job = await waitForJob(job.id, (current) => ['READY_TO_DOWNLOAD', 'DOWNLOADED'].includes(current.status));
      if (!['READY_TO_DOWNLOAD', 'DOWNLOADED'].includes(job.status)) throw new Error(job.error?.message || 'No se pudo generar el archivo.');
      patch(index, { status: 'done', job, message: job.files?.rejectedRows ? `${job.files.rejectedRows} filas rechazadas` : '' });
    } catch (error) {
      patch(index, { status: 'error', message: error.message });
    }
  }

  async function start() {
    setRunning(true);
    for (let index = 0; index < rows.length; index += 1) {
      if (rows[index].status === 'pending') await processRow(index);
    }
    setRunning(false);
  }

  const doneRows = rows.filter((row) => row.status === 'done');
  const started = rows.some((row) => row.status !== 'pending' && row.status !== 'error') || running;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="min-w-0 flex-1 basis-64 text-xs font-medium text-ink-500">
          Convertir {files.length} archivos con la plantilla
          <select
            className="mt-1 h-10 w-full rounded-md border border-ink-200 bg-white px-2 text-sm text-ink-900"
            value={templateId}
            disabled={started || !templates}
            onChange={(event) => setTemplateId(event.target.value)}
          >
            {(templates || []).map((template) => <option key={template.id} value={template.id}>{template.name}{template.destination ? ` · ${template.destination}` : ''}</option>)}
          </select>
        </label>
        <div className="flex gap-2">
          {!started ? (
            <>
              <button type="button" className={buttonStyles.secondary} onClick={onClose}><X size={16} aria-hidden="true" />Cancelar</button>
              <button type="button" className={buttonStyles.primary} disabled={!templateId || !rows.some((row) => row.status === 'pending')} onClick={start}>
                <Play size={16} aria-hidden="true" />
                Convertir todos
              </button>
            </>
          ) : doneRows.length > 1 && !running ? (
            <button type="button" className={buttonStyles.primary} onClick={async () => { for (const row of doneRows) downloadBlob(await api.downloadJob(row.job.id)); }}>
              <Download size={16} aria-hidden="true" />
              Descargar todos ({doneRows.length})
            </button>
          ) : null}
        </div>
      </div>

      <ul className="divide-y divide-ink-100 rounded-lg border border-ink-200">
        {rows.map((row, index) => {
          const status = STATUS[row.status];
          const Icon = status.icon;
          return (
            <li key={`${row.file.name}-${index}`} className="flex flex-wrap items-center gap-3 px-3 py-2.5 text-sm">
              <span className="min-w-0 flex-1 basis-48 truncate font-medium text-ink-900">{row.file.name}</span>
              <span className={`inline-flex items-center gap-1.5 ${status.className}`}>
                <Icon size={15} className={status.spin ? 'animate-spin' : undefined} aria-hidden="true" />
                {status.label}
              </span>
              {row.message ? <span className="text-xs text-ink-500">{row.message}</span> : null}
              <span className="ml-auto flex gap-2">
                {row.status === 'done' ? (
                  <>
                    {row.job.files?.rejects ? (
                      <button type="button" className="inline-flex items-center gap-1 text-xs font-medium text-ink-700 hover:underline" onClick={async () => downloadBlob(await api.downloadJob(row.job.id, 'rejects'))}>
                        <FileWarning size={14} aria-hidden="true" />Rechazadas
                      </button>
                    ) : null}
                    <button type="button" className="inline-flex items-center gap-1 text-xs font-semibold text-cobalt-700 hover:underline" onClick={async () => downloadBlob(await api.downloadJob(row.job.id))}>
                      <Download size={14} aria-hidden="true" />Descargar
                    </button>
                  </>
                ) : null}
                {['review', 'error'].includes(row.status) && row.job ? (
                  <Link href={`/jobs/${row.job.id}`} className="text-xs font-semibold text-cobalt-700 hover:underline">Revisar</Link>
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>
      {rows.some((row) => row.status === 'review') ? (
        <p className="text-xs text-ink-500">Los archivos marcados «Necesita revisión» se abren para confirmar columnas. Si esto pasa siempre con la misma plantilla, guárdala en modo avanzado con las columnas confirmadas.</p>
      ) : null}
    </div>
  );
}

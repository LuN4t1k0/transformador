'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { api } from '../lib/api';
import { validateExcelFile } from '../lib/file-validation';

// Picks an Excel and starts a conversion that reuses an earlier configuration or a saved template.
export function ReuseUploadButton({ reuseFromJobId, templateId, className, icon: Icon, children }) {
  const router = useRouter();
  const inputId = useId();
  const [state, setState] = useState({ uploading: false, error: '' });

  async function handleFile(file) {
    const error = validateExcelFile(file);
    if (error) {
      setState({ uploading: false, error });
      return;
    }
    setState({ uploading: true, error: '' });
    try {
      const job = await api.createJob({ file, reuseFromJobId, templateId });
      router.push(`/jobs/${job.id}`);
    } catch (uploadError) {
      setState({ uploading: false, error: uploadError.message });
    }
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <label htmlFor={inputId} className={`${className} cursor-pointer ${state.uploading ? 'pointer-events-none opacity-60' : ''}`}>
        {state.uploading ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : Icon ? <Icon size={16} aria-hidden="true" /> : null}
        {state.uploading ? 'Subiendo…' : children}
      </label>
      <input
        id={inputId}
        type="file"
        className="sr-only"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) handleFile(file);
        }}
      />
      {state.error ? <span role="alert" className="text-xs text-rose-700">{state.error}</span> : null}
    </span>
  );
}

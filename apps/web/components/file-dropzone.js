'use client';

import { useState } from 'react';
import { AlertCircle, FileSpreadsheet, FileUp } from 'lucide-react';
import { formatFileSize, MAX_FILE_SIZE_BYTES } from '../lib/file-validation';

export function FileDropzone({ file, error, onFile }) {
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
            <span id="file-help" className="mt-1 text-xs text-ink-500">Solo .xlsx, hasta {formatFileSize(MAX_FILE_SIZE_BYTES)}.</span>
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

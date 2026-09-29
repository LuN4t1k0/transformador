'use client';

import { useState } from 'react';
import { AlertCircle, FileSpreadsheet, FileUp } from 'lucide-react';
import { formatFileSize, MAX_FILE_SIZE_BYTES } from '../lib/file-validation';

const COLUMN_LETTERS = Array.from({ length: 26 }, (_, index) => String.fromCharCode(65 + index));
const ROW_NUMBERS = Array.from({ length: 40 }, (_, index) => index + 1);

// `multiple` + `onFiles` accept several files at once; otherwise `onFile` receives a single file.
// `variant="sheet"` draws the drop area as an empty spreadsheet (the main upload of the home page).
export function FileDropzone({ file, error, onFile, multiple = false, onFiles, variant = 'box' }) {
  const [isDragging, setIsDragging] = useState(false);

  function handleDrop(event) {
    event.preventDefault();
    setIsDragging(false);
    const dropped = [...(event.dataTransfer.files || [])];
    if (multiple && dropped.length > 1) onFiles(dropped);
    else if (dropped[0]) onFile(dropped[0]);
  }

  if (variant === 'sheet') {
    return (
      <div>
        {/* Fills the rest of the screen below the page title: taller on desktop, still roomy on phones. */}
        <label
          className={`relative flex min-h-[360px] cursor-pointer flex-col overflow-hidden rounded-md border h-[calc(100dvh-19.5rem)] lg:h-[calc(100dvh-12.5rem)] ${isDragging ? 'border-cobalt-600' : error ? 'border-rose-200' : 'border-ink-200'}`}
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
            multiple={multiple}
            onChange={(event) => {
              const selected = [...(event.target.files || [])];
              event.target.value = '';
              if (multiple && selected.length > 1) onFiles(selected);
              else if (selected[0]) onFile(selected[0]);
            }}
          />
          <span aria-hidden="true" className="flex h-[26px] shrink-0 border-b border-ink-200 bg-ink-50 pl-[38px] font-mono text-[11px] text-ink-400">
            {COLUMN_LETTERS.map((letter) => <span key={letter} className="flex w-[112px] shrink-0 items-center justify-center border-r border-ink-100">{letter}</span>)}
          </span>
          <span aria-hidden="true" className="absolute bottom-0 left-0 top-[26px] flex w-[38px] flex-col border-r border-ink-200 bg-ink-50 font-mono text-[11px] text-ink-400">
            {ROW_NUMBERS.map((row) => <span key={row} className="flex h-[34px] shrink-0 items-center justify-end border-b border-ink-100 pr-2">{row}</span>)}
          </span>
          <span className="sheet-grid flex flex-1 items-center justify-center py-6 pl-[38px] pr-4">
            <span className={`mx-2 flex w-full max-w-xl flex-col items-center rounded-xl border-2 border-dashed bg-white/95 px-6 py-8 text-center sm:mx-6 sm:px-10 sm:py-12 ${isDragging ? 'border-cobalt-600 bg-cobalt-50' : 'border-cobalt-500'}`}>
              <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-cobalt-50 text-cobalt-600 [@media(max-height:720px)]:hidden" aria-hidden="true">
                <FileSpreadsheet size={28} />
              </span>
              <span className="text-2xl font-bold text-ink-900 sm:text-[28px]">{isDragging ? 'Suéltalo aquí' : 'Suelta aquí tu Excel'}</span>
              <span id="file-help" className="mt-2 max-w-sm text-sm text-ink-500 sm:text-base">
                {multiple ? 'Uno o varios archivos .xlsx' : 'Un archivo .xlsx'}, hasta {formatFileSize(MAX_FILE_SIZE_BYTES)} cada uno. Se eliminan solos después de unas horas.
              </span>
              <span className="mt-6 inline-flex h-11 items-center gap-2 rounded-md bg-cobalt-600 px-5 text-[15px] font-semibold text-white">
                <FileUp size={16} aria-hidden="true" />
                Elegir archivos
              </span>
            </span>
          </span>
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
          multiple={multiple}
          onChange={(event) => {
            const selected = [...(event.target.files || [])];
            event.target.value = '';
            // Cancelling the picker yields no file: keep the previous selection.
            if (multiple && selected.length > 1) onFiles(selected);
            else if (selected[0]) onFile(selected[0]);
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
            <span className="mt-3 text-sm font-semibold text-ink-900">Arrastra tu Excel aquí o <span className="text-cobalt-600">{multiple ? 'elige uno o varios archivos' : 'elige un archivo'}</span></span>
            <span id="file-help" className="mt-1 text-xs text-ink-500">Solo .xlsx, hasta {formatFileSize(MAX_FILE_SIZE_BYTES)} cada uno.</span>
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

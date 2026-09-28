'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Shell } from '../../../components/shell';
import { TemplateForm } from '../../../components/template-editor/template-form';
import { api } from '../../../lib/api';
import { createColumn } from '../../../lib/template-editor';

const EMPTY_TEMPLATE = {
  name: '',
  description: '',
  destination: '',
  process: '',
  input: { headerRow: 1 },
  output: { format: 'XLSX', sheetName: 'DATOS' },
  columns: [createColumn([])]
};

export default function NewTemplatePage() {
  const router = useRouter();

  return (
    <Shell>
      <div className="mx-auto max-w-4xl">
        <Link href="/templates" className="inline-flex items-center gap-1 text-sm font-medium text-ink-500 hover:text-ink-900">
          <ArrowLeft size={15} aria-hidden="true" />
          Plantillas
        </Link>
        <h1 className="mb-5 mt-3 text-2xl font-semibold text-ink-900">Nueva plantilla</h1>
        <TemplateForm
          initial={EMPTY_TEMPLATE}
          submitLabel="Crear plantilla"
          note="Consejo: también puedes crearla desde un job, a partir de los encabezados de un Excel real y con vista previa."
          onSubmit={async (template) => {
            const created = await api.createTemplate(template);
            router.push(`/templates/${created.id}`);
          }}
        />
      </div>
    </Shell>
  );
}

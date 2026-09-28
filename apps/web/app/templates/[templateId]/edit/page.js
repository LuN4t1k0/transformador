'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { AlertCircle, ArrowLeft, Loader2 } from 'lucide-react';
import { Notice } from '../../../../components/panel';
import { Shell } from '../../../../components/shell';
import { TemplateForm } from '../../../../components/template-editor/template-form';
import { api } from '../../../../lib/api';

export default function EditTemplatePage() {
  const { templateId } = useParams();
  const searchParams = useSearchParams();
  const versionId = searchParams.get('version');
  const router = useRouter();
  const [state, setState] = useState({ template: null, error: null });

  useEffect(() => {
    const load = versionId ? api.getTemplateVersion(templateId, versionId) : api.getTemplate(templateId);
    load.then((template) => setState({ template, error: null })).catch((error) => setState({ template: null, error }));
  }, [templateId, versionId]);

  const { template, error } = state;

  return (
    <Shell>
      <div className="mx-auto max-w-4xl">
        <Link href={`/templates/${templateId}`} className="inline-flex items-center gap-1 text-sm font-medium text-ink-500 hover:text-ink-900">
          <ArrowLeft size={15} aria-hidden="true" />
          Volver a la plantilla
        </Link>

        {error ? <div className="mt-4"><Notice tone="danger" icon={AlertCircle} role="alert">{error.message}</Notice></div> : null}
        {!template && !error ? <p className="mt-6 flex items-center gap-2 text-sm text-ink-500"><Loader2 size={16} className="animate-spin" aria-hidden="true" />Cargando…</p> : null}

        {template ? (
          <>
            <h1 className="mb-5 mt-3 text-2xl font-semibold text-ink-900">
              {versionId ? `Restaurar versión ${template.version} de «${template.name}»` : `Editar «${template.name}»`}
            </h1>
            {template.archivedAt ? (
              <Notice tone="warning" icon={AlertCircle}>La plantilla está archivada. Restáurala desde su detalle para poder editarla.</Notice>
            ) : (
              <TemplateForm
                initial={{ name: template.name, description: template.description, destination: template.destination, process: template.process, ...template.configuration }}
                submitLabel="Guardar como nueva versión"
                note={versionId
                  ? 'Al guardar, esta configuración pasa a ser la versión vigente. Las versiones anteriores se conservan.'
                  : 'Al guardar se crea una versión nueva. Los archivos ya generados conservan la versión con que se hicieron.'}
                onSubmit={async (next) => {
                  await api.addTemplateVersion(templateId, next);
                  router.push(`/templates/${templateId}`);
                }}
              />
            )}
          </>
        ) : null}
      </div>
    </Shell>
  );
}

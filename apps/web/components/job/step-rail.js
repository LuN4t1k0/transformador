'use client';

import { Check } from 'lucide-react';

// The steps of a conversion as a vertical list (a horizontal strip on phones). Each step shows what was decided
// or what is missing, so the list doubles as the summary. `state`: done | current | attention | todo.
export function StepRail({ steps, label = 'Pasos' }) {
  return (
    <nav aria-label={label} className="lg:sticky lg:top-6 lg:self-start">
      <ol className="flex gap-1.5 overflow-x-auto pb-1 lg:flex-col lg:gap-1 lg:overflow-visible lg:pb-0">
        {steps.map((step, index) => {
          const isCurrent = step.state === 'current';
          const Tag = step.onClick ? 'button' : 'div';
          return (
            <li key={step.id} className="shrink-0 lg:shrink">
              <Tag
                {...(step.onClick ? { type: 'button', onClick: step.onClick } : {})}
                aria-current={isCurrent ? 'step' : undefined}
                className={`grid w-full min-w-[9.5rem] grid-cols-[24px_minmax(0,1fr)] gap-2.5 rounded-md border px-2.5 py-2 text-left lg:min-w-0 ${
                  isCurrent ? 'border-ink-200 bg-white' : 'border-transparent'
                } ${step.onClick ? 'hover:bg-white' : ''}`}
              >
                <span
                  aria-hidden="true"
                  className={`mt-0.5 flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                    step.state === 'done'
                      ? 'bg-cobalt-600 text-white'
                      : step.state === 'attention' || isCurrent
                        ? 'border-2 border-amber-400 bg-amber-100 text-ink-900'
                        : 'border border-ink-300 bg-white text-ink-500'
                  }`}
                >
                  {step.state === 'done' ? <Check size={14} /> : index + 1}
                </span>
                <span className="min-w-0">
                  <span className={`block font-semibold ${step.state === 'todo' ? 'text-ink-500' : 'text-ink-900'}`}>{step.label}</span>
                  {step.detail ? <span className="block truncate text-sm text-ink-500" title={typeof step.detail === 'string' ? step.detail : undefined}>{step.detail}</span> : null}
                </span>
              </Tag>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

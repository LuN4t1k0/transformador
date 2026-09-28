'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FilePlus2, History, LayoutTemplate } from 'lucide-react';

const links = [
  { href: '/jobs/new', label: 'Convertir archivo', icon: FilePlus2, isActive: (path) => path === '/jobs/new' },
  { href: '/jobs', label: 'Historial', icon: History, isActive: (path) => path === '/jobs' || (path.startsWith('/jobs/') && path !== '/jobs/new') },
  { href: '/templates', label: 'Plantillas', icon: LayoutTemplate, isActive: (path) => path.startsWith('/templates') }
];

export function MainNav() {
  const pathname = usePathname() || '';

  return (
    <nav aria-label="Principal" className="border-b border-ink-200 bg-white">
      <ul className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 sm:px-5">
        {links.map(({ href, label, icon: Icon, isActive }) => {
          const active = isActive(pathname);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={`flex h-11 items-center gap-2 whitespace-nowrap border-b-2 px-3 text-sm font-medium ${
                  active ? 'border-cobalt-600 text-cobalt-700' : 'border-transparent text-ink-500 hover:text-ink-900'
                }`}
              >
                <Icon size={16} aria-hidden="true" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

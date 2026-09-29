'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FilePlus2, History, LayoutTemplate } from 'lucide-react';

const links = [
  { href: '/', label: 'Convertir', icon: FilePlus2, isActive: (path) => path === '/' },
  { href: '/jobs', label: 'Historial', icon: History, isActive: (path) => path.startsWith('/jobs') },
  { href: '/templates', label: 'Plantillas', icon: LayoutTemplate, isActive: (path) => path.startsWith('/templates') }
];

// `rail`: vertical list in the desktop side rail. `bar`: evenly spaced icons with labels at the bottom of a phone.
export function MainNav({ variant = 'rail' }) {
  const pathname = usePathname() || '';
  const isBar = variant === 'bar';

  return (
    <nav aria-label="Principal">
      <ul className={isBar ? 'grid grid-cols-3' : 'space-y-1'}>
        {links.map(({ href, label, icon: Icon, isActive }) => {
          const active = isActive(pathname);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={isBar
                  ? `flex h-14 flex-col items-center justify-center gap-0.5 text-xs font-medium ${active ? 'text-cobalt-700' : 'text-ink-500'}`
                  : `flex h-10 items-center gap-3 rounded-md px-3 text-[15px] font-medium ${active ? 'bg-cobalt-50 text-cobalt-700' : 'text-ink-700 hover:bg-ink-50'}`}
              >
                <Icon size={isBar ? 20 : 18} aria-hidden="true" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

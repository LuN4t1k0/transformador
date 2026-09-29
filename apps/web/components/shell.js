import { FileSpreadsheet } from 'lucide-react';
import { MainNav } from './main-nav';
import { UserBadge } from './user-badge';
import { AdvancedToggle } from './advanced-toggle';

export function Shell({ children }) {
  return (
    <div className="min-h-screen text-ink-900">
      <header className="border-b border-ink-200 bg-white">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-ink-900 text-white">
              <FileSpreadsheet size={17} aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">Previley Transformer</p>
              <p className="truncate text-xs text-ink-500">Transforma Excel con plantillas</p>
            </div>
          </div>
          <div className="flex min-w-0 items-center gap-2">
            <AdvancedToggle />
            <UserBadge />
          </div>
        </div>
      </header>
      <MainNav />

      <main className="px-4 py-6 sm:px-5">{children}</main>
    </div>
  );
}

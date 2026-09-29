import Link from 'next/link';
import { MainNav } from './main-nav';
import { UserBadge } from './user-badge';
import { AdvancedToggle } from './advanced-toggle';

// A 3×3 grid of cells: the product works on spreadsheets.
function BrandMark() {
  return (
    <span aria-hidden="true" className="grid h-8 w-8 shrink-0 grid-cols-3 gap-[2px] rounded-md bg-cobalt-600 p-[5px]">
      {Array.from({ length: 9 }, (_, index) => <span key={index} className={`rounded-[1px] bg-white ${index % 2 ? 'opacity-50' : 'opacity-90'}`} />)}
    </span>
  );
}

function Brand() {
  return (
    <Link href="/" className="flex min-w-0 items-center gap-2.5 rounded-md">
      <BrandMark />
      <span className="min-w-0 leading-tight">
        <span className="block truncate text-[15px] font-bold text-ink-900">Transformador</span>
        <span className="block truncate text-xs text-ink-500">Previley</span>
      </span>
    </Link>
  );
}

// Desktop: a side rail with the destinations and, at its foot, advanced mode and the user.
// Phone: a slim top bar and the destinations as a bottom bar.
export function Shell({ children }) {
  return (
    <div className="min-h-screen text-ink-900 lg:grid lg:grid-cols-[224px_minmax(0,1fr)]">
      <aside className="hidden border-r border-ink-200 bg-white lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:px-3 lg:py-5">
        <div className="px-2 pb-6"><Brand /></div>
        <MainNav variant="rail" />
        <div className="mt-auto space-y-3 border-t border-ink-100 px-2 pt-4">
          <AdvancedToggle variant="rail" />
          <UserBadge variant="rail" />
        </div>
      </aside>

      <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-2 border-b border-ink-200 bg-white px-4 lg:hidden">
        <Brand />
        <div className="flex min-w-0 items-center gap-1">
          <AdvancedToggle />
          <UserBadge />
        </div>
      </header>

      <main className="px-4 pb-24 pt-6 sm:px-6 lg:px-8 lg:pb-12 lg:pt-8">{children}</main>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-ink-200 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden">
        <MainNav variant="bar" />
      </div>
    </div>
  );
}

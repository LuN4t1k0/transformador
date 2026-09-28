import { Bell, FileSpreadsheet, History, LayoutDashboard, Settings, UserCircle } from 'lucide-react';

const navItems = [
  { label: 'Nuevo job', icon: FileSpreadsheet, active: true },
  { label: 'Plantillas', icon: LayoutDashboard, active: false },
  { label: 'Historial', icon: History, active: false },
  { label: 'Ajustes', icon: Settings, active: false }
];

export function Shell({ children }) {
  return (
    <div className="min-h-screen text-ink-900">
      <header className="sticky top-0 z-20 border-b border-ink-200 bg-white/94 backdrop-blur">
        <div className="flex h-14 items-center justify-between px-5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-ink-900 text-white">
              <FileSpreadsheet size={17} aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">Previley Transformer</p>
              <p className="truncate text-xs text-ink-500">Excel a plantillas previsionales</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button className="flex h-9 w-9 items-center justify-center rounded-md border border-ink-200 bg-white text-ink-700 hover:bg-ink-50" aria-label="Notificaciones">
              <Bell size={17} aria-hidden="true" />
            </button>
            <button className="flex h-9 items-center gap-2 rounded-md border border-ink-200 bg-white px-3 text-sm font-medium text-ink-700 hover:bg-ink-50">
              <UserCircle size={17} aria-hidden="true" />
              C. Venegas
            </button>
          </div>
        </div>
      </header>

      <div className="grid min-h-[calc(100vh-56px)] grid-cols-[232px_1fr]">
        <aside className="border-r border-ink-200 bg-white px-3 py-4">
          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.label}
                  className={`flex h-10 w-full items-center gap-3 rounded-md px-3 text-left text-sm font-medium ${
                    item.active
                      ? 'bg-cobalt-50 text-cobalt-700'
                      : 'text-ink-700 hover:bg-ink-50'
                  }`}
                >
                  <Icon size={17} aria-hidden="true" />
                  {item.label}
                </button>
              );
            })}
          </nav>
        </aside>

        <main className="min-w-0 px-6 py-5">{children}</main>
      </div>
    </div>
  );
}

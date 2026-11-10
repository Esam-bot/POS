import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { LogOut, Menu } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { adminNavItems } from '../utils/navConfig';

export default function AdminLayout() {
  const { user, logout, hasPermission } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const items = adminNavItems.filter((item) => hasPermission(item.permission));

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--color-surface)] text-[var(--color-ink)]">
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[260px] flex-col border-r border-[var(--color-line)] bg-[var(--color-panel)] transition-transform lg:static lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-16 shrink-0 items-center border-b border-[var(--color-line)] px-5">
          <div>
            <p className="font-[family-name:var(--font-display)] text-lg font-bold tracking-tight text-[var(--color-brand)]">
              Demo Restaurant
            </p>
            <p className="text-xs text-[var(--color-ink-muted)]">Admin Console</p>
          </div>
        </div>

        <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto p-3">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                    isActive
                      ? 'bg-[var(--color-brand-soft)] text-[var(--color-brand-dark)]'
                      : 'text-[var(--color-ink-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-ink)]'
                  }`
                }
              >
                <Icon size={18} />
                {item.label}
              </NavLink>
            );
          })}
        </nav>

        <div className="shrink-0 border-t border-[var(--color-line)] p-3">
          <div className="mb-2 px-2">
            <p className="truncate text-sm font-semibold text-[var(--color-ink)]">{user?.name}</p>
            <p className="truncate text-xs text-[var(--color-ink-muted)]">
              {user?.roles?.join(', ')}
            </p>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-[var(--color-danger)] hover:bg-red-50"
          >
            <LogOut size={16} />
            Logout
          </button>
        </div>
      </aside>

      {open && (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 z-30 bg-black/30 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-[var(--color-line)] bg-[var(--color-panel)] px-4 lg:px-8">
          <button
            type="button"
            className="rounded-lg border border-[var(--color-line)] bg-white p-2 text-[var(--color-ink)] lg:hidden"
            onClick={() => setOpen(true)}
          >
            <Menu size={18} />
          </button>
          <p className="hidden text-sm text-[var(--color-ink-muted)] lg:block">
            Restaurant operations overview
          </p>
          <p className="text-sm font-medium text-[var(--color-ink)]">{user?.username}</p>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

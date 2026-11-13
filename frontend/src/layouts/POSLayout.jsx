import { Outlet, Link, NavLink, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  LogOut,
  ClipboardList,
  ShoppingCart,
  Table2,
  Bell,
  UserRound,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { PosThemeProvider } from '../context/PosThemeContext';

export default function POSLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  const linkClass = ({ isActive }) =>
    `inline-flex items-center gap-2 rounded-[var(--radius-control)] px-3 py-1.5 text-sm font-medium transition ${
      isActive
        ? 'bg-[var(--color-sidebar-active)] text-[#f5f5f5] shadow-[inset_0_-2px_0_0_var(--color-brand)]'
        : 'text-[#a1a7ae] hover:bg-[var(--color-sidebar-hover)] hover:text-[#f5f5f5]'
    }`;

  return (
    <PosThemeProvider>
      <div className="theme-pos flex h-screen overflow-hidden">
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--color-line)] bg-[var(--color-section)] px-4">
            <div className="flex min-w-0 items-center gap-3">
              <Link
                to="/admin"
                className="inline-flex items-center gap-2 rounded-[var(--radius-control)] px-3 py-1.5 text-sm text-[#a1a7ae] hover:bg-[var(--color-panel)] hover:text-[#f5f5f5]"
              >
                <ArrowLeft size={16} strokeWidth={1.75} />
                Admin
              </Link>
              <p className="hidden font-[family-name:var(--font-display)] text-lg font-semibold text-[#f5f5f5] sm:block">
                POS Terminal
              </p>
              <nav className="flex items-center gap-1 overflow-x-auto">
                <NavLink to="/pos/tables" className={linkClass}>
                  <Table2 size={14} strokeWidth={1.75} />
                  Tables
                </NavLink>
                <NavLink to="/pos" end className={linkClass}>
                  <ShoppingCart size={14} strokeWidth={1.75} />
                  New Order
                </NavLink>
                <NavLink to="/pos/board" className={linkClass}>
                  <Bell size={14} strokeWidth={1.75} />
                  Board
                </NavLink>
                <NavLink to="/pos/orders" className={linkClass}>
                  <ClipboardList size={14} strokeWidth={1.75} />
                  History
                </NavLink>
              </nav>
            </div>
            <div className="flex shrink-0 items-center gap-3 text-sm">
              <span className="hidden items-center gap-2 text-[#a1a7ae] sm:inline-flex">
                <UserRound size={14} strokeWidth={1.75} />
                {user?.name}
              </span>
              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex items-center gap-1 rounded-[var(--radius-control)] px-3 py-1.5 text-[#a1a7ae] hover:bg-[var(--color-panel)] hover:text-[#f5f5f5]"
              >
                <LogOut size={14} strokeWidth={1.75} />
                Logout
              </button>
            </div>
          </header>
          <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-[var(--color-surface)]">
            <Outlet />
          </main>
        </div>
      </div>
    </PosThemeProvider>
  );
}

import { Outlet, Link, NavLink, useNavigate } from 'react-router-dom';
import { ArrowLeft, LogOut, LayoutGrid, ClipboardList, MonitorSmartphone } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function POSLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  const linkClass = ({ isActive }) =>
    `inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm ${
      isActive ? 'bg-white/20 text-white' : 'bg-white/10 text-white/85 hover:bg-white/15'
    }`;

  return (
    <div className="theme-dark flex h-screen flex-col overflow-hidden bg-[var(--color-ink)] text-white">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-white/10 px-4">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            to="/admin"
            className="inline-flex items-center gap-2 rounded-md bg-white/10 px-3 py-1.5 text-sm text-white hover:bg-white/15"
          >
            <ArrowLeft size={16} />
            Admin
          </Link>
          <p className="hidden font-[family-name:var(--font-display)] text-lg font-semibold sm:block">
            POS Terminal
          </p>
          <nav className="flex items-center gap-2 overflow-x-auto">
            <NavLink to="/pos" end className={linkClass}>
              <MonitorSmartphone size={14} />
              New Order
            </NavLink>
            <NavLink to="/pos/tables" className={linkClass}>
              <LayoutGrid size={14} />
              Floor
            </NavLink>
            <NavLink to="/pos/orders" className={linkClass}>
              <ClipboardList size={14} />
              History
            </NavLink>
          </nav>
        </div>
        <div className="flex shrink-0 items-center gap-3 text-sm">
          <span className="hidden text-white/70 sm:inline">{user?.name}</span>
          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex items-center gap-1 rounded-md bg-white/10 px-3 py-1.5 text-white hover:bg-white/15"
          >
            <LogOut size={14} />
            Logout
          </button>
        </div>
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
        <Outlet />
      </main>
    </div>
  );
}

import { NavLink, Outlet, Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, LogOut, ChefHat } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { kitchenApi } from '../services/kitchenService';

export default function KitchenLayout() {
  const { user, logout, hasPermission } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const stationId = searchParams.get('station') || '';
  const [stations, setStations] = useState([]);

  useEffect(() => {
    kitchenApi
      .stations()
      .then(setStations)
      .catch(() => setStations([]));
  }, []);

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  const canUpdate = hasPermission('kitchen.update') || hasPermission('kitchen.manage');

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#0f1115] text-[#f3f4f6]">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-white/10 bg-[#161a22] px-4">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            to="/admin"
            className="inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-white/55 hover:bg-white/5 hover:text-white"
          >
            <ArrowLeft size={16} />
            Admin
          </Link>
          <div className="flex items-center gap-2">
            <ChefHat size={18} className="text-[#16a36a]" />
            <p className="font-[family-name:var(--font-display)] text-lg font-semibold">Kitchen</p>
          </div>
          <nav className="ml-2 flex items-center gap-1 overflow-x-auto">
            <NavLink
              to="/kitchen"
              end
              className={({ isActive }) =>
                `rounded-lg px-3 py-1.5 text-sm font-medium ${
                  isActive && !stationId
                    ? 'bg-[#16a36a] text-white'
                    : 'text-white/60 hover:bg-white/5 hover:text-white'
                }`
              }
            >
              All stations
            </NavLink>
            {stations.map((s) => (
              <NavLink
                key={s.id}
                to={`/kitchen?station=${s.id}`}
                className={() =>
                  `rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap ${
                    stationId === s.id
                      ? 'bg-[#16a36a] text-white'
                      : 'text-white/60 hover:bg-white/5 hover:text-white'
                  }`
                }
              >
                {s.name}
              </NavLink>
            ))}
          </nav>
        </div>
        <div className="flex shrink-0 items-center gap-3 text-sm text-white/55">
          <span className="hidden sm:inline">{user?.name}</span>
          {!canUpdate && (
            <span className="rounded bg-amber-500/20 px-2 py-0.5 text-xs text-amber-200">
              View only
            </span>
          )}
          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 hover:bg-white/5 hover:text-white"
          >
            <LogOut size={14} />
            Logout
          </button>
        </div>
      </header>
      <main className="min-h-0 flex-1 overflow-hidden">
        <Outlet context={{ stations, stationId, canUpdate }} />
      </main>
    </div>
  );
}

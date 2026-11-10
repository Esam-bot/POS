import { NavLink, Outlet } from 'react-router-dom';

const tabs = [
  { to: '/admin/menu', label: 'Overview', end: true },
  { to: '/admin/menu/categories', label: 'Categories' },
  { to: '/admin/menu/items', label: 'Products' },
  { to: '/admin/menu/modifiers', label: 'Customizations' },
  { to: '/admin/menu/stations', label: 'Kitchen stations' },
];

export default function MenuLayout() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="app-title">Menu Management</h1>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
          Manage categories, products, customizations, and kitchen preparation areas.
        </p>
      </div>
      <div className="flex flex-wrap gap-2 border-b border-[var(--color-line)] pb-3">
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) =>
              `rounded-lg px-3 py-1.5 text-sm font-medium ${
                isActive
                  ? 'bg-[var(--color-brand-soft)] text-[var(--color-brand-dark)]'
                  : 'text-[var(--color-ink-muted)] hover:bg-[var(--color-surface)]'
              }`
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </div>
      <Outlet />
    </div>
  );
}

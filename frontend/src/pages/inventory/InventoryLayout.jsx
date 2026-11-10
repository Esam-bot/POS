import { NavLink, Outlet } from 'react-router-dom';

const tabs = [
  { to: '/admin/inventory', label: 'Dashboard', end: true },
  { to: '/admin/inventory/items', label: 'Items' },
  { to: '/admin/inventory/categories', label: 'Categories' },
  { to: '/admin/inventory/stock', label: 'Stock' },
  { to: '/admin/inventory/history', label: 'History' },
  { to: '/admin/inventory/recipes', label: 'Recipes' },
];

export default function InventoryLayout() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="app-title">Inventory</h1>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
          Track ingredients, recipes, stock changes, and low-stock alerts.
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

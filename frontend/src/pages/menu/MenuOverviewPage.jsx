import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { menuApi } from '../../services/menuService';

const cards = [
  { key: 'totalCategories', label: 'Categories', to: '/admin/menu/categories' },
  { key: 'totalItems', label: 'Products', to: '/admin/menu/items' },
  { key: 'activeItems', label: 'Active products', to: '/admin/menu/items?isActive=true' },
  { key: 'inactiveItems', label: 'Inactive products', to: '/admin/menu/items?isActive=false' },
  { key: 'modifierGroups', label: 'Customization groups', to: '/admin/menu/modifiers' },
  { key: 'kitchenStations', label: 'Kitchen stations', to: '/admin/menu/stations' },
];

export default function MenuOverviewPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    menuApi
      .overview()
      .then(setData)
      .catch((err) => setError(err.response?.data?.message || 'Failed to load overview'));
  }, []);

  if (error) return <p className="text-[var(--color-danger)]">{error}</p>;
  if (!data) return <p className="text-[var(--color-ink-muted)]">Loading overview…</p>;

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {cards.map((card) => (
        <Link
          key={card.key}
          to={card.to}
          className="rounded-xl border border-[var(--color-line)] bg-white p-5 shadow-sm transition hover:border-[var(--color-brand)]"
        >
          <p className="text-sm text-[var(--color-ink-muted)]">{card.label}</p>
          <p className="mt-2 font-[family-name:var(--font-display)] text-3xl font-semibold">
            {data[card.key] ?? 0}
          </p>
        </Link>
      ))}
    </div>
  );
}

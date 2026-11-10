import { useEffect, useState } from 'react';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';

const cards = [
  { key: 'revenue', label: "Today's revenue", prefix: 'Rs. ' },
  { key: 'totalOrders', label: 'Total orders' },
  { key: 'averageOrderValue', label: 'Average order value', prefix: 'Rs. ' },
  { key: 'activeTables', label: 'Active tables' },
  { key: 'pendingKitchenOrders', label: 'Pending kitchen' },
  { key: 'completedOrders', label: 'Completed orders' },
];

export default function DashboardPage() {
  const { hasPermission } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!hasPermission('reports.view')) {
        setLoading(false);
        return;
      }
      try {
        const res = await api.get('/dashboard/overview');
        if (!cancelled) {
          setData(res.data.data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.response?.data?.message || 'Failed to load dashboard');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [hasPermission]);

  if (!hasPermission('reports.view')) {
    return (
      <div className="rounded-xl border border-[var(--color-line)] bg-white p-8">
        <h1 className="app-title">Welcome</h1>
        <p className="mt-2 text-[var(--color-ink-muted)]">
          You are signed in. Use the sidebar to open modules you can access.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="app-title">Dashboard</h1>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
          Live operational snapshot. Full analytics arrive in Phase 9.
        </p>
      </div>

      {loading && <p className="text-[var(--color-ink-muted)]">Loading…</p>}
      {error && <p className="text-[var(--color-danger)]">{error}</p>}

      {data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {cards.map((card) => (
              <div
                key={card.key}
                className="rounded-xl border border-[var(--color-line)] bg-white p-5 shadow-sm"
              >
                <p className="text-sm text-[var(--color-ink-muted)]">{card.label}</p>
                <p className="mt-2 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight">
                  {card.prefix || ''}
                  {data[card.key] ?? 0}
                </p>
              </div>
            ))}
          </div>
          {data.note && (
            <p className="rounded-lg border border-dashed border-[var(--color-line)] bg-white px-4 py-3 text-sm text-[var(--color-ink-muted)]">
              {data.note}
            </p>
          )}
        </>
      )}
    </div>
  );
}

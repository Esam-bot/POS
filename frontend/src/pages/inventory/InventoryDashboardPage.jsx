import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { inventoryApi, qty, stockTone } from '../../services/inventoryService';
import { money } from '../../utils/formatMoney';
import { useToast } from '../../components/ui/Toast';
import Badge from '../../components/ui/Badge';

function Stat({ label, value, hint }) {
  return (
    <div className="rounded-xl border border-[var(--color-line)] bg-white p-4">
      <p className="text-sm text-[var(--color-ink-muted)]">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-[var(--color-ink)]">{value}</p>
      {hint && <p className="mt-1 text-xs text-[var(--color-ink-muted)]">{hint}</p>}
    </div>
  );
}

export default function InventoryDashboardPage() {
  const toast = useToast();
  const [data, setData] = useState(null);

  useEffect(() => {
    inventoryApi
      .dashboard()
      .then(setData)
      .catch((err) => toast.error(err.response?.data?.message || 'Failed to load dashboard'));
  }, [toast]);

  if (!data) return <p className="text-[var(--color-ink-muted)]">Loading inventory…</p>;

  const t = data.totals;

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Active items" value={t.itemCount} />
        <Stat label="Stock value" value={money(t.stockValue)} hint="Based on average cost" />
        <Stat label="Low stock" value={t.lowStockCount} />
        <Stat label="Out of stock" value={t.outOfStockCount} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-[var(--color-line)] bg-white">
          <div className="flex items-center justify-between border-b border-[var(--color-line)] px-4 py-3">
            <h2 className="font-semibold">Needs attention</h2>
            <Link to="/admin/inventory/items" className="text-sm text-[var(--color-brand)]">
              View items
            </Link>
          </div>
          <div className="divide-y divide-[var(--color-line)]">
            {[...data.outOfStockItems, ...data.lowStockItems].slice(0, 10).map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className="font-medium">{item.name}</p>
                  <p className="text-xs text-[var(--color-ink-muted)]">
                    {qty(item.currentStock)} {item.unitName} · min {qty(item.minStock)}
                  </p>
                </div>
                <Badge tone={stockTone(item.stockStatus)}>{item.stockStatusLabel}</Badge>
              </div>
            ))}
            {!data.outOfStockItems.length && !data.lowStockItems.length && (
              <p className="px-4 py-6 text-sm text-[var(--color-ink-muted)]">
                All items are comfortably in stock.
              </p>
            )}
          </div>
        </section>

        <section className="rounded-xl border border-[var(--color-line)] bg-white">
          <div className="flex items-center justify-between border-b border-[var(--color-line)] px-4 py-3">
            <h2 className="font-semibold">Recent stock movements</h2>
            <Link to="/admin/inventory/history" className="text-sm text-[var(--color-brand)]">
              Full history
            </Link>
          </div>
          <div className="divide-y divide-[var(--color-line)]">
            {data.recentMovements.map((m) => (
              <div key={m.id} className="px-4 py-3 text-sm">
                <div className="flex justify-between gap-2">
                  <span className="font-medium">{m.itemName}</span>
                  <span>{qty(m.quantity)}</span>
                </div>
                <p className="text-xs text-[var(--color-ink-muted)]">
                  {m.typeLabel}
                  {m.orderNumber ? ` · Order ${m.orderNumber}` : ''}
                  {m.staffName ? ` · ${m.staffName}` : ''} ·{' '}
                  {m.createdAt ? new Date(m.createdAt).toLocaleString() : ''}
                </p>
              </div>
            ))}
            {!data.recentMovements.length && (
              <p className="px-4 py-6 text-sm text-[var(--color-ink-muted)]">No movements yet.</p>
            )}
          </div>
        </section>
      </div>

      <section className="rounded-xl border border-[var(--color-line)] bg-white">
        <div className="border-b border-[var(--color-line)] px-4 py-3">
          <h2 className="font-semibold">Recent wastage</h2>
        </div>
        <div className="app-table-wrap">
          <table className="app-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Quantity</th>
                <th>Reason</th>
                <th>Staff</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {data.recentWastage.map((m) => (
                <tr key={m.id}>
                  <td>{m.itemName}</td>
                  <td>
                    {qty(Math.abs(Number(m.quantity)))} {m.unitName}
                  </td>
                  <td>{m.notes || '—'}</td>
                  <td>{m.staffName || '—'}</td>
                  <td>{m.createdAt ? new Date(m.createdAt).toLocaleString() : '—'}</td>
                </tr>
              ))}
              {!data.recentWastage.length && (
                <tr>
                  <td colSpan={5} className="text-[var(--color-ink-muted)]">
                    No wastage recorded.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

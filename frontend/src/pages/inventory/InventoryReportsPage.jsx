import { useEffect, useState } from 'react';
import { inventoryApi, qty } from '../../services/inventoryService';
import { money } from '../../utils/formatMoney';
import { useToast } from '../../components/ui/Toast';
import Badge from '../../components/ui/Badge';
import { stockTone } from '../../services/inventoryService';

const TABS = [
  { key: 'stock', label: 'Current stock' },
  { key: 'low', label: 'Low stock' },
  { key: 'consumption', label: 'Consumption' },
  { key: 'purchases', label: 'Purchases' },
  { key: 'wastage', label: 'Wastage' },
  { key: 'valuation', label: 'Valuation' },
];

export default function InventoryReportsPage() {
  const toast = useToast();
  const [tab, setTab] = useState('stock');
  const [data, setData] = useState(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const params = {};
        if (from) params.from = from;
        if (to) params.to = to;
        let result;
        if (tab === 'stock') result = await inventoryApi.reportStock();
        else if (tab === 'low') result = await inventoryApi.reportLowStock();
        else if (tab === 'consumption') result = await inventoryApi.reportConsumption(params);
        else if (tab === 'purchases') result = await inventoryApi.reportPurchases(params);
        else if (tab === 'wastage') result = await inventoryApi.reportWastage(params);
        else result = await inventoryApi.reportValuation();
        if (!cancelled) setData(result);
      } catch (err) {
        if (!cancelled) toast.error(err.response?.data?.message || 'Failed to load report');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tab, from, to, toast]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              tab === t.key
                ? 'bg-[var(--color-brand-soft)] text-[var(--color-brand-dark)]'
                : 'bg-[var(--color-surface)] text-[var(--color-ink-muted)]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {['consumption', 'purchases', 'wastage'].includes(tab) && (
        <div className="flex flex-wrap gap-3 text-sm">
          <label className="flex items-center gap-2">
            From
            <input
              type="date"
              className="rounded border border-[var(--color-line)] px-2 py-1"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label className="flex items-center gap-2">
            To
            <input
              type="date"
              className="rounded border border-[var(--color-line)] px-2 py-1"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
        </div>
      )}

      {!data && <p className="text-sm text-[var(--color-ink-muted)]">Loading…</p>}

      {data && (tab === 'stock' || tab === 'low') && (
        <div className="app-table-wrap rounded-xl border border-[var(--color-line)] bg-white">
          <table className="app-table">
            <thead>
              <tr>
                <th>Ingredient</th>
                <th>Stock</th>
                <th>Min</th>
                <th>Status</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody>
              {(data.items || []).map((row) => (
                <tr key={row.id}>
                  <td>{row.name}</td>
                  <td>
                    {qty(row.currentStock)} {row.unitName}
                  </td>
                  <td>{qty(row.minStock)}</td>
                  <td>
                    <Badge tone={stockTone(row.stockStatus)}>{row.stockStatusLabel}</Badge>
                  </td>
                  <td>{money(row.stockValue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && tab === 'consumption' && (
        <div className="app-table-wrap rounded-xl border border-[var(--color-line)] bg-white">
          <table className="app-table">
            <thead>
              <tr>
                <th>Ingredient</th>
                <th>Used</th>
              </tr>
            </thead>
            <tbody>
              {(data.items || []).map((row) => (
                <tr key={row.ingredientId}>
                  <td>{row.name}</td>
                  <td>
                    {qty(row.quantity)} {row.unitName}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && tab === 'purchases' && (
        <div className="app-table-wrap rounded-xl border border-[var(--color-line)] bg-white">
          <table className="app-table">
            <thead>
              <tr>
                <th>Supplier</th>
                <th>Status</th>
                <th>Total</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {(data.items || []).map((row) => (
                <tr key={row.id}>
                  <td>{row.supplierName}</td>
                  <td>{row.status}</td>
                  <td>{money(row.totalCost)}</td>
                  <td>{row.createdAt ? new Date(row.createdAt).toLocaleDateString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && tab === 'wastage' && (
        <div className="app-table-wrap rounded-xl border border-[var(--color-line)] bg-white">
          <table className="app-table">
            <thead>
              <tr>
                <th>Ingredient</th>
                <th>Qty</th>
                <th>Reason</th>
                <th>Staff</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {(data.items || []).map((row) => (
                <tr key={row.id}>
                  <td>{row.ingredientName}</td>
                  <td>
                    {qty(row.quantity)} {row.unitName}
                  </td>
                  <td>{row.reason}</td>
                  <td>{row.staffName || '—'}</td>
                  <td>{row.createdAt ? new Date(row.createdAt).toLocaleString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && tab === 'valuation' && (
        <div className="space-y-4">
          <p className="text-lg font-semibold">
            Total stock value: {money(data.totals?.stockValue)}
          </p>
          <div className="app-table-wrap rounded-xl border border-[var(--color-line)] bg-white">
            <table className="app-table">
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Items</th>
                  <th>Value</th>
                </tr>
              </thead>
              <tbody>
                {(data.byCategory || []).map((row) => (
                  <tr key={row.category}>
                    <td>{row.category}</td>
                    <td>{row.count}</td>
                    <td>{money(row.stockValue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

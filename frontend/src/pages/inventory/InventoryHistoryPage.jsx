import { useCallback, useEffect, useState } from 'react';
import { inventoryApi, qty } from '../../services/inventoryService';
import { useToast } from '../../components/ui/Toast';
import { Select } from '../../components/ui/Input';

export default function InventoryHistoryPage() {
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [type, setType] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await inventoryApi.listMovements({
        type: type || undefined,
        limit: 100,
      });
      setRows(data.items);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load history');
    }
  }, [type, toast]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      <Select value={type} onChange={(e) => setType(e.target.value)} className="max-w-xs">
        <option value="">All movement types</option>
        <option value="RECEIVE">Stock added</option>
        <option value="ADJUST">Stock adjusted</option>
        <option value="WASTE">Wastage</option>
        <option value="CONSUME">Used for sale</option>
      </Select>

      <div className="app-table-wrap">
        <table className="app-table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Type</th>
              <th>Qty</th>
              <th>Before</th>
              <th>After</th>
              <th>Note / order</th>
              <th>Staff</th>
              <th>When</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.id}>
                <td>
                  <p className="font-medium">{m.itemName}</p>
                  <p className="text-xs text-[var(--color-ink-muted)]">{m.unitName}</p>
                </td>
                <td>{m.typeLabel}</td>
                <td>{qty(m.quantity)}</td>
                <td>{qty(m.stockBefore)}</td>
                <td>{qty(m.stockAfter)}</td>
                <td>
                  {m.orderNumber ? `Order ${m.orderNumber}` : m.notes || '—'}
                </td>
                <td>{m.staffName || '—'}</td>
                <td>{m.createdAt ? new Date(m.createdAt).toLocaleString() : '—'}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={8} className="text-[var(--color-ink-muted)]">
                  No stock movements yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

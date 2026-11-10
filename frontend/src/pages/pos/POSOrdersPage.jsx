import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ordersApi } from '../../services/posService';
import { money } from '../../utils/formatMoney';
import { useToast } from '../../components/ui/Toast';
import Badge from '../../components/ui/Badge';

export default function POSOrdersPage() {
  const toast = useToast();
  const [orders, setOrders] = useState([]);

  const load = useCallback(async () => {
    try {
      const data = await ordersApi.list({ activeOnly: true, limit: 50 });
      setOrders(data.items);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load orders');
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4 p-4 text-white">
      <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight">
        Active orders
      </h1>
      <div className="overflow-hidden rounded-xl bg-white/5">
        <table className="min-w-full text-left text-sm">
          <thead className="text-white/50">
            <tr>
              <th className="px-4 py-3">Order</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Table</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Total</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id} className="border-t border-white/10">
                <td className="px-4 py-3">
                  <Link className="font-medium text-emerald-300 hover:underline" to={`/pos/orders/${order.id}`}>
                    {order.orderNumber}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <p className="font-medium">{order.customerName || '—'}</p>
                  {order.customerPhone && (
                    <p className="text-xs text-white/50">{order.customerPhone}</p>
                  )}
                </td>
                <td className="px-4 py-3">{order.type}</td>
                <td className="px-4 py-3">{order.diningTable?.number || '—'}</td>
                <td className="px-4 py-3">
                  <Badge tone="brand">{order.status}</Badge>
                </td>
                <td className="px-4 py-3">{money(order.grandTotal)}</td>
              </tr>
            ))}
            {!orders.length && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-white/50">
                  No active orders.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

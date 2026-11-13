import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ordersApi } from '../../services/posService';
import { money } from '../../utils/formatMoney';
import { useToast } from '../../components/ui/Toast';
import { useSocket } from '../../hooks/useSocket';
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

  useSocket(
    'pos',
    ['order.status.updated', 'order.ready', 'order.updated', 'order.created', 'payment.created', '__connected'],
    () => {
      load();
    },
    true
  );

  return (
    <div className="space-y-4 p-4 text-[var(--color-ink)]">
      <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight">
        Active orders
      </h1>
      <div className="app-table-wrap">
        <table className="app-table">
          <thead>
            <tr>
              <th>Order</th>
              <th>Customer</th>
              <th>Type</th>
              <th>Status</th>
              <th>Payment</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id}>
                <td>
                  <Link
                    className="font-medium text-[var(--color-brand)] hover:underline"
                    to={`/pos/orders/${order.id}`}
                  >
                    {order.orderNumber}
                  </Link>
                </td>
                <td>
                  <p className="font-medium">{order.customerName || '—'}</p>
                  {order.customerPhone && (
                    <p className="text-xs text-[var(--color-ink-muted)]">{order.customerPhone}</p>
                  )}
                </td>
                <td>{order.type}</td>
                <td>
                  <Badge tone={order.status === 'READY' ? 'success' : 'brand'}>
                    {String(order.status || '').replaceAll('_', ' ') || '—'}
                  </Badge>
                </td>
                <td>
                  <Badge tone="warning">
                    {String(order.paymentStatus || '').replaceAll('_', ' ') || '—'}
                  </Badge>
                </td>
                <td>{money(order.grandTotal)}</td>
              </tr>
            ))}
            {!orders.length && (
              <tr>
                <td colSpan={6} className="text-[var(--color-ink-muted)]">
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

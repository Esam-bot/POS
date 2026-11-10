import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ordersApi } from '../../services/posService';
import { money } from '../../utils/formatMoney';
import Badge from '../../components/ui/Badge';

export default function OrdersPage() {
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    ordersApi
      .list({ limit: 50 })
      .then((data) => setOrders(data.items))
      .catch((err) => setError(err.response?.data?.message || 'Failed to load orders'));
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="app-title">Orders</h1>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
          Recent orders. Open POS for operational workflows.
        </p>
      </div>
      {error && <p className="text-[var(--color-danger)]">{error}</p>}
      <div className="app-table-wrap">
        <table className="app-table">
          <thead>
            <tr>
              <th>Order</th>
              <th>Type</th>
              <th>Status</th>
              <th>Total</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id}>
                <td>
                  <Link className="font-medium text-[var(--color-brand)]" to={`/pos/orders/${order.id}`}>
                    {order.orderNumber}
                  </Link>
                </td>
                <td>{order.type}</td>
                <td>
                  <Badge tone="brand">{order.status}</Badge>
                </td>
                <td>{money(order.grandTotal)}</td>
                <td className="text-[var(--color-ink-muted)]">
                  {new Date(order.createdAt).toLocaleString()}
                </td>
              </tr>
            ))}
            {!orders.length && !error && (
              <tr>
                <td colSpan={5} className="py-8 text-[var(--color-ink-muted)]">
                  No orders yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

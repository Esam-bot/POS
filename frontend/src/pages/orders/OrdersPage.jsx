import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ordersApi } from '../../services/posService';
import { money } from '../../utils/formatMoney';
import Badge from '../../components/ui/Badge';
import { Field, TextInput, Select } from '../../components/ui/Input';
import { useSocket } from '../../hooks/useSocket';

const SECTIONS = [
  { key: 'open', label: 'Open / unpaid' },
  { key: 'paid', label: 'Paid' },
  { key: 'all', label: 'All' },
];

function paymentTone(status) {
  if (status === 'PAID') return 'success';
  if (status === 'PARTIALLY_PAID') return 'warning';
  if (status === 'REFUNDED' || status === 'PARTIALLY_REFUNDED') return 'muted';
  return 'warning';
}

export default function OrdersPage() {
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [section, setSection] = useState('open');
  const [filters, setFilters] = useState({
    search: '',
    type: '',
    status: '',
    paymentStatus: '',
  });

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    setError('');
    try {
      const params = {
        limit: 50,
        search: filters.search || undefined,
        type: filters.type || undefined,
        status: filters.status || undefined,
      };
      if (section === 'paid') {
        params.section = 'paid';
      } else if (section === 'open') {
        params.section = 'open';
        if (filters.paymentStatus) params.paymentStatus = filters.paymentStatus;
      } else {
        if (filters.paymentStatus) params.paymentStatus = filters.paymentStatus;
      }
      const data = await ordersApi.list(params);
      setOrders(data.items || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load orders');
      setOrders([]);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [section, filters]);

  useEffect(() => {
    const t = setTimeout(() => load(), 200);
    return () => clearTimeout(t);
  }, [load]);

  useSocket(
    'pos',
    ['order.status.updated', 'order.ready', 'order.updated', 'order.created', 'payment.created', '__connected'],
    () => {
      load({ silent: true });
    },
    true
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="app-title">Orders</h1>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
          Filter on the server. Paid orders appear under the Paid tab.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {SECTIONS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setSection(tab.key)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              section === tab.key
                ? 'bg-[var(--color-brand-soft)] text-[var(--color-brand-dark)]'
                : 'text-[var(--color-ink-muted)] hover:bg-[var(--color-section)]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="grid gap-3 rounded-xl border border-[var(--color-line)] bg-white p-4 md:grid-cols-4">
        <Field label="Search">
          <TextInput
            placeholder="Order #, name, phone…"
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
          />
        </Field>
        <Field label="Type">
          <Select
            value={filters.type}
            onChange={(e) => setFilters({ ...filters, type: e.target.value })}
          >
            <option value="">All types</option>
            <option value="DINE_IN">Dine in</option>
            <option value="TAKEAWAY">Takeaway</option>
            <option value="DELIVERY">Delivery</option>
          </Select>
        </Field>
        <Field label="Order status">
          <Select
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
          >
            <option value="">All statuses</option>
            <option value="PLACED">Placed</option>
            <option value="CONFIRMED">Confirmed</option>
            <option value="PREPARING">Preparing</option>
            <option value="READY">Ready</option>
            <option value="SERVED">Served</option>
            <option value="COMPLETED">Completed</option>
            <option value="CANCELLED">Cancelled</option>
          </Select>
        </Field>
        {section !== 'paid' && (
          <Field label="Payment">
            <Select
              value={filters.paymentStatus}
              onChange={(e) => setFilters({ ...filters, paymentStatus: e.target.value })}
            >
              <option value="">All payments</option>
              <option value="UNPAID">Unpaid</option>
              <option value="PARTIALLY_PAID">Partially paid</option>
              {section === 'all' && <option value="PAID">Paid</option>}
            </Select>
          </Field>
        )}
      </div>

      {error && <p className="text-[var(--color-danger)]">{error}</p>}

      <div className="app-table-wrap">
        <table className="app-table">
          <thead>
            <tr>
              <th>Order</th>
              <th>Type</th>
              <th>Status</th>
              <th>Payment</th>
              <th>Total</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={6} className="py-8 text-[var(--color-ink-muted)]">
                  Loading…
                </td>
              </tr>
            )}
            {!loading &&
              orders.map((order) => (
                <tr key={order.id}>
                  <td>
                    <Link
                      className="font-medium text-[var(--color-brand)]"
                      to={`/pos/orders/${order.id}`}
                    >
                      {order.orderNumber}
                    </Link>
                    {(order.customerName || order.customerPhone) && (
                      <p className="text-xs text-[var(--color-ink-muted)]">
                        {[order.customerName, order.customerPhone].filter(Boolean).join(' · ')}
                      </p>
                    )}
                  </td>
                  <td>{String(order.type || '').replaceAll('_', ' ')}</td>
                  <td>{String(order.status || '').replaceAll('_', ' ')}</td>
                  <td>
                    <Badge tone={paymentTone(order.paymentStatus)}>
                      {String(order.paymentStatus || '').replaceAll('_', ' ') || '—'}
                    </Badge>
                  </td>
                  <td>{money(order.grandTotal)}</td>
                  <td className="text-[var(--color-ink-muted)]">
                    {new Date(order.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            {!loading && !orders.length && !error && (
              <tr>
                <td colSpan={6} className="py-8 text-[var(--color-ink-muted)]">
                  No orders match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ordersApi } from '../../services/posService';
import { useSocket } from '../../hooks/useSocket';
import { useToast } from '../../components/ui/Toast';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import { money } from '../../utils/formatMoney';

const BOARD_STATUSES = ['PREPARING', 'READY'];

function etaLabel(iso) {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 'Due now';
  const mins = Math.ceil(ms / 60000);
  return `~${mins} min`;
}

export default function OrderBoardPage() {
  const toast = useToast();
  const [orders, setOrders] = useState([]);
  const [readyFlash, setReadyFlash] = useState(null);

  const load = useCallback(async () => {
    try {
      const data = await ordersApi.list({ limit: 50, status: BOARD_STATUSES.join(',') });
      const items = (data.items || []).filter((o) => BOARD_STATUSES.includes(o.status));
      setOrders(items);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load board');
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  useSocket(
    'pos',
    ['order.status.updated', 'order.ready', 'table.status.updated', '__connected'],
    (event, payload) => {
      if (event === '__connected' || event === 'order.status.updated' || event === 'table.status.updated') {
        load();
      }
      if (event === 'order.ready') {
        setReadyFlash(payload?.message || `Order ${payload?.orderNumber} is ready`);
        load();
        window.setTimeout(() => setReadyFlash(null), 8000);
      }
    },
    true
  );

  return (
    <div className="space-y-4 p-4 text-[var(--color-ink)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-xl font-semibold">
            Service board
          </h1>
          <p className="text-sm text-[var(--color-ink-muted)]">
            Live prep status — food ready is independent of payment
          </p>
        </div>
        <Button variant="secondary" onClick={load}>
          Refresh
        </Button>
      </div>

      {readyFlash && (
        <div className="rounded-[var(--radius-card)] border border-[var(--color-brand)] bg-[var(--color-brand-soft)] px-4 py-3 text-sm font-medium text-[var(--color-brand)]">
          {readyFlash}
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {orders.map((order) => (
          <Link
            key={order.id}
            to={`/pos/orders/${order.id}`}
            className={`rounded-[var(--radius-card)] border p-4 shadow-[var(--shadow-card)] transition hover:border-[var(--color-brand)] ${
              order.status === 'READY'
                ? 'border-[var(--color-brand)] bg-[var(--color-brand-soft)]'
                : 'border-[var(--color-line)] bg-[var(--color-panel)]'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-lg font-semibold">{order.orderNumber}</p>
                <p className="text-sm text-[var(--color-ink-muted)]">
                  {order.diningTable?.number
                    ? `Table ${order.diningTable.number}`
                    : order.type}
                  {order.customerName ? ` · ${order.customerName}` : ''}
                </p>
              </div>
              <Badge tone={order.status === 'READY' ? 'success' : 'warning'}>{order.status}</Badge>
            </div>
            <div className="mt-3 flex items-center justify-between text-sm">
              <span className="text-[var(--color-ink-muted)]">
                {etaLabel(order.estimatedReadyAt) || '—'}
              </span>
              <span className="font-medium">{money(order.grandTotal)}</span>
            </div>
          </Link>
        ))}
        {!orders.length && (
          <p className="col-span-full rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-panel)] p-6 text-sm text-[var(--color-ink-muted)]">
            No preparing or ready orders right now.
          </p>
        )}
      </div>
    </div>
  );
}

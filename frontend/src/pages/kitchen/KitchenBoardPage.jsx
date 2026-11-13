import { useCallback, useEffect, useMemo, useState } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import { AlertTriangle, Clock3, RefreshCw } from 'lucide-react';
import { kitchenApi } from '../../services/kitchenService';
import { useSocket } from '../../hooks/useSocket';
import { useToast } from '../../components/ui/Toast';
import { formatOrderNumber } from '../../utils/orderNumber';

const COLUMNS = [
  { key: 'NEW', label: 'New', statuses: ['NEW', 'ACCEPTED'] },
  { key: 'PREPARING', label: 'Preparing', statuses: ['PREPARING'] },
  { key: 'READY', label: 'Ready', statuses: ['READY'] },
  { key: 'COMPLETED', label: 'Completed', statuses: ['COMPLETED'] },
];

const KDS_EVENTS = [
  'kitchen.tickets.created',
  'kitchen.ticket.updated',
  'kitchen.ticket.cancelled',
  'kitchen.ticket.ready',
  'kitchen.prep.started',
  'kitchen.item.ready',
  'kitchen.item.prep.started',
  'kitchen.item.cancelled',
  'kitchen.prep.delayed',
  'kitchen.order.ready',
  'order.status.updated',
];

function typeLabel(type) {
  if (type === 'DINE_IN') return 'Dine-in';
  if (type === 'TAKEAWAY') return 'Takeaway';
  if (type === 'DELIVERY') return 'Delivery';
  return type || '—';
}

function elapsedLabel(from) {
  if (!from) return null;
  const ms = Date.now() - new Date(from).getTime();
  if (ms < 0) return '0m';
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function etaLabel(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function OrderCard({ order, canUpdate, busyId, onStart, onReady, onCompleteStation }) {
  const delayed = order.hasDelayedItems;
  const received = order.placedAt || order.createdAt;
  const stations = order.stations || [];

  return (
    <article
      className={`rounded-xl border p-3 shadow-sm ${
        delayed ? 'border-amber-500/60 bg-amber-500/10' : 'border-white/10 bg-[#1c212b]'
      }`}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <p className="font-[family-name:var(--font-display)] text-lg font-semibold text-white">
            ORDER {formatOrderNumber(order.orderNumber)}
            {order.tableNumber ? (
              <span className="text-white/70"> — TABLE {order.tableNumber}</span>
            ) : null}
          </p>
          <p className="text-xs text-white/55">
            {typeLabel(order.orderType)}
            {order.customerName ? ` · ${order.customerName}` : ''}
            {order.itemCount ? ` · ${order.itemCount} items` : ''}
          </p>
        </div>
        <div className="text-right text-[11px] text-white/45">
          <p className="inline-flex items-center gap-1">
            <Clock3 size={12} />
            {elapsedLabel(received) || '—'}
          </p>
          <p className="mt-1 rounded bg-white/10 px-1.5 py-0.5 font-semibold uppercase tracking-wide text-white/80">
            {order.status}
          </p>
        </div>
      </div>

      {delayed && (
        <p className="mb-2 inline-flex items-center gap-1 rounded bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-200">
          <AlertTriangle size={12} /> Delayed items
        </p>
      )}

      <div className="space-y-3">
        {stations.map((station) => (
          <section
            key={station.ticketId || station.stationId || station.stationName}
            className="rounded-lg border border-white/10 bg-black/25 p-2.5"
          >
            <header className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#16a36a]">
                {station.stationName || 'Unassigned'}
              </h3>
              <span className="text-[10px] uppercase text-white/40">{station.ticketStatus}</span>
            </header>

            <ul className="space-y-2">
              {(station.items || []).map((item) => (
                <li
                  key={item.id}
                  className={`rounded-lg border px-2.5 py-2 ${
                    item.isDelayed
                      ? 'border-amber-500/40 bg-amber-500/5'
                      : 'border-white/5 bg-[#161a22]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white">
                        <span className="text-[#16a36a]">{Number(item.quantity)}</span> × {item.name}
                        {item.variantName ? (
                          <span className="text-white/50"> ({item.variantName})</span>
                        ) : null}
                      </p>
                      {item.modifiers?.length > 0 && (
                        <p className="text-xs text-white/45">
                          {item.modifiers.map((m) => m.name).join(', ')}
                        </p>
                      )}
                      {item.specialInstructions && (
                        <p className="mt-0.5 text-xs text-amber-200/90">
                          Note: {item.specialInstructions}
                        </p>
                      )}
                      <p className="mt-1 text-[11px] text-white/40">
                        Est {item.prepTimeMinutes || 5}m
                        {item.estimatedReadyAt ? ` · ETA ${etaLabel(item.estimatedReadyAt)}` : ''}
                        {item.preparingAt ? ` · Elapsed ${elapsedLabel(item.preparingAt)}` : ''}
                      </p>
                    </div>
                    <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-white/50">
                      {item.status}
                    </span>
                  </div>

                  {canUpdate && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {['NEW', 'ACCEPTED'].includes(item.status) && (
                        <button
                          type="button"
                          disabled={busyId === item.id}
                          onClick={() => onStart(item.id)}
                          className="min-h-10 flex-1 rounded-lg bg-[#16a36a] px-2 text-sm font-semibold text-white disabled:opacity-50"
                        >
                          Start
                        </button>
                      )}
                      {item.status === 'PREPARING' && (
                        <button
                          type="button"
                          disabled={busyId === item.id}
                          onClick={() => onReady(item.id)}
                          className="min-h-10 flex-1 rounded-lg bg-sky-600 px-2 text-sm font-semibold text-white disabled:opacity-50"
                        >
                          Ready
                        </button>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>

            {canUpdate && station.ticketStatus === 'READY' && station.ticketId && (
              <button
                type="button"
                disabled={busyId === station.ticketId}
                onClick={() => onCompleteStation(station.ticketId)}
                className="mt-2 min-h-10 w-full rounded-lg border border-white/15 bg-white/5 text-sm font-medium text-white hover:bg-white/10 disabled:opacity-50"
              >
                Complete {station.stationName || 'station'}
              </button>
            )}
          </section>
        ))}
      </div>

      {order.orderNotes && (
        <p className="mt-2 text-xs text-white/45">Order note: {order.orderNotes}</p>
      )}

      <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-white/50">
        Overall status: <span className="text-white">{order.status}</span>
      </p>
    </article>
  );
}

export default function KitchenBoardPage() {
  const toast = useToast();
  const { canUpdate } = useOutletContext() || {};
  const [searchParams] = useSearchParams();
  const stationId = searchParams.get('station') || '';
  const [orders, setOrders] = useState([]);
  const [workload, setWorkload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [tick, setTick] = useState(0);

  const load = useCallback(async () => {
    try {
      const params = { includeCompleted: 'true' };
      if (stationId) params.stationId = stationId;
      const [board, wl] = await Promise.all([
        kitchenApi.board(params),
        stationId ? Promise.resolve(null) : kitchenApi.workload().catch(() => null),
      ]);
      setOrders(Array.isArray(board) ? board : []);
      setWorkload(wl);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load kitchen board');
    } finally {
      setLoading(false);
    }
  }, [stationId, toast]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 30000);
    return () => clearInterval(id);
  }, []);

  const socketRoom = stationId ? `kitchen:station:${stationId}` : 'kitchen';

  useSocket(
    socketRoom,
    KDS_EVENTS,
    (event) => {
      if (event === '__connected' || event.startsWith('kitchen.') || event === 'order.status.updated') {
        load();
      }
    },
    true
  );

  async function startItem(itemId) {
    setBusyId(itemId);
    try {
      await kitchenApi.updateItemStatus(itemId, 'PREPARING');
      await load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not start preparation');
    } finally {
      setBusyId(null);
    }
  }

  async function readyItem(itemId) {
    setBusyId(itemId);
    try {
      await kitchenApi.updateItemStatus(itemId, 'READY');
      await load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not mark ready');
    } finally {
      setBusyId(null);
    }
  }

  async function completeStation(ticketId) {
    setBusyId(ticketId);
    try {
      await kitchenApi.updateTicketStatus(ticketId, 'COMPLETED');
      await load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not complete station');
    } finally {
      setBusyId(null);
    }
  }

  const columns = useMemo(() => {
    void tick;
    return COLUMNS.map((col) => ({
      ...col,
      orders: orders.filter((o) => col.statuses.includes(o.status)),
    }));
  }, [orders, tick]);

  const delayedCount = orders.filter((o) => o.hasDelayedItems).length;

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-4 py-2">
        <div className="flex items-center gap-3 text-sm text-white/60">
          <span>
            {stationId ? 'Station view — items for this station only' : 'Central kitchen — one card per order'}
          </span>
          {delayedCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-2 py-0.5 text-amber-200">
              <AlertTriangle size={12} />
              {delayedCount} delayed
            </span>
          )}
          {!stationId && workload?.stations && (
            <span className="hidden text-white/40 lg:inline">
              Workload:{' '}
              {workload.stations.map((s) => `${s.name} ${s.total}`).join(' · ')}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => load()}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-white/60 hover:bg-white/5 hover:text-white"
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center text-white/45">Loading kitchen…</div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-auto p-3 md:grid-cols-2 xl:grid-cols-4">
          {columns.map((col) => (
            <section key={col.key} className="flex min-h-[280px] flex-col rounded-2xl bg-[#12151c] p-2">
              <header className="mb-2 flex items-center justify-between px-2 py-1">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-white/70">
                  {col.label}
                </h2>
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/70">
                  {col.orders.length}
                </span>
              </header>
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-1 pb-2">
                {col.orders.length === 0 ? (
                  <p className="px-2 py-6 text-center text-sm text-white/30">No orders</p>
                ) : (
                  col.orders.map((order) => (
                    <OrderCard
                      key={order.orderId}
                      order={order}
                      canUpdate={canUpdate}
                      busyId={busyId}
                      onStart={startItem}
                      onReady={readyItem}
                      onCompleteStation={completeStation}
                    />
                  ))
                )}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

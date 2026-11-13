import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { sessionsApi, tablesApi } from '../../services/posService';
import { money } from '../../utils/formatMoney';
import { useToast } from '../../components/ui/Toast';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Modal from '../../components/ui/Modal';
import { Select } from '../../components/ui/Input';
import { getPendingGuest, setPendingGuest } from '../../utils/posGuest';
import { useSocket } from '../../hooks/useSocket';

export default function SessionDetailPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const toast = useToast();
  const navigate = useNavigate();
  const guestName =
    searchParams.get('guestName') || getPendingGuest()?.name || '';

  useEffect(() => {
    if (guestName) {
      const pending = getPendingGuest() || {};
      setPendingGuest({
        ...pending,
        name: guestName,
        phone: pending.phone || '',
        orderType: 'DINE_IN',
      });
    }
  }, [guestName]);
  const [session, setSession] = useState(null);
  const [available, setAvailable] = useState([]);
  const [addOpen, setAddOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [addTableId, setAddTableId] = useState('');
  const [fromTableId, setFromTableId] = useState('');
  const [toTableId, setToTableId] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await sessionsApi.get(id);
      setSession(data);
      const tables = await tablesApi.list({ status: 'AVAILABLE', isActive: true, limit: 100 });
      setAvailable(tables.items);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load session');
    }
  }, [id, toast]);

  useEffect(() => {
    load();
  }, [load]);

  useSocket(
    'pos',
    [
      'order.status.updated',
      'order.ready',
      'order.updated',
      'order.created',
      'session.updated',
      'table.status.updated',
      '__connected',
    ],
    () => {
      load();
    },
    true
  );

  if (!session) {
    return <p className="p-4 text-[var(--color-ink-muted)]">Loading session…</p>;
  }

  const primaryTable = session.tables?.[0];

  return (
    <div className="space-y-4 p-4 text-[var(--color-ink)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Session</h1>
          <p className="text-sm text-[var(--color-ink-muted)]">
            {guestName ? `${guestName} · ` : ''}
            Opened by {session.openedBy?.name} · <Badge tone="brand">{session.status}</Badge>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => {
              const params = new URLSearchParams();
              params.set('sessionId', session.id);
              if (primaryTable) params.set('tableId', primaryTable.id);
              if (guestName) params.set('guestName', guestName);
              navigate(`/pos?${params.toString()}`);
            }}
          >
            New order
          </Button>
          <Button variant="secondary" onClick={() => setAddOpen(true)}>
            Add table
          </Button>
          <Button variant="secondary" onClick={() => setTransferOpen(true)}>
            Transfer
          </Button>
          <Button
            variant="danger"
            onClick={async () => {
              try {
                await sessionsApi.close(session.id);
                toast.success('Session closed');
                navigate('/pos/tables');
              } catch (err) {
                toast.error(err.response?.data?.message || 'Cannot close session');
              }
            }}
          >
            Close session
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <section className="rounded-xl border border-[var(--color-line)] bg-[var(--color-panel)] p-4">
          <h2 className="mb-3 font-semibold">Tables</h2>
          <div className="flex flex-wrap gap-2">
            {(session.tables || []).map((t) => (
              <div key={t.id} className="rounded-lg bg-[var(--color-section)] px-3 py-2 text-sm">
                {t.number} · {t.capacity} seats
              </div>
            ))}
          </div>
        </section>
        <section className="rounded-xl border border-[var(--color-line)] bg-[var(--color-panel)] p-4">
          <h2 className="mb-3 font-semibold">Orders</h2>
          <div className="space-y-2">
            {(session.orders || []).map((order) => (
              <Link
                key={order.id}
                to={`/pos/orders/${order.id}`}
                className="flex items-center justify-between rounded-lg bg-[var(--color-section)] px-3 py-2 text-sm hover:bg-[var(--color-brand-soft)]"
              >
                <span>
                  {order.orderNumber} · {order.status}
                </span>
                <span>{money(order.grandTotal)}</span>
              </Link>
            ))}
            {!session.orders?.length && (
              <p className="text-sm text-[var(--color-ink-muted)]">No orders yet for this session.</p>
            )}
          </div>
        </section>
      </div>

      <Modal open={addOpen} title="Add table to session" onClose={() => setAddOpen(false)}>
        <div className="space-y-4 text-[var(--color-ink)]">
          <Select value={addTableId} onChange={(e) => setAddTableId(e.target.value)}>
            <option value="">Select available table</option>
            {available.map((t) => (
              <option key={t.id} value={t.id}>
                {t.number}
              </option>
            ))}
          </Select>
          <Button
            onClick={async () => {
              try {
                await sessionsApi.addTables(session.id, [addTableId]);
                toast.success('Table added');
                setAddOpen(false);
                load();
              } catch (err) {
                toast.error(err.response?.data?.message || 'Failed');
              }
            }}
          >
            Add
          </Button>
        </div>
      </Modal>

      <Modal open={transferOpen} title="Transfer table" onClose={() => setTransferOpen(false)}>
        <div className="space-y-4 text-[var(--color-ink)]">
          <Select value={fromTableId} onChange={(e) => setFromTableId(e.target.value)}>
            <option value="">From table</option>
            {(session.tables || []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.number}
              </option>
            ))}
          </Select>
          <Select value={toTableId} onChange={(e) => setToTableId(e.target.value)}>
            <option value="">To available table</option>
            {available.map((t) => (
              <option key={t.id} value={t.id}>
                {t.number}
              </option>
            ))}
          </Select>
          <Button
            onClick={async () => {
              try {
                await sessionsApi.transfer(session.id, {
                  fromTableId,
                  toTableId,
                });
                toast.success('Transferred');
                setTransferOpen(false);
                load();
              } catch (err) {
                toast.error(err.response?.data?.message || 'Failed');
              }
            }}
          >
            Transfer
          </Button>
        </div>
      </Modal>
    </div>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { sessionsApi, tablesApi } from '../../services/posService';
import { money } from '../../utils/formatMoney';
import { useToast } from '../../components/ui/Toast';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Modal from '../../components/ui/Modal';
import { Select } from '../../components/ui/Input';

export default function SessionDetailPage() {
  const { id } = useParams();
  const toast = useToast();
  const navigate = useNavigate();
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

  if (!session) {
    return <p className="p-4 text-white/70">Loading session…</p>;
  }

  const primaryTable = session.tables?.[0];
  const tableNames = (session.tables || []).map((t) => t.number).join(', ');

  return (
    <div className="space-y-4 p-4 text-white">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight">
            {tableNames ? `Table ${tableNames}` : 'Table session'}
          </h1>
          <p className="mt-1 text-sm text-white/60">
            Opened by {session.openedBy?.name} ·{' '}
            <Badge tone="brand">{session.status === 'OPEN' ? 'Open' : session.status}</Badge>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() =>
              navigate(
                `/pos?sessionId=${session.id}${primaryTable ? `&tableId=${primaryTable.id}` : ''}`
              )
            }
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
        <section className="rounded-xl bg-white/5 p-4">
          <h2 className="mb-3 font-semibold">Tables</h2>
          <div className="flex flex-wrap gap-2">
            {(session.tables || []).map((t) => (
              <div key={t.id} className="rounded-lg bg-white/10 px-3 py-2 text-sm">
                {t.number} · {t.capacity} seats
              </div>
            ))}
          </div>
        </section>
        <section className="rounded-xl bg-white/5 p-4">
          <h2 className="mb-3 font-semibold">Orders</h2>
          <div className="space-y-2">
            {(session.orders || []).map((order) => {
              const unpaid = !['PAID', 'COMPLIMENTARY', 'WRITTEN_OFF', 'REFUNDED'].includes(
                order.paymentStatus
              );
              return (
                <Link
                  key={order.id}
                  to={unpaid ? `/pos/orders/${order.id}/pay` : `/pos/orders/${order.id}`}
                  className="flex items-center justify-between rounded-lg bg-white/10 px-3 py-2 text-sm hover:bg-white/15"
                >
                  <span>
                    {order.orderNumber} · {order.status}
                    {unpaid ? ' · Pay' : ''}
                  </span>
                  <span>{money(order.grandTotal)}</span>
                </Link>
              );
            })}
            {!session.orders?.length && (
              <p className="text-sm text-white/50">No orders yet for this session.</p>
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

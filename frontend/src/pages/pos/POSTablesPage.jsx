import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Package } from 'lucide-react';
import { tablesApi, sessionsApi } from '../../services/posService';
import { useSocket } from '../../hooks/useSocket';
import { useToast } from '../../components/ui/Toast';
import Button from '../../components/ui/Button';
import {
  POS_STATUS_CARD_TONE,
  STATUS_LABEL,
  floorsFromTables,
  tablesForFloor,
} from '../../utils/floors';
import { getPendingGuest, setPendingGuest } from '../../utils/posGuest';

export default function POSTablesPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const guestNameFromQuery = searchParams.get('guestName') || '';
  const pendingGuest = getPendingGuest();
  const guestLabel = guestNameFromQuery || pendingGuest?.name || '';

  const [tables, setTables] = useState([]);
  const [floor, setFloor] = useState('');
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (guestNameFromQuery) {
      setPendingGuest({
        ...(pendingGuest || {}),
        name: guestNameFromQuery,
        phone: pendingGuest?.phone || '',
        orderType: 'DINE_IN',
      });
    }
    // intentionally once on mount for query handoff
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async () => {
    try {
      const data = await tablesApi.list({ limit: 100, isActive: true });
      setTables(data.items);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load tables');
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  useSocket(
    'pos',
    ['table.status.updated', 'session.opened', 'session.closed', '__connected'],
    () => {
      load();
    },
    true
  );

  const floorTabs = useMemo(() => floorsFromTables(tables), [tables]);

  useEffect(() => {
    if (!floorTabs.length) {
      setFloor('');
      return;
    }
    if (!floorTabs.some((t) => t.key === floor)) {
      setFloor(floorTabs[0].key);
    }
  }, [floorTabs, floor]);

  const visible = useMemo(() => tablesForFloor(tables, floor), [tables, floor]);

  function toggle(id, status) {
    if (status !== 'AVAILABLE') return;
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function openSession() {
    if (!selected.length) {
      toast.error('Select at least one available table');
      return;
    }
    setLoading(true);
    try {
      const session = await sessionsApi.open({ tableIds: selected });
      toast.success('Table session opened');
      setSelected([]);
      const q = guestLabel ? `?guestName=${encodeURIComponent(guestLabel)}` : '';
      navigate(`/pos/sessions/${session.id}${q}`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not open session');
      load();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-xl font-semibold text-[#f5f5f5]">
            Tables
          </h1>
          <p className="text-sm text-[var(--color-ink-muted)]">
            {guestLabel
              ? `Select a table for ${guestLabel}`
              : 'Choose a floor, then tap available tables to seat guests'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => navigate('/pos')}>
            <Package size={16} strokeWidth={1.75} />
            Back to POS
          </Button>
          <Button disabled={!selected.length || loading} onClick={openSession}>
            {loading ? 'Opening…' : `Seat guests (${selected.length})`}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {floorTabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => {
              setFloor(tab.key);
              setSelected([]);
            }}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              floor === tab.key
                ? 'bg-[var(--color-brand)] text-white'
                : 'border border-[var(--color-line)] bg-[var(--color-section)] text-[var(--color-ink-muted)] hover:bg-[var(--color-panel)] hover:text-[#f5f5f5]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-[var(--color-ink-muted)]">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[var(--color-brand)]" /> Available
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[var(--color-danger)]" /> Occupied
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[var(--color-warning)]" /> Cleaning
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
        {visible.map((table) => {
          const active = selected.includes(table.id);
          return (
            <button
              key={table.id}
              type="button"
              onClick={() => {
                if (table.activeSession?.id) {
                  navigate(`/pos/sessions/${table.activeSession.id}`);
                  return;
                }
                toggle(table.id, table.status);
              }}
              className={`rounded-[var(--radius-card)] border-2 p-4 text-left transition ${
                POS_STATUS_CARD_TONE[table.status] ||
                'border-[var(--color-line)] bg-[var(--color-panel)]'
              } ${active ? 'ring-2 ring-[var(--color-brand)]' : ''}`}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-2xl font-bold tracking-tight text-[#f5f5f5]">{table.number}</p>
                <span className="rounded-md border border-[var(--color-line)] bg-[var(--color-section)] px-2 py-0.5 text-xs font-medium text-[var(--color-ink-muted)]">
                  {STATUS_LABEL[table.status] || table.status}
                </span>
              </div>
              <p className="mt-2 text-sm text-[var(--color-ink-muted)]">{table.capacity} seats</p>
              {table.activeSession && (
                <p className="mt-2 text-xs text-[var(--color-brand)]">Tap to open active session</p>
              )}
              {active && (
                <p className="mt-2 text-xs font-medium text-[var(--color-brand)]">Selected</p>
              )}
            </button>
          );
        })}
        {!visible.length && (
          <p className="col-span-full rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-section)] p-6 text-sm text-[var(--color-ink-muted)]">
            No tables on this floor.
          </p>
        )}
      </div>
    </div>
  );
}

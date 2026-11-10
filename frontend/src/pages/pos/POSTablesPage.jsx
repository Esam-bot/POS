import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { tablesApi, sessionsApi } from '../../services/posService';
import { useToast } from '../../components/ui/Toast';
import Button from '../../components/ui/Button';
import {
  FLOORS,
  STATUS_CARD_TONE,
  STATUS_LABEL,
  tablesForFloor,
  otherTables,
} from '../../utils/floors';

export default function POSTablesPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const [tables, setTables] = useState([]);
  const [floor, setFloor] = useState(FLOORS[0].key);
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(false);

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

  const extras = useMemo(() => otherTables(tables), [tables]);
  const floorTabs = useMemo(() => {
    const tabs = [...FLOORS];
    if (extras.length) tabs.push({ key: '__other__', label: 'Other' });
    return tabs;
  }, [extras.length]);

  const visible = useMemo(() => {
    if (floor === '__other__') return extras;
    return tablesForFloor(tables, floor);
  }, [tables, floor, extras]);

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
      navigate(`/pos/sessions/${session.id}`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not open session');
      load();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4 p-4 text-white">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight">
            Tables
          </h1>
          <p className="mt-1 text-sm text-white/60">
            Choose a floor, then tap available tables to seat guests
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => navigate('/pos')}>
            Takeaway / Delivery
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
            className={`rounded-lg px-4 py-2 text-sm font-medium ${
              floor === tab.key ? 'bg-white text-[var(--color-ink)]' : 'bg-white/10 hover:bg-white/15'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-white/70">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" /> Available
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-red-400" /> Occupied
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-orange-400" /> Cleaning
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
              className={`rounded-xl border-2 p-4 text-left transition ${
                STATUS_CARD_TONE[table.status] || 'border-white/20'
              } ${active ? 'ring-2 ring-white' : ''}`}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-2xl font-bold tracking-tight">{table.number}</p>
                <span className="rounded-md bg-black/25 px-2 py-0.5 text-xs font-medium">
                  {STATUS_LABEL[table.status] || table.status}
                </span>
              </div>
              <p className="mt-2 text-sm text-white/80">{table.capacity} seats</p>
              {table.activeSession && (
                <p className="mt-2 text-xs text-white/90">Tap to open active session</p>
              )}
              {active && <p className="mt-2 text-xs font-medium">Selected</p>}
            </button>
          );
        })}
        {!visible.length && (
          <p className="col-span-full rounded-xl bg-white/5 p-6 text-sm text-white/60">
            No tables on this floor.
          </p>
        )}
      </div>
    </div>
  );
}

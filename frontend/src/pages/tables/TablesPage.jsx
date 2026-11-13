import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { tablesApi } from '../../services/posService';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/ui/Toast';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import ConfirmDeleteModal from '../../components/ui/ConfirmDeleteModal';
import { Field, TextInput, TextArea } from '../../components/ui/Input';
import {
  STATUS_BADGE_TONE,
  STATUS_LABEL,
  floorsFromTables,
  tablesForFloor,
  defaultSection,
} from '../../utils/floors';

const empty = {
  number: '',
  capacity: 4,
  section: '',
  notes: '',
  isActive: true,
};

export default function TablesPage() {
  const { hasPermission } = useAuth();
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [floor, setFloor] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(empty);
  const [deleting, setDeleting] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      const data = await tablesApi.list({ limit: 100, isActive: true });
      setRows(data.items);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load tables');
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const floorTabs = useMemo(() => floorsFromTables(rows), [rows]);

  useEffect(() => {
    if (!floorTabs.length) {
      setFloor('');
      return;
    }
    if (!floorTabs.some((t) => t.key === floor)) {
      setFloor(floorTabs[0].key);
    }
  }, [floorTabs, floor]);

  const visible = useMemo(() => tablesForFloor(rows, floor), [rows, floor]);

  const sectionOptions = useMemo(() => {
    const opts = floorsFromTables(rows).filter((f) => f.key !== 'Unassigned');
    return opts;
  }, [rows]);

  async function save(e) {
    e.preventDefault();
    try {
      const payload = {
        number: form.number.trim(),
        capacity: Number(form.capacity),
        section: form.section || null,
        notes: form.notes || null,
        isActive: form.isActive,
      };
      if (editing) {
        await tablesApi.update(editing.id, payload);
        toast.success('Table updated');
      } else {
        await tablesApi.create(payload);
        toast.success('Table created');
      }
      setOpen(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Save failed');
    }
  }

  async function markAvailable(row) {
    try {
      await tablesApi.setStatus(row.id, 'AVAILABLE');
      toast.success(`${row.number} marked available`);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Status update failed');
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await tablesApi.remove(deleting.id);
      toast.success(`Table ${deleting.number} deleted`);
      setDeleting(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Delete failed');
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold">Tables</h1>
          <p className="text-sm text-[var(--color-ink-muted)]">
            {rows.length} table{rows.length === 1 ? '' : 's'}
            {floorTabs.length
              ? ` · ${floorTabs.map((f) => `${f.label} (${tablesForFloor(rows, f.key).length})`).join(', ')}`
              : ''}
          </p>
        </div>
        {hasPermission('tables.manage') && (
          <Button
            onClick={() => {
              setEditing(null);
              const section = floor && floor !== 'Unassigned' ? floor : defaultSection(rows);
              setForm({ ...empty, section });
              setOpen(true);
            }}
          >
            <Plus size={16} />
            Add table
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {floorTabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setFloor(tab.key)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              floor === tab.key
                ? 'bg-[var(--color-brand-soft)] text-[var(--color-brand-dark)]'
                : 'bg-[var(--color-surface)] text-[var(--color-ink-muted)] hover:bg-[var(--color-line)]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {visible.map((row) => (
          <div key={row.id} className="rounded-xl border border-[var(--color-line)] bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xl font-semibold">{row.number}</p>
                <p className="text-sm text-[var(--color-ink-muted)]">{row.capacity} seats</p>
              </div>
              <Badge tone={STATUS_BADGE_TONE[row.status] || 'muted'}>
                {STATUS_LABEL[row.status] || row.status}
              </Badge>
            </div>
            {row.activeSession && (
              <p className="mt-3 rounded-lg bg-[var(--color-surface)] px-3 py-2 text-xs">
                Guests seated · {row.activeSession.orderCount || 0} orders
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              {hasPermission('tables.manage') && (
                <>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setEditing(row);
                      setForm({
                        number: row.number,
                        capacity: row.capacity,
                        section: row.section || '',
                        notes: row.notes || '',
                        isActive: row.isActive,
                      });
                      setOpen(true);
                    }}
                  >
                    <Pencil size={14} />
                    Edit
                  </Button>
                  {row.status === 'CLEANING' && (
                    <Button variant="ghost" onClick={() => markAvailable(row)}>
                      Mark available
                    </Button>
                  )}
                  <Button variant="danger" onClick={() => setDeleting(row)}>
                    <Trash2 size={14} />
                    Delete
                  </Button>
                </>
              )}
            </div>
          </div>
        ))}
        {!visible.length && (
          <p className="col-span-full text-sm text-[var(--color-ink-muted)]">No tables on this floor.</p>
        )}
      </div>

      <Modal open={open} title={editing ? 'Edit table' : 'Create table'} onClose={() => setOpen(false)}>
        <form onSubmit={save} className="space-y-4">
          <Field label="Table name" hint="Example: GF-T1 or FF-T3">
            <TextInput
              required
              value={form.number}
              onChange={(e) => setForm({ ...form, number: e.target.value })}
            />
          </Field>
          <Field label="Seats">
            <TextInput
              type="number"
              min="1"
              required
              value={form.capacity}
              onChange={(e) => setForm({ ...form, capacity: e.target.value })}
            />
          </Field>
          <Field label="Section / Floor" hint="Type a section name; existing sections appear below">
            <TextInput
              list="table-section-options"
              placeholder="e.g. Ground Floor"
              value={form.section}
              onChange={(e) => setForm({ ...form, section: e.target.value })}
            />
            <datalist id="table-section-options">
              {sectionOptions.map((f) => (
                <option key={f.key} value={f.key} />
              ))}
            </datalist>
          </Field>
          <Field label="Notes">
            <TextArea
              rows={2}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
            />
            Active
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Save</Button>
          </div>
        </form>
      </Modal>

      <ConfirmDeleteModal
        open={Boolean(deleting)}
        title="Delete table"
        itemName={deleting ? `Table ${deleting.number}` : undefined}
        message="Tables with an active session cannot be deleted."
        loading={deleteBusy}
        onConfirm={confirmDelete}
        onClose={() => !deleteBusy && setDeleting(null)}
      />
    </div>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { Pencil, Plus } from 'lucide-react';
import { menuApi } from '../../services/menuService';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/ui/Toast';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import { Field, TextInput, TextArea } from '../../components/ui/Input';

const emptyForm = { name: '', code: '', description: '', isActive: true };

export default function StationsPage() {
  const { hasPermission } = useAuth();
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await menuApi.listStations({ search: search || undefined, limit: 100 });
      setRows(data.items);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load stations');
    } finally {
      setLoading(false);
    }
  }, [search, toast]);

  useEffect(() => {
    load();
  }, [load]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setOpen(true);
  }

  function openEdit(row) {
    setEditing(row);
    setForm({
      name: row.name,
      code: row.code,
      description: row.description || '',
      isActive: row.isActive,
    });
    setOpen(true);
  }

  async function onSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        await menuApi.updateStation(editing.id, {
          name: form.name.trim(),
          description: form.description || null,
          isActive: form.isActive,
        });
        toast.success('Station updated');
      } else {
        await menuApi.createStation({
          name: form.name.trim(),
          code: form.code.trim().toUpperCase(),
          description: form.description || null,
          isActive: form.isActive,
        });
        toast.success('Station created');
      }
      setOpen(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(row) {
    try {
      await menuApi.setStationStatus(row.id, !row.isActive);
      toast.success(row.isActive ? 'Station deactivated' : 'Station activated');
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Status update failed');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <TextInput
          placeholder="Search stations…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        {hasPermission('menu.create') && (
          <Button onClick={openCreate}>
            <Plus size={16} />
            Add station
          </Button>
        )}
      </div>

      <div className="app-table-wrap">
        <table className="app-table">
          <thead>
            <tr>
              <th>Station</th>
              <th>Products</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-[var(--color-ink-muted)]">
                  Loading…
                </td>
              </tr>
            )}
            {!loading &&
              rows.map((row) => (
                <tr key={row.id} className="border-t border-[var(--color-line)]">
                  <td className="px-4 py-3">
                    <p className="font-medium">{row.name}</p>
                    <p className="text-xs text-[var(--color-ink-muted)]">{row.description}</p>
                  </td>
                  <td className="px-4 py-3">{row.itemCount ?? 0}</td>
                  <td className="px-4 py-3">
                    <Badge tone={row.isActive ? 'success' : 'muted'}>
                      {row.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      {hasPermission('menu.update') && (
                        <>
                          <Button variant="secondary" onClick={() => openEdit(row)}>
                            <Pencil size={14} />
                            Edit
                          </Button>
                          <Button variant="ghost" onClick={() => toggleStatus(row)}>
                            {row.isActive ? 'Deactivate' : 'Activate'}
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <Modal open={open} title={editing ? 'Edit station' : 'Create station'} onClose={() => setOpen(false)}>
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Name">
            <TextInput required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          {!editing && (
            <Field label="Short code" hint="Internal only, e.g. GRILL — not shown on POS">
              <TextInput required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
            </Field>
          )}
          <Field label="Description">
            <TextArea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
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
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

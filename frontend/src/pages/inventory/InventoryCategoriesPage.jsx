import { useCallback, useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { inventoryApi } from '../../services/inventoryService';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/ui/Toast';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import { Field, TextInput, TextArea } from '../../components/ui/Input';

const empty = { name: '', description: '', isActive: true };

export default function InventoryCategoriesPage() {
  const { hasPermission } = useAuth();
  const toast = useToast();
  const canEdit = hasPermission('inventory.update');
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await inventoryApi.listCategories({ search: search || undefined, limit: 100 });
      setRows(data.items);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load categories');
    }
  }, [search, toast]);

  useEffect(() => {
    load();
  }, [load]);

  function openCreate() {
    setEditing(null);
    setForm(empty);
    setOpen(true);
  }

  function openEdit(row) {
    setEditing(row);
    setForm({
      name: row.name,
      description: row.description || '',
      isActive: row.isActive,
    });
    setOpen(true);
  }

  async function onSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description || null,
        isActive: form.isActive,
      };
      if (editing) {
        await inventoryApi.updateCategory(editing.id, payload);
        toast.success('Category updated');
      } else {
        await inventoryApi.createCategory(payload);
        toast.success('Category created');
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
      await inventoryApi.setCategoryStatus(row.id, !row.isActive);
      toast.success(row.isActive ? 'Category deactivated' : 'Category activated');
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Update failed');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <TextInput
          placeholder="Search categories…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        {canEdit && (
          <Button onClick={openCreate}>
            <Plus className="mr-1 h-4 w-4" /> Add category
          </Button>
        )}
      </div>

      <div className="app-table-wrap">
        <table className="app-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Items</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <p className="font-medium">{row.name}</p>
                  {row.description && (
                    <p className="text-xs text-[var(--color-ink-muted)]">{row.description}</p>
                  )}
                </td>
                <td>{row.itemCount}</td>
                <td>
                  <Badge tone={row.isActive ? 'success' : 'muted'}>
                    {row.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </td>
                <td className="space-x-2 text-right">
                  {canEdit && (
                    <>
                      <Button variant="secondary" onClick={() => openEdit(row)}>
                        Edit
                      </Button>
                      <Button variant="secondary" onClick={() => toggleStatus(row)}>
                        {row.isActive ? 'Deactivate' : 'Activate'}
                      </Button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={4} className="text-[var(--color-ink-muted)]">
                  No categories yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? 'Edit category' : 'Add category'}
      >
        <form className="space-y-3" onSubmit={onSubmit}>
          <Field label="Category name" required>
            <TextInput
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </Field>
          <Field label="Description">
            <TextArea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={3}
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
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
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

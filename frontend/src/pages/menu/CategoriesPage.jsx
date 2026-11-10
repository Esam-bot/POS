import { useCallback, useEffect, useState } from 'react';
import { Pencil, Plus } from 'lucide-react';
import { menuApi, imageSrc } from '../../services/menuService';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/ui/Toast';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import { Field, TextInput, TextArea } from '../../components/ui/Input';

const emptyForm = {
  name: '',
  description: '',
  sortOrder: 0,
  imageUrl: '',
  isActive: true,
};

export default function CategoriesPage() {
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
      const data = await menuApi.listCategories({ search: search || undefined, limit: 100 });
      setRows(data.items);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load categories');
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
      description: row.description || '',
      sortOrder: row.sortOrder ?? 0,
      imageUrl: row.imageUrl || '',
      isActive: row.isActive,
    });
    setOpen(true);
  }

  async function onUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const result = await menuApi.uploadImage(file);
      setForm((prev) => ({ ...prev, imageUrl: result.url }));
      toast.success('Image uploaded');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Upload failed');
    }
  }

  async function onSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description || null,
        sortOrder: Number(form.sortOrder) || 0,
        imageUrl: form.imageUrl || null,
        isActive: form.isActive,
      };
      if (editing) {
        await menuApi.updateCategory(editing.id, payload);
        toast.success('Category updated');
      } else {
        await menuApi.createCategory(payload);
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
      await menuApi.setCategoryStatus(row.id, !row.isActive);
      toast.success(row.isActive ? 'Category deactivated' : 'Category activated');
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Status update failed');
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--color-ink-muted)]">
        Categories group products for cashiers (e.g. Burgers, Pizza). They are separate from
        kitchen stations, which only control where food is prepared.
      </p>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <TextInput
          placeholder="Search categories…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        {hasPermission('menu.create') && (
          <Button onClick={openCreate}>
            <Plus size={16} />
            Add category
          </Button>
        )}
      </div>

      <div className="app-table-wrap">
        <table className="app-table">
          <thead>
            <tr>
              <th>Category</th>
              <th>Items</th>
              <th>Order</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-[var(--color-ink-muted)]">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-[var(--color-ink-muted)]">
                  No categories yet.
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-[var(--color-line)]">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 overflow-hidden rounded-lg bg-[var(--color-surface)]">
                      {row.imageUrl ? (
                        <img src={imageSrc(row.imageUrl)} alt="" className="h-full w-full object-cover" />
                      ) : null}
                    </div>
                    <div>
                      <p className="font-medium">{row.name}</p>
                      <p className="text-xs text-[var(--color-ink-muted)]">{row.description}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">{row.itemCount ?? 0}</td>
                <td className="px-4 py-3">{row.sortOrder}</td>
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

      <Modal open={open} title={editing ? 'Edit category' : 'Create category'} onClose={() => setOpen(false)}>
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Category name" hint="Simple name only — e.g. Burgers, Drinks. Do not add codes or dates.">
            <TextInput required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Description">
            <TextArea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
          <Field label="Display order">
            <TextInput
              type="number"
              value={form.sortOrder}
              onChange={(e) => setForm({ ...form, sortOrder: e.target.value })}
            />
          </Field>
          <Field label="Image" hint="JPEG, PNG, WebP or GIF up to 2MB">
            <input type="file" accept="image/*" onChange={onUpload} />
            {form.imageUrl && (
              <img src={imageSrc(form.imageUrl)} alt="" className="mt-2 h-20 w-20 rounded-lg object-cover" />
            )}
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

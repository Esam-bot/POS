import { useCallback, useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { inventoryApi, qty, stockTone } from '../../services/inventoryService';
import { money } from '../../utils/formatMoney';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/ui/Toast';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import { Field, TextInput, Select } from '../../components/ui/Input';

const empty = {
  name: '',
  categoryId: '',
  unitId: '',
  supplierId: '',
  currentStock: '0',
  minStock: '0',
  avgCost: '0',
  isActive: true,
};

export default function InventoryItemsPage() {
  const { hasPermission } = useAuth();
  const toast = useToast();
  const canEdit = hasPermission('inventory.update');
  const [rows, setRows] = useState([]);
  const [categories, setCategories] = useState([]);
  const [units, setUnits] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  const loadMeta = useCallback(async () => {
    const [cats, u, s] = await Promise.all([
      inventoryApi.listCategories({ limit: 100, isActive: true }),
      inventoryApi.listUnits(),
      inventoryApi.listSuppliers(),
    ]);
    setCategories(cats.items);
    setUnits(u);
    setSuppliers(s);
  }, []);

  const load = useCallback(async () => {
    try {
      const data = await inventoryApi.listItems({
        search: search || undefined,
        stockStatus: statusFilter || undefined,
        limit: 100,
      });
      setRows(data.items);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load items');
    }
  }, [search, statusFilter, toast]);

  useEffect(() => {
    loadMeta().catch(() => {});
  }, [loadMeta]);

  useEffect(() => {
    load();
  }, [load]);

  function openCreate() {
    setEditing(null);
    setForm({
      ...empty,
      categoryId: categories[0]?.id || '',
      unitId: units[0]?.id || '',
    });
    setOpen(true);
  }

  function openEdit(row) {
    setEditing(row);
    setForm({
      name: row.name,
      categoryId: row.categoryId,
      unitId: row.unitId,
      supplierId: row.supplierId || '',
      currentStock: String(row.currentStock),
      minStock: String(row.minStock),
      avgCost: String(row.avgCost),
      isActive: row.isActive,
    });
    setOpen(true);
  }

  async function onSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        await inventoryApi.updateItem(editing.id, {
          name: form.name.trim(),
          categoryId: form.categoryId,
          unitId: form.unitId,
          supplierId: form.supplierId || null,
          minStock: Number(form.minStock),
          avgCost: Number(form.avgCost),
          isActive: form.isActive,
        });
        toast.success('Item updated');
      } else {
        await inventoryApi.createItem({
          name: form.name.trim(),
          categoryId: form.categoryId,
          unitId: form.unitId,
          supplierId: form.supplierId || null,
          currentStock: Number(form.currentStock),
          minStock: Number(form.minStock),
          avgCost: Number(form.avgCost),
          isActive: form.isActive,
        });
        toast.success('Item created');
      }
      setOpen(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function archive(row) {
    if (!window.confirm(`Deactivate “${row.name}”? Items with history cannot be permanently deleted.`)) {
      return;
    }
    try {
      await inventoryApi.archiveItem(row.id);
      toast.success('Item deactivated');
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Archive failed');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <TextInput
          placeholder="Search items…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All stock levels</option>
          <option value="IN_STOCK">In Stock</option>
          <option value="LOW_STOCK">Low Stock</option>
          <option value="OUT_OF_STOCK">Out of Stock</option>
        </Select>
        {canEdit && (
          <Button className="ml-auto" onClick={openCreate}>
            <Plus className="mr-1 h-4 w-4" /> Add item
          </Button>
        )}
      </div>

      <div className="app-table-wrap">
        <table className="app-table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Category</th>
              <th>Stock</th>
              <th>Min</th>
              <th>Cost</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <p className="font-medium">{row.name}</p>
                  <p className="text-xs text-[var(--color-ink-muted)]">
                    {row.unitName}
                    {row.supplierName ? ` · ${row.supplierName}` : ''}
                  </p>
                </td>
                <td>{row.categoryName}</td>
                <td>
                  {qty(row.currentStock)} {row.unitName}
                </td>
                <td>{qty(row.minStock)}</td>
                <td>{money(row.avgCost)}</td>
                <td>
                  <Badge tone={stockTone(row.stockStatus)}>{row.stockStatusLabel}</Badge>
                </td>
                <td className="space-x-2 text-right">
                  {canEdit && (
                    <>
                      <Button variant="secondary" onClick={() => openEdit(row)}>
                        Edit
                      </Button>
                      <Button variant="secondary" onClick={() => archive(row)}>
                        Deactivate
                      </Button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={7} className="text-[var(--color-ink-muted)]">
                  No inventory items yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'Edit item' : 'Add item'}>
        <form className="space-y-3" onSubmit={onSubmit}>
          <Field label="Item name" required>
            <TextInput
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </Field>
          <Field label="Category" required>
            <Select
              value={form.categoryId}
              onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
              required
            >
              <option value="">Select category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Unit" required>
            <Select
              value={form.unitId}
              onChange={(e) => setForm({ ...form, unitId: e.target.value })}
              required
              disabled={!!editing}
            >
              <option value="">Select unit</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Supplier (optional)">
            <Select
              value={form.supplierId}
              onChange={(e) => setForm({ ...form, supplierId: e.target.value })}
            >
              <option value="">None</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          {!editing && (
            <Field label="Opening stock">
              <TextInput
                type="number"
                step="any"
                min="0"
                value={form.currentStock}
                onChange={(e) => setForm({ ...form, currentStock: e.target.value })}
              />
            </Field>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Minimum stock">
              <TextInput
                type="number"
                step="any"
                min="0"
                value={form.minStock}
                onChange={(e) => setForm({ ...form, minStock: e.target.value })}
              />
            </Field>
            <Field label="Purchase / average cost">
              <TextInput
                type="number"
                step="any"
                min="0"
                value={form.avgCost}
                onChange={(e) => setForm({ ...form, avgCost: e.target.value })}
              />
            </Field>
          </div>
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

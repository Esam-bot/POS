import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { menuApi, imageSrc, MENU_IMAGE_FALLBACK } from '../../services/menuService';
import { money } from '../../utils/formatMoney';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/ui/Toast';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import ConfirmDeleteModal from '../../components/ui/ConfirmDeleteModal';
import { Field, TextInput, TextArea, Select } from '../../components/ui/Input';

const emptyItem = {
  name: '',
  description: '',
  sku: '',
  categoryId: '',
  kitchenStationId: '',
  basePrice: '',
  prepTimeMinutes: 5,
  imageUrl: '',
  trackInventory: false,
  isAvailable: true,
  isActive: true,
};

export default function ItemsPage() {
  const { hasPermission } = useAuth();
  const toast = useToast();
  const [searchParams] = useSearchParams();
  const [rows, setRows] = useState([]);
  const [categories, setCategories] = useState([]);
  const [stations, setStations] = useState([]);
  const [groups, setGroups] = useState([]);
  const [filters, setFilters] = useState({
    search: '',
    categoryId: '',
    kitchenStationId: '',
    isAvailable: '',
    isActive: searchParams.get('isActive') || '',
  });
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyItem);
  const [variants, setVariants] = useState([]);
  const [variantDraft, setVariantDraft] = useState({ name: '', price: '', sku: '' });
  const [assignedGroups, setAssignedGroups] = useState([]);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const loadLookups = useCallback(async () => {
    const [cats, stns, mods] = await Promise.all([
      menuApi.listCategories({ limit: 100, isActive: true }),
      menuApi.listStations({ limit: 100, isActive: true }),
      menuApi.listModifierGroups({ limit: 100, isActive: true }),
    ]);
    setCategories(cats.items);
    setStations(stns.items);
    setGroups(mods.items);
  }, []);

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const data = await menuApi.listItems({
        search: filters.search || undefined,
        categoryId: filters.categoryId || undefined,
        kitchenStationId: filters.kitchenStationId || undefined,
        isAvailable: filters.isAvailable === '' ? undefined : filters.isAvailable === 'true',
        isActive: filters.isActive === '' ? undefined : filters.isActive === 'true',
        limit: 50,
      });
      setRows(data.items);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load items');
    } finally {
      setLoading(false);
    }
  }, [filters, toast]);

  useEffect(() => {
    loadLookups().catch(() => {});
  }, [loadLookups]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const categoryOptions = useMemo(() => categories, [categories]);

  async function openCreate() {
    setEditing(null);
    setForm(emptyItem);
    setVariants([]);
    setAssignedGroups([]);
    setOpen(true);
  }

  async function openEdit(row) {
    try {
      const item = await menuApi.getItem(row.id);
      setEditing(item);
      setForm({
        name: item.name,
        description: item.description || '',
        sku: item.sku,
        categoryId: item.categoryId,
        kitchenStationId: item.kitchenStationId || '',
        basePrice: item.basePrice,
        prepTimeMinutes: item.prepTimeMinutes ?? 5,
        imageUrl: item.imageUrl || '',
        trackInventory: item.trackInventory,
        isAvailable: item.isAvailable,
        isActive: item.isActive,
      });
      setVariants(item.variants || []);
      setAssignedGroups(
        (item.modifierGroups || []).map((g, index) => ({
          modifierGroupId: g.id,
          sortOrder: g.sortOrder ?? index,
          name: g.name,
        }))
      );
      setOpen(true);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load item');
    }
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
        sku: form.sku.trim(),
        categoryId: form.categoryId,
        kitchenStationId: form.kitchenStationId || null,
        basePrice: Number(form.basePrice),
        prepTimeMinutes: Number(form.prepTimeMinutes) || 5,
        imageUrl: form.imageUrl || null,
        trackInventory: form.trackInventory,
        isAvailable: form.isAvailable,
        isActive: form.isActive,
      };

      let itemId = editing?.id;
      if (editing) {
        await menuApi.updateItem(editing.id, payload);
        toast.success('Item updated');
      } else {
        const created = await menuApi.createItem(payload);
        itemId = created.id;
        toast.success('Item created');
        for (const v of variants) {
          if (!v.id) {
            await menuApi.createVariant(itemId, {
              name: v.name,
              price: Number(v.price),
              sku: v.sku || null,
            });
          }
        }
      }

      await menuApi.setItemModifierGroups(
        itemId,
        assignedGroups.map((g, index) => ({
          modifierGroupId: g.modifierGroupId,
          sortOrder: index,
        }))
      );

      setOpen(false);
      loadItems();
      loadLookups();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function addVariant() {
    if (!variantDraft.name || variantDraft.price === '') return;
    if (editing) {
      try {
        const created = await menuApi.createVariant(editing.id, {
          name: variantDraft.name,
          price: Number(variantDraft.price),
          sku: variantDraft.sku || null,
        });
        setVariants((prev) => [...prev, created]);
        setVariantDraft({ name: '', price: '', sku: '' });
        toast.success('Variant added');
      } catch (err) {
        toast.error(err.response?.data?.message || 'Failed to add variant');
      }
    } else {
      setVariants((prev) => [
        ...prev,
        {
          name: variantDraft.name,
          price: variantDraft.price,
          sku: variantDraft.sku,
        },
      ]);
      setVariantDraft({ name: '', price: '', sku: '' });
    }
  }

  function toggleAssignedGroup(groupId, name) {
    setAssignedGroups((prev) => {
      const exists = prev.find((g) => g.modifierGroupId === groupId);
      if (exists) return prev.filter((g) => g.modifierGroupId !== groupId);
      return [...prev, { modifierGroupId: groupId, name, sortOrder: prev.length }];
    });
  }

  async function toggleAvailability(row) {
    try {
      await menuApi.setAvailability(row.id, !row.isAvailable);
      loadItems();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update availability');
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await menuApi.archiveItem(deleting.id, true);
      toast.success('Product deleted');
      setDeleting(null);
      loadItems();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Delete failed');
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-5">
        <TextInput
          placeholder="Search products…"
          value={filters.search}
          onChange={(e) => setFilters({ ...filters, search: e.target.value })}
        />
        <Select
          value={filters.categoryId}
          onChange={(e) => setFilters({ ...filters, categoryId: e.target.value })}
        >
          <option value="">All categories</option>
          {categoryOptions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Select
          value={filters.kitchenStationId}
          onChange={(e) => setFilters({ ...filters, kitchenStationId: e.target.value })}
        >
          <option value="">All stations</option>
          {stations.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
        <Select
          value={filters.isAvailable}
          onChange={(e) => setFilters({ ...filters, isAvailable: e.target.value })}
        >
          <option value="">Any availability</option>
          <option value="true">Available</option>
          <option value="false">Unavailable</option>
        </Select>
        <Select
          value={filters.isActive}
          onChange={(e) => setFilters({ ...filters, isActive: e.target.value })}
        >
          <option value="">Any status</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </Select>
      </div>

      <div className="flex justify-end">
        {hasPermission('menu.create') && (
          <Button onClick={openCreate}>
            <Plus size={16} />
            Add product
          </Button>
        )}
      </div>

      <div className="app-table-wrap">
        <table className="app-table">
          <thead>
            <tr>
              <th>Product</th>
              <th>Category</th>
              <th>Prep station</th>
              <th>Price</th>
              <th>Availability</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-[var(--color-ink-muted)]">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-[var(--color-ink-muted)]">
                  No products found.
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-[var(--color-line)]">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 overflow-hidden rounded-lg bg-[var(--color-surface)]">
                      <img
                        src={imageSrc(row.imageUrl) || MENU_IMAGE_FALLBACK}
                        alt=""
                        className="h-full w-full object-cover"
                        onError={(e) => {
                          if (e.currentTarget.src.endsWith(MENU_IMAGE_FALLBACK)) return;
                          e.currentTarget.src = MENU_IMAGE_FALLBACK;
                        }}
                      />
                    </div>
                    <div>
                      <p className="font-medium">{row.name}</p>
                      {(row.variantCount || 0) > 0 && (
                        <p className="text-xs text-[var(--color-ink-muted)]">
                          {row.variantCount} size/variant options
                        </p>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">{row.category?.name || '—'}</td>
                <td className="px-4 py-3">{row.kitchenStation?.name || '—'}</td>
                <td className="px-4 py-3">{money(row.basePrice)}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    <Badge tone={row.isAvailable ? 'success' : 'warning'}>
                      {row.isAvailable ? 'Available' : 'Unavailable'}
                    </Badge>
                    <Badge tone={row.isActive ? 'brand' : 'muted'}>
                      {row.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    {hasPermission('menu.update') && (
                      <>
                        <Button variant="secondary" onClick={() => openEdit(row)}>
                          <Pencil size={14} />
                          Edit
                        </Button>
                        <Button variant="ghost" onClick={() => toggleAvailability(row)}>
                          {row.isAvailable ? 'Mark unavailable' : 'Mark available'}
                        </Button>
                      </>
                    )}
                    {hasPermission('menu.delete') && (
                      <Button variant="danger" onClick={() => setDeleting(row)}>
                        <Trash2 size={14} />
                        Delete
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal
        open={open}
        wide
        title={editing ? 'Edit product' : 'Add product'}
        onClose={() => setOpen(false)}
      >
        <form onSubmit={onSubmit} className="space-y-6">
          <section className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
              Product details
            </h3>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Product name">
                <TextInput required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </Field>
              <Field label="Internal code" hint="Used for inventory later — not shown on POS">
                <TextInput required value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
              </Field>
            </div>
            <Field label="Description">
              <TextArea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </Field>
            <Field label="Image">
              <input type="file" accept="image/*" onChange={onUpload} />
              {form.imageUrl && (
                <img src={imageSrc(form.imageUrl)} alt="" className="mt-2 h-20 w-20 rounded-lg object-cover" />
              )}
            </Field>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
              Classification
            </h3>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Category">
                <Select
                  required
                  value={form.categoryId}
                  onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
                >
                  <option value="">Select category</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Preparation station">
                <Select
                  value={form.kitchenStationId}
                  onChange={(e) => setForm({ ...form, kitchenStationId: e.target.value })}
                >
                  <option value="">None</option>
                  {stations.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
              Pricing & settings
            </h3>
            <Field label="Base price">
              <TextInput
                type="number"
                min="0"
                step="0.01"
                required
                value={form.basePrice}
                onChange={(e) => setForm({ ...form, basePrice: e.target.value })}
              />
            </Field>
            <Field label="Prep time (minutes)" hint="Used for auto READY after submit">
              <TextInput
                type="number"
                min="0"
                max="240"
                required
                value={form.prepTimeMinutes}
                onChange={(e) => setForm({ ...form, prepTimeMinutes: e.target.value })}
              />
            </Field>
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.trackInventory}
                  onChange={(e) => setForm({ ...form, trackInventory: e.target.checked })}
                />
                Track inventory
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.isAvailable}
                  onChange={(e) => setForm({ ...form, isAvailable: e.target.checked })}
                />
                Available
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                />
                Active
              </label>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
              Variants
            </h3>
            <div className="space-y-2">
              {variants.map((v, idx) => (
                <div key={v.id || `${v.name}-${idx}`} className="flex items-center justify-between rounded-lg border border-[var(--color-line)] px-3 py-2 text-sm">
                  <span>
                    {v.name} · {money(v.price)}
                  </span>
                  {v.id && hasPermission('menu.update') && (
                    <Button
                      variant="ghost"
                      type="button"
                      onClick={async () => {
                        try {
                          await menuApi.setVariantStatus(v.id, !v.isActive);
                          setVariants((prev) =>
                            prev.map((x) => (x.id === v.id ? { ...x, isActive: !x.isActive } : x))
                          );
                        } catch (err) {
                          toast.error(err.response?.data?.message || 'Failed');
                        }
                      }}
                    >
                      {v.isActive === false ? 'Activate' : 'Deactivate'}
                    </Button>
                  )}
                </div>
              ))}
            </div>
            <div className="grid gap-2 md:grid-cols-4">
              <TextInput
                placeholder="Variant name"
                value={variantDraft.name}
                onChange={(e) => setVariantDraft({ ...variantDraft, name: e.target.value })}
              />
              <TextInput
                type="number"
                min="0"
                step="0.01"
                placeholder="Price"
                value={variantDraft.price}
                onChange={(e) => setVariantDraft({ ...variantDraft, price: e.target.value })}
              />
              <TextInput
                placeholder="SKU (optional)"
                value={variantDraft.sku}
                onChange={(e) => setVariantDraft({ ...variantDraft, sku: e.target.value })}
              />
              <Button type="button" variant="secondary" onClick={addVariant}>
                Add variant
              </Button>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
              Customization groups
            </h3>
            <p className="text-xs text-[var(--color-ink-muted)]">
              These options appear when a cashier selects this product on the POS.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {groups.map((g) => {
                const checked = assignedGroups.some((a) => a.modifierGroupId === g.id);
                return (
                  <label
                    key={g.id}
                    className="flex items-center gap-2 rounded-lg border border-[var(--color-line)] px-3 py-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleAssignedGroup(g.id, g.name)}
                    />
                    <span>
                      {g.name}
                      <span className="ml-1 text-xs text-[var(--color-ink-muted)]">
                        ({g.selectionType === 'SINGLE' ? 'choose one' : 'choose many'})
                      </span>
                    </span>
                  </label>
                );
              })}
              {!groups.length && (
                <p className="text-sm text-[var(--color-ink-muted)]">
                  Create customization groups first, then assign them here.
                </p>
              )}
            </div>
          </section>

          <div className="flex justify-end gap-2 border-t border-[var(--color-line)] pt-4">
            <Button variant="secondary" type="button" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save product'}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDeleteModal
        open={Boolean(deleting)}
        title="Delete product"
        itemName={deleting?.name}
        message="It will be removed from the menu (order history is kept)."
        loading={deleteBusy}
        onConfirm={confirmDelete}
        onClose={() => !deleteBusy && setDeleting(null)}
      />
    </div>
  );
}

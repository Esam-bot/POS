import { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { inventoryApi, qty } from '../../services/inventoryService';
import { menuApi } from '../../services/menuService';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/ui/Toast';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import { Field, TextInput, Select } from '../../components/ui/Input';

export default function InventoryRecipesPage() {
  const { hasPermission } = useAuth();
  const toast = useToast();
  const canEdit = hasPermission('inventory.update');
  const [recipes, setRecipes] = useState([]);
  const [products, setProducts] = useState([]);
  const [ingredients, setIngredients] = useState([]);
  const [modifiers, setModifiers] = useState([]);
  const [open, setOpen] = useState(false);
  const [modOpen, setModOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    menuItemId: '',
    variantId: '',
    items: [{ ingredientId: '', quantity: '' }],
  });
  const [modForm, setModForm] = useState({
    modifierId: '',
    items: [{ ingredientId: '', quantity: '' }],
  });

  const load = useCallback(async () => {
    try {
      const [r, p, i, modGroups] = await Promise.all([
        inventoryApi.listRecipes({ limit: 100 }),
        inventoryApi.listMenuProducts(),
        inventoryApi.listItems({ isActive: true, limit: 100 }),
        menuApi.listModifierGroups({ limit: 100 }).catch(() => ({ items: [] })),
      ]);
      setRecipes(r.items);
      setProducts(p);
      setIngredients(i.items);
      const flat = [];
      for (const g of modGroups.items || []) {
        for (const m of g.modifiers || []) {
          flat.push({ id: m.id, name: `${g.name}: ${m.name}` });
        }
      }
      setModifiers(flat);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load recipes');
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const selectedProduct = products.find((p) => p.id === form.menuItemId);

  function openCreate() {
    setForm({
      menuItemId: products[0]?.id || '',
      variantId: '',
      items: [{ ingredientId: ingredients[0]?.id || '', quantity: '' }],
    });
    setOpen(true);
  }

  async function saveRecipe(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await inventoryApi.saveRecipe({
        menuItemId: form.menuItemId,
        variantId: form.variantId || null,
        items: form.items
          .filter((i) => i.ingredientId && Number(i.quantity) > 0)
          .map((i) => ({ ingredientId: i.ingredientId, quantity: Number(i.quantity) })),
      });
      toast.success('Recipe saved');
      setOpen(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function deactivate(id) {
    try {
      await inventoryApi.deactivateRecipe(id);
      toast.success('Recipe deactivated');
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed');
    }
  }

  async function openModifierMap() {
    setModForm({
      modifierId: modifiers[0]?.id || '',
      items: [{ ingredientId: ingredients[0]?.id || '', quantity: '' }],
    });
    setModOpen(true);
  }

  async function loadModifier(modifierId) {
    try {
      const data = await inventoryApi.getModifierIngredients(modifierId);
      setModForm({
        modifierId,
        items: data.items.length
          ? data.items.map((i) => ({
              ingredientId: i.ingredientId,
              quantity: String(i.quantity),
            }))
          : [{ ingredientId: ingredients[0]?.id || '', quantity: '' }],
      });
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load customization');
    }
  }

  async function saveModifier(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await inventoryApi.saveModifierIngredients(modForm.modifierId, {
        items: modForm.items
          .filter((i) => i.ingredientId && Number(i.quantity) > 0)
          .map((i) => ({ ingredientId: i.ingredientId, quantity: Number(i.quantity) })),
      });
      toast.success('Customization ingredients saved');
      setModOpen(false);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {canEdit && (
          <>
            <Button onClick={openCreate}>
              <Plus className="mr-1 h-4 w-4" /> Add / edit recipe
            </Button>
            <Button variant="secondary" onClick={openModifierMap} disabled={!modifiers.length}>
              Extra ingredients for customizations
            </Button>
          </>
        )}
      </div>

      <div className="space-y-3">
        {recipes.map((r) => (
          <div
            key={r.id}
            className="rounded-xl border border-[var(--color-line)] bg-white p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold">
                  {r.menuItemName}
                  {r.variantName ? ` · ${r.variantName}` : ''}
                </h3>
                <Badge tone={r.isActive ? 'success' : 'muted'}>
                  {r.isActive ? 'Active' : 'Inactive'}
                </Badge>
              </div>
              {canEdit && r.isActive && (
                <Button variant="secondary" onClick={() => deactivate(r.id)}>
                  Deactivate
                </Button>
              )}
            </div>
            <ul className="mt-3 space-y-1 text-sm">
              {r.items.map((i) => (
                <li key={i.id} className="flex justify-between gap-3">
                  <span>{i.ingredientName}</span>
                  <span className="text-[var(--color-ink-muted)]">
                    {qty(i.quantity)} {i.unitName}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
        {!recipes.length && (
          <p className="text-[var(--color-ink-muted)]">
            No recipes yet. Link a menu product to its ingredients so stock reduces after payment.
          </p>
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Product recipe">
        <form className="space-y-3" onSubmit={saveRecipe}>
          <Field label="Menu product" required>
            <Select
              value={form.menuItemId}
              onChange={(e) =>
                setForm({ ...form, menuItemId: e.target.value, variantId: '' })
              }
              required
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          {(selectedProduct?.variants || []).length > 0 && (
            <Field label="Variant (optional)">
              <Select
                value={form.variantId}
                onChange={(e) => setForm({ ...form, variantId: e.target.value })}
              >
                <option value="">Base product</option>
                {selectedProduct.variants.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <div className="space-y-2">
            <p className="text-sm font-medium">Ingredients per serving</p>
            {form.items.map((line, idx) => (
              <div key={idx} className="flex gap-2">
                <Select
                  className="flex-1"
                  value={line.ingredientId}
                  onChange={(e) => {
                    const items = [...form.items];
                    items[idx] = { ...items[idx], ingredientId: e.target.value };
                    setForm({ ...form, items });
                  }}
                >
                  {ingredients.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name} ({i.unitName})
                    </option>
                  ))}
                </Select>
                <TextInput
                  className="w-28"
                  type="number"
                  step="any"
                  min="0"
                  placeholder="Qty"
                  value={line.quantity}
                  onChange={(e) => {
                    const items = [...form.items];
                    items[idx] = { ...items[idx], quantity: e.target.value };
                    setForm({ ...form, items });
                  }}
                  required
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() =>
                    setForm({
                      ...form,
                      items: form.items.filter((_, i) => i !== idx),
                    })
                  }
                  disabled={form.items.length <= 1}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="secondary"
              onClick={() =>
                setForm({
                  ...form,
                  items: [
                    ...form.items,
                    { ingredientId: ingredients[0]?.id || '', quantity: '' },
                  ],
                })
              }
            >
              Add ingredient
            </Button>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save recipe'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={modOpen}
        onClose={() => setModOpen(false)}
        title="Customization ingredients"
      >
        <form className="space-y-3" onSubmit={saveModifier}>
          <Field label="Customization" required>
            <Select
              value={modForm.modifierId}
              onChange={(e) => loadModifier(e.target.value)}
              required
            >
              {modifiers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
          </Field>
          <p className="text-xs text-[var(--color-ink-muted)]">
            Example: Extra Cheese can use additional cheese from inventory when selected on POS.
          </p>
          {modForm.items.map((line, idx) => (
            <div key={idx} className="flex gap-2">
              <Select
                className="flex-1"
                value={line.ingredientId}
                onChange={(e) => {
                  const items = [...modForm.items];
                  items[idx] = { ...items[idx], ingredientId: e.target.value };
                  setModForm({ ...modForm, items });
                }}
              >
                {ingredients.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </Select>
              <TextInput
                className="w-28"
                type="number"
                step="any"
                min="0"
                value={line.quantity}
                onChange={(e) => {
                  const items = [...modForm.items];
                  items[idx] = { ...items[idx], quantity: e.target.value };
                  setModForm({ ...modForm, items });
                }}
              />
            </div>
          ))}
          <Button
            type="button"
            variant="secondary"
            onClick={() =>
              setModForm({
                ...modForm,
                items: [
                  ...modForm.items,
                  { ingredientId: ingredients[0]?.id || '', quantity: '' },
                ],
              })
            }
          >
            Add ingredient
          </Button>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setModOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              Save
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

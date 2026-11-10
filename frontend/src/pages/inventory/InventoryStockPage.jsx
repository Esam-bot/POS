import { useCallback, useEffect, useState } from 'react';
import { inventoryApi, qty } from '../../services/inventoryService';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/ui/Toast';
import Button from '../../components/ui/Button';
import { Field, TextInput, Select, TextArea } from '../../components/ui/Input';

export default function InventoryStockPage() {
  const { hasPermission } = useAuth();
  const toast = useToast();
  const canEdit = hasPermission('inventory.update');
  const [items, setItems] = useState([]);
  const [mode, setMode] = useState('add');
  const [form, setForm] = useState({
    ingredientId: '',
    quantity: '',
    unitCost: '',
    newStock: '',
    notes: '',
    reason: '',
  });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await inventoryApi.listItems({ isActive: true, limit: 100 });
      setItems(data.items);
      setForm((f) => ({ ...f, ingredientId: f.ingredientId || data.items[0]?.id || '' }));
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load items');
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const selected = items.find((i) => i.id === form.ingredientId);

  async function onSubmit(e) {
    e.preventDefault();
    if (!canEdit) return;
    setSaving(true);
    try {
      if (mode === 'add') {
        await inventoryApi.addStock({
          ingredientId: form.ingredientId,
          quantity: Number(form.quantity),
          unitCost: form.unitCost === '' ? null : Number(form.unitCost),
          notes: form.notes || null,
        });
        toast.success('Stock added');
      } else if (mode === 'adjust') {
        await inventoryApi.adjustStock({
          ingredientId: form.ingredientId,
          newStock: Number(form.newStock),
          reason: form.reason.trim(),
        });
        toast.success('Stock adjusted');
      } else {
        await inventoryApi.wasteStock({
          ingredientId: form.ingredientId,
          quantity: Number(form.quantity),
          reason: form.reason.trim(),
        });
        toast.success('Wastage recorded');
      }
      setForm((f) => ({ ...f, quantity: '', unitCost: '', newStock: '', notes: '', reason: '' }));
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Update failed');
    } finally {
      setSaving(false);
    }
  }

  if (!canEdit) {
    return (
      <p className="text-[var(--color-ink-muted)]">
        You can view stock history, but only inventory managers can change stock levels.
      </p>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div className="flex flex-wrap gap-2">
        {[
          { id: 'add', label: 'Add stock' },
          { id: 'adjust', label: 'Adjust stock' },
          { id: 'waste', label: 'Record wastage' },
        ].map((t) => (
          <Button
            key={t.id}
            variant={mode === t.id ? 'primary' : 'secondary'}
            onClick={() => setMode(t.id)}
          >
            {t.label}
          </Button>
        ))}
      </div>

      <form
        onSubmit={onSubmit}
        className="space-y-3 rounded-xl border border-[var(--color-line)] bg-white p-4"
      >
        <Field label="Inventory item" required>
          <Select
            value={form.ingredientId}
            onChange={(e) => setForm({ ...form, ingredientId: e.target.value })}
            required
          >
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name} ({qty(i.currentStock)} {i.unitName})
              </option>
            ))}
          </Select>
        </Field>

        {selected && (
          <p className="text-sm text-[var(--color-ink-muted)]">
            Current stock: <strong>{qty(selected.currentStock)}</strong> {selected.unitName}
          </p>
        )}

        {mode === 'add' && (
          <>
            <Field label="Quantity to add" required>
              <TextInput
                type="number"
                step="any"
                min="0.0001"
                value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                required
              />
            </Field>
            <Field label="Purchase cost (per unit)">
              <TextInput
                type="number"
                step="any"
                min="0"
                value={form.unitCost}
                onChange={(e) => setForm({ ...form, unitCost: e.target.value })}
              />
            </Field>
            <Field label="Note (optional)">
              <TextArea
                rows={2}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </Field>
          </>
        )}

        {mode === 'adjust' && (
          <>
            <Field label="Correct stock quantity" required>
              <TextInput
                type="number"
                step="any"
                min="0"
                value={form.newStock}
                onChange={(e) => setForm({ ...form, newStock: e.target.value })}
                required
              />
            </Field>
            <Field label="Reason" required>
              <TextArea
                rows={2}
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
                required
              />
            </Field>
          </>
        )}

        {mode === 'waste' && (
          <>
            <Field label="Quantity wasted" required>
              <TextInput
                type="number"
                step="any"
                min="0.0001"
                value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                required
              />
            </Field>
            <Field label="Reason" required>
              <TextArea
                rows={2}
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
                required
              />
            </Field>
          </>
        )}

        <Button type="submit" disabled={saving || !form.ingredientId}>
          {saving ? 'Saving…' : 'Save change'}
        </Button>
      </form>
    </div>
  );
}

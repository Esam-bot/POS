import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { inventoryApi, qty } from '../../services/inventoryService';
import { money } from '../../utils/formatMoney';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/ui/Toast';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import { Field, TextInput, Select, TextArea } from '../../components/ui/Input';

function statusTone(s) {
  if (s === 'RECEIVED') return 'success';
  if (s === 'PARTIAL') return 'warning';
  if (s === 'CANCELLED') return 'muted';
  return 'brand';
}

export default function InventoryPurchasesPage() {
  const { hasPermission } = useAuth();
  const toast = useToast();
  const canEdit = hasPermission('purchases.manage');
  const [rows, setRows] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [ingredients, setIngredients] = useState([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [active, setActive] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    supplierId: '',
    notes: '',
    submit: true,
    items: [{ ingredientId: '', qtyOrdered: '', unitCost: '' }],
  });
  const [receiveQty, setReceiveQty] = useState({});

  const load = useCallback(async () => {
    try {
      const [p, s, i] = await Promise.all([
        inventoryApi.listPurchases({ limit: 50 }),
        inventoryApi.listSuppliers({ limit: 100, isActive: true }),
        inventoryApi.listItems({ isActive: true, limit: 100 }),
      ]);
      setRows(p.items || []);
      setSuppliers(s.items || s || []);
      setIngredients(i.items || []);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load purchases');
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const createTotal = useMemo(
    () =>
      form.items.reduce(
        (sum, line) => sum + Number(line.qtyOrdered || 0) * Number(line.unitCost || 0),
        0
      ),
    [form.items]
  );

  async function createPurchase(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await inventoryApi.createPurchase({
        supplierId: form.supplierId,
        notes: form.notes || null,
        submit: form.submit,
        items: form.items.map((line) => ({
          ingredientId: line.ingredientId,
          qtyOrdered: Number(line.qtyOrdered),
          unitCost: Number(line.unitCost),
        })),
      });
      toast.success('Purchase created');
      setCreateOpen(false);
      setForm({
        supplierId: '',
        notes: '',
        submit: true,
        items: [{ ingredientId: '', qtyOrdered: '', unitCost: '' }],
      });
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Create failed');
    } finally {
      setSaving(false);
    }
  }

  async function openReceive(row) {
    try {
      const full = await inventoryApi.getPurchase(row.id);
      setActive(full);
      const init = {};
      for (const line of full.items || []) {
        const rem = Number(line.qtyOrdered) - Number(line.qtyReceived);
        init[line.id] = rem > 0 ? String(rem) : '';
      }
      setReceiveQty(init);
      setReceiveOpen(true);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load purchase');
    }
  }

  async function submitReceive(e) {
    e.preventDefault();
    if (!active) return;
    setSaving(true);
    try {
      const items = (active.items || [])
        .map((line) => ({
          purchaseOrderItemId: line.id,
          qtyReceived: Number(receiveQty[line.id] || 0),
        }))
        .filter((l) => l.qtyReceived > 0);
      if (!items.length) {
        toast.error('Enter at least one received quantity');
        return;
      }
      await inventoryApi.receivePurchase(active.id, {
        idempotencyKey: `recv-${active.id}-${Date.now()}`,
        items,
      });
      toast.success('Stock received');
      setReceiveOpen(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Receive failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--color-ink-muted)]">
          Stock increases only when you receive deliveries
        </p>
        {canEdit && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus size={16} /> Record purchase
          </Button>
        )}
      </div>

      <div className="app-table-wrap rounded-xl border border-[var(--color-line)] bg-white">
        <table className="app-table">
          <thead>
            <tr>
              <th>Supplier</th>
              <th>Status</th>
              <th>Total</th>
              <th>Created</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="font-medium">{row.supplier?.name || '—'}</td>
                <td>
                  <Badge tone={statusTone(row.status)}>{row.status}</Badge>
                </td>
                <td>{money(row.totalCost)}</td>
                <td>{row.createdAt ? new Date(row.createdAt).toLocaleString() : '—'}</td>
                <td>
                  {canEdit && ['ORDERED', 'PARTIAL'].includes(row.status) && (
                    <Button variant="secondary" onClick={() => openReceive(row)}>
                      Receive
                    </Button>
                  )}
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={5} className="text-[var(--color-ink-muted)]">
                  No purchases yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={createOpen} title="New purchase" onClose={() => setCreateOpen(false)} wide>
        <form onSubmit={createPurchase} className="space-y-3">
          <Field label="Supplier" required>
            <Select
              required
              value={form.supplierId}
              onChange={(e) => setForm({ ...form, supplierId: e.target.value })}
            >
              <option value="">Select…</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          {form.items.map((line, idx) => (
            <div key={idx} className="grid gap-2 sm:grid-cols-3">
              <Field label="Ingredient">
                <Select
                  required
                  value={line.ingredientId}
                  onChange={(e) => {
                    const items = [...form.items];
                    items[idx] = { ...items[idx], ingredientId: e.target.value };
                    setForm({ ...form, items });
                  }}
                >
                  <option value="">Select…</option>
                  {ingredients.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name} ({i.unitName})
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Qty">
                <TextInput
                  type="number"
                  min="0"
                  step="any"
                  required
                  value={line.qtyOrdered}
                  onChange={(e) => {
                    const items = [...form.items];
                    items[idx] = { ...items[idx], qtyOrdered: e.target.value };
                    setForm({ ...form, items });
                  }}
                />
              </Field>
              <Field label="Unit cost">
                <TextInput
                  type="number"
                  min="0"
                  step="any"
                  required
                  value={line.unitCost}
                  onChange={(e) => {
                    const items = [...form.items];
                    items[idx] = { ...items[idx], unitCost: e.target.value };
                    setForm({ ...form, items });
                  }}
                />
              </Field>
            </div>
          ))}
          <Button
            type="button"
            variant="secondary"
            onClick={() =>
              setForm({
                ...form,
                items: [...form.items, { ingredientId: '', qtyOrdered: '', unitCost: '' }],
              })
            }
          >
            Add line
          </Button>
          <Field label="Notes">
            <TextArea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Field>
          <p className="text-sm font-semibold">Total: {money(createTotal)}</p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Create & order'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={receiveOpen} title="Receive stock" onClose={() => setReceiveOpen(false)}>
        <form onSubmit={submitReceive} className="space-y-3">
          {(active?.items || []).map((line) => {
            const rem = Number(line.qtyOrdered) - Number(line.qtyReceived);
            return (
              <Field
                key={line.id}
                label={`${line.ingredientName} · remaining ${qty(rem)} ${line.unitName || ''}`}
              >
                <TextInput
                  type="number"
                  min="0"
                  step="any"
                  max={rem}
                  value={receiveQty[line.id] || ''}
                  onChange={(e) => setReceiveQty({ ...receiveQty, [line.id]: e.target.value })}
                />
              </Field>
            );
          })}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setReceiveOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Receive'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

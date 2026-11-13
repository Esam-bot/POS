import { useCallback, useEffect, useState } from 'react';
import { Plus, Pencil } from 'lucide-react';
import { inventoryApi } from '../../services/inventoryService';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/ui/Toast';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import { Field, TextInput, TextArea } from '../../components/ui/Input';

const empty = { name: '', contactPerson: '', phone: '', email: '', address: '' };

export default function InventorySuppliersPage() {
  const { hasPermission } = useAuth();
  const toast = useToast();
  const canEdit = hasPermission('suppliers.manage');
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await inventoryApi.listSuppliers({ limit: 100, isActive: true });
      setRows(data.items || data || []);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load suppliers');
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        contactPerson: form.contactPerson || null,
        phone: form.phone || null,
        email: form.email || null,
        address: form.address || null,
      };
      if (editing) {
        await inventoryApi.updateSupplier(editing.id, payload);
        toast.success('Supplier updated');
      } else {
        await inventoryApi.createSupplier(payload);
        toast.success('Supplier created');
      }
      setOpen(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--color-ink-muted)]">Vendors used for purchases</p>
        {canEdit && (
          <Button
            onClick={() => {
              setEditing(null);
              setForm(empty);
              setOpen(true);
            }}
          >
            <Plus size={16} /> Add supplier
          </Button>
        )}
      </div>

      <div className="app-table-wrap rounded-xl border border-[var(--color-line)] bg-white">
        <table className="app-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Phone</th>
              <th>Email</th>
              <th>Purchases</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="font-medium">{row.name}</td>
                <td>{row.phone || '—'}</td>
                <td>{row.email || '—'}</td>
                <td>{row.purchaseCount ?? '—'}</td>
                <td>
                  <Badge tone={row.isActive ? 'success' : 'muted'}>
                    {row.isActive ? 'Active' : 'Archived'}
                  </Badge>
                </td>
                <td>
                  {canEdit && (
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setEditing(row);
                        setForm({
                          name: row.name,
                          contactPerson: row.contactPerson || '',
                          phone: row.phone || '',
                          email: row.email || '',
                          address: row.address || '',
                        });
                        setOpen(true);
                      }}
                    >
                      <Pencil size={14} />
                    </Button>
                  )}
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={6} className="text-[var(--color-ink-muted)]">
                  No suppliers yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={open} title={editing ? 'Edit supplier' : 'Add supplier'} onClose={() => setOpen(false)}>
        <form onSubmit={save} className="space-y-3">
          <Field label="Name" required>
            <TextInput required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Contact person">
            <TextInput value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} />
          </Field>
          <Field label="Phone">
            <TextInput value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </Field>
          <Field label="Email">
            <TextInput type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Field>
          <Field label="Address">
            <TextArea rows={2} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </Field>
          <div className="flex justify-end gap-2">
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

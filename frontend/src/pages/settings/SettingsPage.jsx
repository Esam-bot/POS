import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { expensesApi, settingsApi } from '../../services/billingService';
import { useToast } from '../../components/ui/Toast';
import { useAuth } from '../../context/AuthContext';
import { useRestaurant } from '../../context/RestaurantContext';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import ConfirmDeleteModal from '../../components/ui/ConfirmDeleteModal';
import { Field, TextInput, TextArea, Select } from '../../components/ui/Input';

const emptyMethod = {
  code: '',
  name: '',
  taxRate: '0',
  isCash: false,
  isActive: true,
};

export default function SettingsPage() {
  const toast = useToast();
  const { hasPermission } = useAuth();
  const { refresh: refreshRestaurant } = useRestaurant();
  const canManageSettings = hasPermission('settings.manage');
  const canManageMethods =
    hasPermission('payments.manage_methods') || hasPermission('settings.manage');
  const canManageExpenses = hasPermission('expenses.manage');

  const [restaurant, setRestaurant] = useState(null);
  const [methods, setMethods] = useState([]);
  const [categories, setCategories] = useState([]);
  const [settingsForm, setSettingsForm] = useState({
    name: '',
    address: '',
    phone: '',
    email: '',
    taxServiceCharge: false,
    taxDeliveryFee: false,
    allowPartialPayments: true,
    serviceChargeType: 'PERCENT',
    serviceChargeValue: '0',
    deliveryFeeDefault: '0',
    currencyCode: 'PKR',
    timezone: 'Asia/Karachi',
    tableCleaningMinutes: 2,
    autoReadyOnEstimate: false,
    autoReleaseTableOnPayment: false,
    useCleaningStatus: false,
    receiptFooter: '',
  });
  const [saving, setSaving] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState(emptyMethod);
  const [addBusy, setAddBusy] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [newCategory, setNewCategory] = useState('');
  const [categoryBusy, setCategoryBusy] = useState(false);
  const [archivingCategory, setArchivingCategory] = useState(null);

  async function load() {
    try {
      const [r, m] = await Promise.all([settingsApi.get(), settingsApi.listMethods()]);
      setRestaurant(r);
      setMethods(m);
      const s = r.settings || {};
      setSettingsForm({
        name: r.name || '',
        address: r.address || '',
        phone: r.phone || '',
        email: r.email || '',
        taxServiceCharge: !!s.taxServiceCharge,
        taxDeliveryFee: !!s.taxDeliveryFee,
        allowPartialPayments: s.allowPartialPayments !== false,
        serviceChargeType: s.serviceChargeType || 'PERCENT',
        serviceChargeValue: String(s.serviceChargeValue ?? 0),
        deliveryFeeDefault: String(s.deliveryFeeDefault ?? 0),
        currencyCode: s.currencyCode || 'PKR',
        timezone: s.timezone || 'Asia/Karachi',
        tableCleaningMinutes: s.tableCleaningMinutes ?? 2,
        autoReadyOnEstimate: !!s.autoReadyOnEstimate,
        autoReleaseTableOnPayment: !!s.autoReleaseTableOnPayment,
        useCleaningStatus: !!s.useCleaningStatus,
        receiptFooter: s.receiptFooter || '',
      });
      if (canManageExpenses || hasPermission('reports.view')) {
        const cats = await expensesApi.categories({ includeInactive: true }).catch(() => []);
        setCategories(cats || []);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load settings');
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function saveSettings() {
    setSaving(true);
    try {
      await settingsApi.update({
        name: settingsForm.name.trim(),
        address: settingsForm.address.trim() || null,
        phone: settingsForm.phone.trim() || null,
        email: settingsForm.email.trim() || null,
        taxServiceCharge: settingsForm.taxServiceCharge,
        taxDeliveryFee: settingsForm.taxDeliveryFee,
        allowPartialPayments: settingsForm.allowPartialPayments,
        serviceChargeType: settingsForm.serviceChargeType,
        serviceChargeValue: Number(settingsForm.serviceChargeValue) || 0,
        deliveryFeeDefault: Number(settingsForm.deliveryFeeDefault) || 0,
        currencyCode: settingsForm.currencyCode.trim().toUpperCase(),
        timezone: settingsForm.timezone.trim(),
        tableCleaningMinutes: Number(settingsForm.tableCleaningMinutes) || 2,
        autoReadyOnEstimate: settingsForm.autoReadyOnEstimate,
        autoReleaseTableOnPayment: settingsForm.autoReleaseTableOnPayment,
        useCleaningStatus: settingsForm.useCleaningStatus,
        receiptFooter: settingsForm.receiptFooter.trim() || null,
      });
      toast.success('Settings saved');
      await refreshRestaurant();
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function createMethod(e) {
    e.preventDefault();
    setAddBusy(true);
    try {
      await settingsApi.createMethod({
        code: addForm.code.trim().toUpperCase(),
        name: addForm.name.trim(),
        taxRate: Number(addForm.taxRate) || 0,
        isCash: !!addForm.isCash,
        isActive: !!addForm.isActive,
      });
      toast.success('Payment method created');
      setAddOpen(false);
      setAddForm(emptyMethod);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Create failed');
    } finally {
      setAddBusy(false);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await settingsApi.deleteMethod(deleting.id);
      toast.success(`${deleting.name} deleted`);
      setDeleting(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Delete failed');
    } finally {
      setDeleteBusy(false);
    }
  }

  async function addCategory(e) {
    e.preventDefault();
    if (!newCategory.trim()) return;
    setCategoryBusy(true);
    try {
      await expensesApi.createCategory({ name: newCategory.trim() });
      toast.success('Category created');
      setNewCategory('');
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create category');
    } finally {
      setCategoryBusy(false);
    }
  }

  async function confirmArchiveCategory() {
    if (!archivingCategory) return;
    setCategoryBusy(true);
    try {
      await expensesApi.archiveCategory(archivingCategory.id);
      toast.success('Category archived');
      setArchivingCategory(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to archive category');
    } finally {
      setCategoryBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="app-title">Settings</h1>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
          {restaurant?.name || 'Restaurant'} profile, billing, and payment configuration
        </p>
      </div>

      <section className="max-w-2xl space-y-4 rounded-xl border border-[var(--color-line)] bg-white p-5">
        <h2 className="app-section-title">Restaurant profile</h2>
        <Field label="Restaurant name" required>
          <TextInput
            value={settingsForm.name}
            disabled={!canManageSettings}
            onChange={(e) => setSettingsForm({ ...settingsForm, name: e.target.value })}
          />
        </Field>
        <Field label="Address">
          <TextArea
            rows={2}
            value={settingsForm.address}
            disabled={!canManageSettings}
            onChange={(e) => setSettingsForm({ ...settingsForm, address: e.target.value })}
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Phone">
            <TextInput
              value={settingsForm.phone}
              disabled={!canManageSettings}
              onChange={(e) => setSettingsForm({ ...settingsForm, phone: e.target.value })}
            />
          </Field>
          <Field label="Email">
            <TextInput
              type="email"
              value={settingsForm.email}
              disabled={!canManageSettings}
              onChange={(e) => setSettingsForm({ ...settingsForm, email: e.target.value })}
            />
          </Field>
        </div>
      </section>

      <section className="max-w-2xl space-y-4 rounded-xl border border-[var(--color-line)] bg-white p-5">
        <h2 className="app-section-title">Fees, currency & locale</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Default delivery fee">
            <TextInput
              type="number"
              min="0"
              step="0.01"
              value={settingsForm.deliveryFeeDefault}
              disabled={!canManageSettings}
              onChange={(e) =>
                setSettingsForm({ ...settingsForm, deliveryFeeDefault: e.target.value })
              }
            />
          </Field>
          <Field label="Service charge type">
            <Select
              value={settingsForm.serviceChargeType}
              disabled={!canManageSettings}
              onChange={(e) =>
                setSettingsForm({ ...settingsForm, serviceChargeType: e.target.value })
              }
            >
              <option value="PERCENT">Percent</option>
              <option value="FIXED">Fixed</option>
            </Select>
          </Field>
          <Field label="Service charge value">
            <TextInput
              type="number"
              min="0"
              step="0.01"
              value={settingsForm.serviceChargeValue}
              disabled={!canManageSettings}
              onChange={(e) =>
                setSettingsForm({ ...settingsForm, serviceChargeValue: e.target.value })
              }
            />
          </Field>
          <Field label="Currency code" hint="ISO code stored in settings (e.g. PKR)">
            <TextInput
              value={settingsForm.currencyCode}
              disabled={!canManageSettings}
              maxLength={3}
              onChange={(e) =>
                setSettingsForm({
                  ...settingsForm,
                  currencyCode: e.target.value.toUpperCase().replace(/[^A-Z]/g, ''),
                })
              }
            />
          </Field>
          <Field label="Timezone">
            <TextInput
              value={settingsForm.timezone}
              disabled={!canManageSettings}
              onChange={(e) => setSettingsForm({ ...settingsForm, timezone: e.target.value })}
              placeholder="Asia/Karachi"
            />
          </Field>
        </div>
      </section>

      <section className="max-w-2xl space-y-4 rounded-xl border border-[var(--color-line)] bg-white p-5">
        <h2 className="app-section-title">Operations</h2>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={settingsForm.taxServiceCharge}
            disabled={!canManageSettings}
            onChange={(e) =>
              setSettingsForm({ ...settingsForm, taxServiceCharge: e.target.checked })
            }
          />
          Apply payment-method tax to service charge
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={settingsForm.taxDeliveryFee}
            disabled={!canManageSettings}
            onChange={(e) =>
              setSettingsForm({ ...settingsForm, taxDeliveryFee: e.target.checked })
            }
          />
          Apply payment-method tax to delivery fee
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={settingsForm.allowPartialPayments}
            disabled={!canManageSettings}
            onChange={(e) =>
              setSettingsForm({ ...settingsForm, allowPartialPayments: e.target.checked })
            }
          />
          Allow partial payments
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={settingsForm.autoReadyOnEstimate}
            disabled={!canManageSettings}
            onChange={(e) =>
              setSettingsForm({ ...settingsForm, autoReadyOnEstimate: e.target.checked })
            }
          />
          Auto-mark orders READY when prep estimate elapses (off = kitchen confirms on KDS)
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={settingsForm.autoReleaseTableOnPayment}
            disabled={!canManageSettings}
            onChange={(e) =>
              setSettingsForm({ ...settingsForm, autoReleaseTableOnPayment: e.target.checked })
            }
          />
          Auto-release dine-in tables after full payment
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={settingsForm.useCleaningStatus}
            disabled={!canManageSettings}
            onChange={(e) =>
              setSettingsForm({ ...settingsForm, useCleaningStatus: e.target.checked })
            }
          />
          Use CLEANING status before tables become available
        </label>
        <Field
          label="Table cleaning minutes"
          hint="After guests leave, tables stay CLEANING then auto-AVAILABLE"
        >
          <TextInput
            type="number"
            min="1"
            max="60"
            disabled={!canManageSettings}
            value={settingsForm.tableCleaningMinutes}
            onChange={(e) =>
              setSettingsForm({
                ...settingsForm,
                tableCleaningMinutes: Number(e.target.value) || 2,
              })
            }
          />
        </Field>
        <Field label="Receipt footer">
          <TextArea
            rows={2}
            disabled={!canManageSettings}
            value={settingsForm.receiptFooter}
            onChange={(e) => setSettingsForm({ ...settingsForm, receiptFooter: e.target.value })}
          />
        </Field>
        {canManageSettings && (
          <Button disabled={saving} onClick={saveSettings}>
            {saving ? 'Saving…' : 'Save settings'}
          </Button>
        )}
      </section>

      {canManageExpenses || hasPermission('reports.view') ? (
        <section className="max-w-2xl space-y-4 rounded-xl border border-[var(--color-line)] bg-white p-5">
          <h2 className="app-section-title">Expense categories</h2>
          <p className="text-sm text-[var(--color-ink-muted)]">
            Managed in the database. Archive removes a category from new expenses without deleting
            history.
          </p>
          {canManageExpenses ? (
            <form onSubmit={addCategory} className="flex flex-wrap items-end gap-2">
              <Field label="New category">
                <TextInput
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  placeholder="e.g. Packaging"
                />
              </Field>
              <Button type="submit" disabled={categoryBusy || !newCategory.trim()}>
                <Plus size={16} />
                Add
              </Button>
            </form>
          ) : null}
          <ul className="divide-y divide-[var(--color-line)] rounded-lg border border-[var(--color-line)]">
            {categories.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                <span className={!c.isActive ? 'text-[var(--color-ink-muted)] line-through' : ''}>
                  {c.name}
                  {!c.isActive ? ' (archived)' : ''}
                </span>
                {canManageExpenses && c.isActive ? (
                  <button
                    type="button"
                    className="rounded-md p-1.5 text-[var(--color-ink-muted)] hover:bg-red-50 hover:text-[var(--color-danger)]"
                    aria-label={`Archive ${c.name}`}
                    onClick={() => setArchivingCategory(c)}
                  >
                    <Trash2 size={14} />
                  </button>
                ) : null}
              </li>
            ))}
            {!categories.length ? (
              <li className="px-3 py-4 text-[var(--color-ink-muted)]">No categories yet.</li>
            ) : null}
          </ul>
        </section>
      ) : null}

      <section className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="app-section-title">Payment methods & tax rates</h2>
            <p className="text-sm text-[var(--color-ink-muted)]">
              Changing a tax rate applies to future payments only. Historical payments keep their
              snapshot rate.
            </p>
          </div>
          {canManageMethods && (
            <Button
              onClick={() => {
                setAddForm(emptyMethod);
                setAddOpen(true);
              }}
            >
              <Plus size={16} />
              Add payment method
            </Button>
          )}
        </div>
        <div className="app-table-wrap">
          <table className="app-table">
            <thead>
              <tr>
                <th>Payment method</th>
                <th>Code</th>
                <th>Tax %</th>
                <th>Active</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {methods.map((m) => (
                <tr key={m.id}>
                  <td>
                    <TextInput
                      value={m.name}
                      onChange={(e) =>
                        setMethods(
                          methods.map((x) =>
                            x.id === m.id ? { ...x, name: e.target.value } : x
                          )
                        )
                      }
                    />
                  </td>
                  <td className="px-4 py-3 text-xs text-[var(--color-ink-muted)]">
                    {m.code}
                    {m.isCash ? ' · Cash' : ''}
                  </td>
                  <td className="px-4 py-3">
                    <TextInput
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      className="w-24"
                      value={m.taxRate}
                      onChange={(e) =>
                        setMethods(
                          methods.map((x) =>
                            x.id === m.id ? { ...x, taxRate: e.target.value } : x
                          )
                        )
                      }
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={!!m.isActive}
                      onChange={(e) =>
                        setMethods(
                          methods.map((x) =>
                            x.id === m.id ? { ...x, isActive: e.target.checked } : x
                          )
                        )
                      }
                    />
                  </td>
                  <td className="px-4 py-3">
                    {canManageMethods && (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="secondary"
                          onClick={async () => {
                            try {
                              await settingsApi.updateMethod(m.id, {
                                name: m.name,
                                taxRate: Number(m.taxRate),
                                isActive: !!m.isActive,
                              });
                              toast.success(`${m.code} updated`);
                              load();
                            } catch (err) {
                              toast.error(err.response?.data?.message || 'Update failed');
                            }
                          }}
                        >
                          Save
                        </Button>
                        {m.code !== 'CASH' && (
                          <Button variant="danger" onClick={() => setDeleting(m)}>
                            <Trash2 size={14} />
                            Delete
                          </Button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {!methods.length && (
                <tr>
                  <td colSpan={5} className="py-8 text-[var(--color-ink-muted)]">
                    No payment methods yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <Modal
        open={addOpen}
        title="Add payment method"
        onClose={() => !addBusy && setAddOpen(false)}
      >
        <form onSubmit={createMethod} className="space-y-4">
          <Field
            label="Code"
            hint="Uppercase identifier used in reports (e.g. WALLET, RAZORPAY)"
          >
            <TextInput
              required
              value={addForm.code}
              onChange={(e) =>
                setAddForm({
                  ...addForm,
                  code: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''),
                })
              }
              placeholder="WALLET"
            />
          </Field>
          <Field label="Display name">
            <TextInput
              required
              value={addForm.name}
              onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
              placeholder="Mobile Wallet"
            />
          </Field>
          <Field label="Tax %">
            <TextInput
              type="number"
              min="0"
              max="100"
              step="0.01"
              required
              value={addForm.taxRate}
              onChange={(e) => setAddForm({ ...addForm, taxRate: e.target.value })}
            />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={addForm.isCash}
              onChange={(e) => setAddForm({ ...addForm, isCash: e.target.checked })}
            />
            Treat as cash (tender / change)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={addForm.isActive}
              onChange={(e) => setAddForm({ ...addForm, isActive: e.target.checked })}
            />
            Active
          </label>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={addBusy}
              onClick={() => setAddOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={addBusy}>
              {addBusy ? 'Creating…' : 'Create'}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDeleteModal
        open={Boolean(deleting)}
        title="Delete payment method"
        itemName={deleting ? `${deleting.name} (${deleting.code})` : undefined}
        message="Past payments keep their history; the method will no longer appear at checkout."
        loading={deleteBusy}
        onConfirm={confirmDelete}
        onClose={() => !deleteBusy && setDeleting(null)}
      />

      <ConfirmDeleteModal
        open={Boolean(archivingCategory)}
        title="Archive expense category"
        itemName={archivingCategory?.name}
        message="Existing expenses keep this category. It will no longer appear when adding new expenses."
        confirmLabel="Archive"
        loading={categoryBusy}
        onConfirm={confirmArchiveCategory}
        onClose={() => !categoryBusy && setArchivingCategory(null)}
      />
    </div>
  );
}

import { useEffect, useState } from 'react';
import { settingsApi } from '../../services/billingService';
import { useToast } from '../../components/ui/Toast';
import { useAuth } from '../../context/AuthContext';
import Button from '../../components/ui/Button';
import { Field, TextInput, TextArea } from '../../components/ui/Input';

export default function SettingsPage() {
  const toast = useToast();
  const { hasPermission } = useAuth();
  const [restaurant, setRestaurant] = useState(null);
  const [methods, setMethods] = useState([]);
  const [settingsForm, setSettingsForm] = useState({
    taxServiceCharge: false,
    taxDeliveryFee: false,
    allowPartialPayments: true,
    autoReleaseTableOnPayment: true,
    useCleaningStatus: false,
    receiptFooter: '',
  });
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      const [r, m] = await Promise.all([settingsApi.get(), settingsApi.listMethods()]);
      setRestaurant(r);
      setMethods(m);
      const s = r.settings || {};
      setSettingsForm({
        taxServiceCharge: !!s.taxServiceCharge,
        taxDeliveryFee: !!s.taxDeliveryFee,
        allowPartialPayments: s.allowPartialPayments !== false,
        autoReleaseTableOnPayment: s.autoReleaseTableOnPayment !== false,
        useCleaningStatus: !!s.useCleaningStatus,
        receiptFooter: s.receiptFooter || '',
      });
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load settings');
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="app-title">Settings</h1>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
          {restaurant?.name || 'Restaurant'} billing and payment configuration
        </p>
      </div>

      <section className="max-w-2xl space-y-4 rounded-xl border border-[var(--color-line)] bg-white p-5">
        <h2 className="app-section-title">Taxable charges</h2>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={settingsForm.taxServiceCharge}
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
            onChange={(e) =>
              setSettingsForm({ ...settingsForm, allowPartialPayments: e.target.checked })
            }
          />
          Allow partial payments
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={settingsForm.autoReleaseTableOnPayment}
            onChange={(e) =>
              setSettingsForm({
                ...settingsForm,
                autoReleaseTableOnPayment: e.target.checked,
              })
            }
          />
          Auto-free dine-in tables when the bill is fully settled
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={settingsForm.useCleaningStatus}
            onChange={(e) =>
              setSettingsForm({ ...settingsForm, useCleaningStatus: e.target.checked })
            }
          />
          Set tables to Cleaning (instead of Available) on auto-release
        </label>
        <Field label="Receipt footer">
          <TextArea
            rows={2}
            value={settingsForm.receiptFooter}
            onChange={(e) => setSettingsForm({ ...settingsForm, receiptFooter: e.target.value })}
          />
        </Field>
        {hasPermission('settings.manage') && (
          <Button
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              try {
                await settingsApi.update(settingsForm);
                toast.success('Settings saved');
                load();
              } catch (err) {
                toast.error(err.response?.data?.message || 'Save failed');
              } finally {
                setSaving(false);
              }
            }}
          >
            Save settings
          </Button>
        )}
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="app-section-title">Payment methods & tax rates</h2>
          <p className="text-sm text-[var(--color-ink-muted)]">
            Changing a tax rate applies to future payments only. Historical payments keep their
            snapshot rate.
          </p>
        </div>
        <div className="app-table-wrap">
          <table className="app-table">
            <thead>
              <tr>
                <th>Payment method</th>
                <th>Type</th>
                <th>Tax %</th>
                <th>Active</th>
                <th />
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
                    {m.isCash ? 'Cash' : m.name}
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
                    {(hasPermission('payments.manage_methods') ||
                      hasPermission('settings.manage')) && (
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
                            if (Number(m.taxRate) !== Number(m._prevTax)) {
                              toast.info?.(
                                'New tax rate applies to future payments only'
                              );
                            }
                            load();
                          } catch (err) {
                            toast.error(err.response?.data?.message || 'Update failed');
                          }
                        }}
                      >
                        Save
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

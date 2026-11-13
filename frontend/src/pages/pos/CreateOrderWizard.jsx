import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Package,
  Table2,
  Truck,
  UserRound,
} from 'lucide-react';
import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';
import { Field, TextInput } from '../../components/ui/Input';
import { customersApi } from '../../services/customersService';

const ORDER_TYPES = [
  {
    value: 'DINE_IN',
    label: 'Dine-In',
    description: 'Seat guests at a table',
    icon: Table2,
  },
  {
    value: 'TAKEAWAY',
    label: 'Takeaway',
    description: 'Collect at the counter',
    icon: Package,
  },
  {
    value: 'DELIVERY',
    label: 'Delivery',
    description: 'Send to a customer address',
    icon: Truck,
  },
];

const emptyForm = {
  name: '',
  phone: '',
  line1: '',
  city: '',
  saveAddress: false,
  customerId: null,
};

/**
 * Multi-step create-order wizard. Does not create orders/sessions itself —
 * returns collected guest + type to the parent via onContinue.
 */
export default function CreateOrderWizard({ open, onClose, onContinue }) {
  const [step, setStep] = useState('type'); // type | details
  const [orderType, setOrderType] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const suggestRef = useRef(null);

  useEffect(() => {
    if (!open) {
      setStep('type');
      setOrderType('');
      setForm(emptyForm);
      setError('');
      setBusy(false);
      setSuggestions([]);
      setShowSuggestions(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open || orderType !== 'DELIVERY') return undefined;
    const term = form.name.trim().length >= 2 ? form.name.trim() : form.phone.trim();
    if (term.length < 2) {
      setSuggestions([]);
      return undefined;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const data = await customersApi.search(term, { limit: 8 });
        if (!cancelled) {
          setSuggestions(data.items || []);
          setShowSuggestions(true);
        }
      } catch {
        if (!cancelled) setSuggestions([]);
      } finally {
        if (!cancelled) setSearchLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, orderType, form.name, form.phone]);

  useEffect(() => {
    function onDocClick(e) {
      if (!suggestRef.current?.contains(e.target)) setShowSuggestions(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  function pickSuggestion(row) {
    const addr = row.defaultAddress;
    setForm((prev) => ({
      ...prev,
      name: row.name || '',
      phone: row.phone || '',
      customerId: row.id || null,
      line1: addr?.line1 || '',
      city: addr?.city || '',
      saveAddress: false,
    }));
    setSuggestions([]);
    setShowSuggestions(false);
  }

  function selectType(type) {
    setOrderType(type);
    setForm(emptyForm);
    setError('');
    setStep('details');
  }

  function validate() {
    if (!form.name.trim()) return 'Customer name is required';
    if (
      (orderType === 'DINE_IN' || orderType === 'TAKEAWAY') &&
      form.phone.trim() &&
      (form.phone.trim().length < 7 || !/^[0-9+\-\s()]+$/.test(form.phone.trim()))
    ) {
      return 'Enter a valid phone number';
    }
    if (orderType === 'DELIVERY') {
      if (!form.phone.trim() || form.phone.trim().length < 7) {
        return 'Phone number is required';
      }
      if (!/^[0-9+\-\s()]+$/.test(form.phone.trim())) {
        return 'Enter a valid phone number';
      }
      if (!form.line1.trim()) return 'Complete delivery address is required';
      if (!form.city.trim()) return 'Nearby location / area is required';
    }
    return '';
  }

  async function handleContinue() {
    const message = validate();
    if (message) {
      setError(message);
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onContinue?.({
        orderType,
        name: form.name.trim(),
        phone: form.phone.trim(),
        customerId: form.customerId,
        delivery: {
          line1: form.line1.trim(),
          city: form.city.trim(),
        },
        saveDeliveryAddress: orderType === 'DELIVERY' ? form.saveAddress : false,
      });
    } catch (err) {
      setError(err?.message || 'Unable to continue');
      setBusy(false);
      return;
    }
    setBusy(false);
  }

  const title =
    step === 'type'
      ? 'Select order type'
      : orderType === 'DINE_IN'
        ? 'Dine-In details'
        : orderType === 'TAKEAWAY'
          ? 'Takeaway details'
          : 'Delivery details';

  return (
    <Modal open={open} title={title} onClose={() => !busy && onClose?.()} wide={step === 'type'}>
      {step === 'type' && (
        <div className="space-y-4">
          <p className="text-sm text-[var(--color-ink-muted)]">
            Choose how this order will be fulfilled.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            {ORDER_TYPES.map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => selectType(t.value)}
                  className="rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-panel)] p-4 text-left transition hover:border-[var(--color-brand)] hover:bg-[var(--color-panel-hover)]"
                >
                  <Icon size={22} strokeWidth={1.75} className="text-[var(--color-brand)]" />
                  <p className="mt-3 text-sm font-semibold text-[#f5f5f5]">{t.label}</p>
                  <p className="mt-1 text-xs text-[var(--color-ink-muted)]">{t.description}</p>
                </button>
              );
            })}
          </div>
          <div className="flex justify-end">
            <Button variant="secondary" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {step === 'details' && (
        <div className="space-y-4" ref={suggestRef}>
          <div className="relative space-y-3">
            <Field label="Customer name" required>
              <div className="relative">
                <UserRound
                  size={16}
                  strokeWidth={1.75}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-ink-muted)]"
                />
                <TextInput
                  className="pl-9"
                  value={form.name}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      name: e.target.value,
                      customerId: null,
                    }))
                  }
                  onFocus={() => orderType === 'DELIVERY' && setShowSuggestions(true)}
                  placeholder="Guest name"
                  autoComplete="off"
                  autoFocus
                />
              </div>
            </Field>

            {(orderType === 'DINE_IN' || orderType === 'TAKEAWAY') && (
              <Field label="Phone number" hint="Optional">
                <TextInput
                  value={form.phone}
                  onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
                  placeholder="e.g. 03001234567"
                  inputMode="tel"
                  autoComplete="off"
                />
              </Field>
            )}

            {orderType === 'DELIVERY' && (
              <>
                <Field label="Phone number" required>
                  <TextInput
                    value={form.phone}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        phone: e.target.value,
                        customerId: null,
                        line1: '',
                        city: '',
                        saveAddress: false,
                      }))
                    }
                    onFocus={() => setShowSuggestions(true)}
                    placeholder="e.g. 03001234567"
                    inputMode="tel"
                    autoComplete="off"
                  />
                </Field>

                {showSuggestions && (suggestions.length > 0 || searchLoading) && (
                  <div className="absolute left-0 right-0 top-[7.5rem] z-30 max-h-48 overflow-y-auto rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-panel)]">
                    {searchLoading && !suggestions.length ? (
                      <p className="px-3 py-2 text-xs text-[var(--color-ink-muted)]">Searching…</p>
                    ) : (
                      suggestions.map((row) => (
                        <button
                          key={row.id}
                          type="button"
                          className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm hover:bg-[var(--color-panel-hover)]"
                          onClick={() => pickSuggestion(row)}
                        >
                          <span className="font-medium text-[#f5f5f5]">{row.name}</span>
                          <span className="text-xs text-[var(--color-ink-muted)]">
                            {row.phone || '—'}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                )}

                <Field label="Complete delivery address" required>
                  <TextInput
                    value={form.line1}
                    onChange={(e) => setForm((prev) => ({ ...prev, line1: e.target.value }))}
                    placeholder="e.g. House 24, Street 5, Block B"
                  />
                </Field>
                <Field label="Nearby location / area" required>
                  <TextInput
                    value={form.city}
                    onChange={(e) => setForm((prev) => ({ ...prev, city: e.target.value }))}
                    placeholder="e.g. Gulshan-e-Iqbal, DHA Phase 5"
                  />
                </Field>
                <label className="flex cursor-pointer items-start gap-2 text-sm text-[var(--color-ink-muted)]">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={form.saveAddress}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, saveAddress: e.target.checked }))
                    }
                  />
                  <span>Save this address for future orders</span>
                </label>
              </>
            )}

            {orderType === 'DINE_IN' && (
              <p className="text-sm text-[var(--color-ink-muted)]">
                Next you’ll choose an available table for this guest.
              </p>
            )}
          </div>

          {error && (
            <p className="rounded-[var(--radius-control)] border border-[color-mix(in_srgb,var(--color-danger)_35%,transparent)] bg-[color-mix(in_srgb,var(--color-danger)_12%,transparent)] px-3 py-2 text-sm text-[var(--color-danger)]">
              {error}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setStep('type');
                setError('');
              }}
            >
              <ArrowLeft size={16} strokeWidth={1.75} />
              Back
            </Button>
            <div className="flex gap-2">
              <Button variant="secondary" disabled={busy} onClick={onClose}>
                Cancel
              </Button>
              <Button disabled={busy} onClick={handleContinue}>
                {busy
                  ? 'Please wait…'
                  : orderType === 'DINE_IN'
                    ? 'Continue to tables'
                    : 'Continue'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

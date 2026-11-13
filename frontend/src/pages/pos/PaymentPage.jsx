import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { billingApi } from '../../services/billingService';
import { ordersApi } from '../../services/posService';
import { money } from '../../utils/formatMoney';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/ui/Toast';
import { useSocket } from '../../hooks/useSocket';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import { Field, TextInput, Select, TextArea } from '../../components/ui/Input';

function emptyPortion(methodId, amount = '') {
  return {
    methodId: methodId || '',
    preTaxAmount: amount,
    amountTendered: '',
    reference: '',
  };
}

function errMessage(err, fallback) {
  const msg = err?.response?.data?.message;
  if (typeof msg === 'string' && msg.trim()) return msg;
  if (Array.isArray(err?.response?.data?.errors) && err.response.data.errors[0]?.message) {
    return err.response.data.errors[0].message;
  }
  if (typeof err?.message === 'string' && err.message.trim()) return err.message;
  return fallback;
}

export default function PaymentPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const toast = useToast();

  const [order, setOrder] = useState(null);
  const [quote, setQuote] = useState(null);
  const [mixed, setMixed] = useState(false);
  const [portions, setPortions] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [quoting, setQuoting] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [discountType, setDiscountType] = useState('FIXED');
  const [discountValue, setDiscountValue] = useState('');
  const [settleStatus, setSettleStatus] = useState('COMPLIMENTARY');
  const [settleReason, setSettleReason] = useState('');
  const [allowNegativeStock, setAllowNegativeStock] = useState(false);
  const [stockError, setStockError] = useState('');
  const [loadError, setLoadError] = useState('');
  const portionsRef = useRef(portions);
  portionsRef.current = portions;

  const buildActivePortions = useCallback((list) => {
    return (list || [])
      .filter((p) => p.methodId && Number(p.preTaxAmount) > 0)
      .map((p) => ({
        methodId: p.methodId,
        preTaxAmount: Number(p.preTaxAmount),
        // Omit null tender/reference so Zod coerce doesn't turn null → 0 unnecessarily
        ...(p.amountTendered !== '' && p.amountTendered != null
          ? { amountTendered: Number(p.amountTendered) }
          : {}),
        ...(p.reference ? { reference: p.reference } : {}),
      }));
  }, []);

  const loadOrder = useCallback(async ({ resetForm = true } = {}) => {
    try {
      setLoadError('');
      const active = resetForm ? [] : buildActivePortions(portionsRef.current);
      const [o, q] = await Promise.all([
        ordersApi.get(id),
        billingApi.quote(id, active.length ? active : undefined),
      ]);
      setOrder(o);
      setQuote(q);
      if (resetForm) {
        setPortions([]);
        setMixed(false);
      }
    } catch (err) {
      const message = errMessage(err, 'Failed to load payment data');
      setLoadError(message);
      toast.error(message);
    }
  }, [id, toast, buildActivePortions]);

  useEffect(() => {
    loadOrder({ resetForm: true });
  }, [loadOrder]);

  useSocket(
    'pos',
    ['order.status.updated', 'order.ready', 'order.updated', 'payment.created', '__connected'],
    (event, payload) => {
      if (event === '__connected') {
        loadOrder({ resetForm: false });
        return;
      }
      const orderId = payload?.id || payload?.orderId;
      if (!orderId || orderId === id) {
        // Keep in-progress tender entry; only refresh order/quote snapshot.
        loadOrder({ resetForm: event === 'payment.created' });
      }
    },
    true
  );

  const outstanding = Number(quote?.outstandingPreTax || 0);
  const methods = Array.isArray(quote?.paymentMethods) ? quote.paymentMethods : [];

  const activePortions = useMemo(
    () => buildActivePortions(portions),
    [portions, buildActivePortions]
  );
  const activePortionsKey = useMemo(
    () => JSON.stringify(activePortions),
    [activePortions]
  );

  // Always refresh tax/total from backend quote — never compute tax in JS for display.
  useEffect(() => {
    if (!id || !quote) return undefined;
    if (!activePortions.length) {
      setQuote((prev) =>
        prev?.portionPreview ? { ...prev, portionPreview: null } : prev
      );
      return undefined;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setQuoting(true);
      try {
        const q = await billingApi.quote(id, activePortions);
        if (!cancelled) setQuote(q);
      } catch (err) {
        if (!cancelled) {
          toast.error(errMessage(err, 'Could not refresh tax quote'));
        }
      } finally {
        if (!cancelled) setQuoting(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // activePortionsKey keeps the effect stable across referential churn
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, activePortionsKey, toast]);

  // Guard: never call .reduce on a non-array (would white-screen React).
  const preview = Array.isArray(quote?.portionPreview) ? quote.portionPreview : null;
  const previewTax = preview
    ? preview.reduce((sum, p) => sum + Number(p.taxAmount || 0), 0)
    : null;
  const previewGross = preview
    ? preview.reduce((sum, p) => sum + Number(p.grossAmount || 0), 0)
    : null;
  const paidGross = (order?.payments || [])
    .filter((p) => ['COMPLETED', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(p.status))
    .reduce((sum, p) => sum + Number(p.amount || 0) - Number(p.refundedAmount || 0), 0);
  const methodSelected = portions.some((p) => p.methodId);

  function selectSingleMethod(methodId) {
    setMixed(false);
    setPortions([
      emptyPortion(methodId, String(outstanding || '')),
    ]);
    // Drop stale preview immediately so cash/non-cash UI cannot mix across methods
    // while the debounced tax quote is in flight.
    setQuote((prev) => (prev ? { ...prev, portionPreview: null } : prev));
  }

  function enableMixed() {
    const first = methods[0]?.id || '';
    const second = methods.find((m) => m.id !== first)?.id || first;
    const half = outstanding > 0 ? Math.floor(outstanding / 2) : 0;
    const rest = Math.max(0, outstanding - half);
    setMixed(true);
    setPortions([emptyPortion(first, String(half)), emptyPortion(second, String(rest))]);
  }

  function updatePortion(index, patch) {
    setPortions((prev) => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  }

  async function handlePay() {
    if (submitting) return;
    if (!activePortions.length) {
      toast.error('Select a payment method and amount');
      return;
    }
    setSubmitting(true);
    try {
      setStockError('');
      const payload = activePortions.map((p) => {
        const method = methods.find((m) => m.id === p.methodId);
        return {
          methodId: p.methodId,
          preTaxAmount: p.preTaxAmount,
          amountTendered:
            method?.isCash && p.amountTendered != null ? p.amountTendered : undefined,
          reference: p.reference || undefined,
        };
      });
      const result = await billingApi.pay(id, payload, undefined, {
        allowNegativeStock,
      });
      toast.success(result.replayed ? 'Payment already recorded' : 'Payment recorded');
      if (result.initiatePrint) {
        navigate(`/pos/orders/${id}/print?auto=1`);
      } else {
        navigate(`/pos/orders/${id}/receipt`);
      }
    } catch (err) {
      const message = errMessage(err, 'Payment failed');
      const isStock = /not enough stock/i.test(message);
      setStockError(isStock ? message : '');
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  if (!order || !quote) {
    return (
      <div className="space-y-3 p-4 text-[var(--color-ink-muted)]">
        <p>{loadError ? 'Could not load checkout.' : 'Loading checkout…'}</p>
        {loadError ? (
          <>
            <p className="text-sm text-[var(--color-danger)]">{loadError}</p>
            <Button variant="secondary" onClick={() => loadOrder({ resetForm: true })}>
              Retry
            </Button>
          </>
        ) : null}
      </div>
    );
  }

  const selectedSingle =
    !mixed && portions[0]?.methodId
      ? methods.find((m) => m.id === portions[0].methodId) || null
      : null;
  const cashLine = preview?.find((p) => {
    const m = methods.find((x) => x.id === p.methodId);
    return m?.isCash;
  });
  const cashPortion = portions.find((p) => methods.find((m) => m.id === p.methodId)?.isCash);
  // Important: `cashPortion?.amountTendered !== ''` is TRUE when cashPortion is
  // undefined (undefined !== ''), which crashed when switching Cash → Card while
  // the previous cash quote preview was still on screen.
  const changeDue =
    cashLine && cashPortion && cashPortion.amountTendered !== ''
      ? Math.max(
          0,
          Number(cashPortion.amountTendered) - Number(cashLine.grossAmount || 0)
        )
      : null;

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 text-[var(--color-ink)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight">
            Checkout · {order.orderNumber}
          </h1>
          <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
            {String(order.type || '').replaceAll('_', ' ') || 'Order'}
            {' · '}
            <Badge tone="warning">{String(order.paymentStatus || '').replaceAll('_', ' ')}</Badge>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to={`/pos/orders/${id}`}>
            <Button variant="secondary">Order details</Button>
          </Link>
          <Link to="/pos">
            <Button variant="secondary">New order</Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
        <section className="space-y-4 rounded-xl border border-[var(--color-line)] bg-[var(--color-section)] p-5 text-[var(--color-ink)]">
          <h2 className="app-section-title">Order summary</h2>
          <dl className="space-y-2 text-sm">
            {(order.customerName || order.customerPhone) && (
              <>
                <div className="flex justify-between gap-3">
                  <dt className="text-[var(--color-ink-muted)]">Customer</dt>
                  <dd className="font-medium">{order.customerName || '—'}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-[var(--color-ink-muted)]">Phone</dt>
                  <dd className="font-medium">{order.customerPhone || '—'}</dd>
                </div>
              </>
            )}
            <div className="flex justify-between gap-3">
              <dt className="text-[var(--color-ink-muted)]">Order type</dt>
              <dd className="font-medium">{String(order.type || '').replaceAll('_', ' ')}</dd>
            </div>
            {order.type === 'DELIVERY' && order.deliveryAddressSnapshot && (
              <>
                <div className="flex justify-between gap-3 border-t border-[var(--color-line)] pt-2">
                  <dt className="text-[var(--color-ink-muted)]">Delivery address</dt>
                  <dd className="max-w-[60%] text-right font-medium">
                    {order.deliveryAddressSnapshot.line1 || '—'}
                  </dd>
                </div>
                {order.deliveryAddressSnapshot.city ? (
                  <div className="flex justify-between gap-3">
                    <dt className="text-[var(--color-ink-muted)]">Nearby / area</dt>
                    <dd className="max-w-[60%] text-right font-medium">
                      {order.deliveryAddressSnapshot.city}
                    </dd>
                  </div>
                ) : null}
              </>
            )}
            {(order.items || []).slice(0, 8).map((item) => (
              <div key={item.id} className="flex justify-between gap-3 border-t border-[var(--color-line)] pt-2">
                <dt className="text-[var(--color-ink-muted)]">
                  {Number(item.quantity)} × {item.nameSnapshot}
                  {item.variantNameSnapshot ? ` (${item.variantNameSnapshot})` : ''}
                </dt>
                <dd className="font-medium">{money(item.lineTotal)}</dd>
              </div>
            ))}
            <div className="flex justify-between gap-3 border-t border-[var(--color-line)] pt-2">
              <dt className="text-[var(--color-ink-muted)]">Subtotal</dt>
              <dd className="font-medium">{money(quote.subtotal)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-[var(--color-ink-muted)]">Discount</dt>
              <dd className="font-medium">{money(quote.discount)}</dd>
            </div>
            {Number(quote.serviceCharge) > 0 && (
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--color-ink-muted)]">Service charge</dt>
                <dd className="font-medium">{money(quote.serviceCharge)}</dd>
              </div>
            )}
            {Number(quote.deliveryFee) > 0 && (
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--color-ink-muted)]">Delivery fee</dt>
                <dd className="font-medium">{money(quote.deliveryFee)}</dd>
              </div>
            )}
            <div className="flex justify-between gap-3 border-t border-[var(--color-line)] pt-2">
              <dt className="text-[var(--color-ink-muted)]">
                {preview && selectedSingle
                  ? `Tax (${selectedSingle.name} ${Number(selectedSingle.taxRate)}%)`
                  : preview
                    ? 'Tax (mixed)'
                    : 'Tax'}
                {quoting ? ' …' : ''}
              </dt>
              <dd className="font-medium">
                {previewTax == null ? '—' : money(previewTax)}
              </dd>
            </div>
            <div className="flex justify-between gap-3 text-lg font-bold">
              <dt>Total due now</dt>
              <dd className="text-[var(--color-brand)]">
                {previewGross == null ? '—' : money(previewGross)}
              </dd>
            </div>
            <div className="flex justify-between gap-3 text-sm">
              <dt className="text-[var(--color-ink-muted)]">Already paid</dt>
              <dd>{money(paidGross)}</dd>
            </div>
            <div className="flex justify-between gap-3 text-sm">
              <dt className="text-[var(--color-ink-muted)]">Remaining (pre-tax)</dt>
              <dd className="font-semibold">{money(outstanding)}</dd>
            </div>
          </dl>

          {!methodSelected && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Select a payment method to calculate the final tax and total.
            </p>
          )}

          {preview && preview.length > 1 && (
            <div className="space-y-2 rounded-lg bg-[var(--color-surface)] p-3 text-sm">
              <p className="font-semibold">Payment breakdown</p>
              {preview.map((p) => (
                <div key={`${p.methodId}-${p.preTaxAmount}`} className="flex justify-between gap-2">
                  <span>
                    {p.methodName} ({Number(p.taxRate)}%)
                  </span>
                  <span>
                    {money(p.preTaxAmount)} + tax {money(p.taxAmount)} = {money(p.grossAmount)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {Boolean(selectedSingle?.isCash) && previewGross != null && (
            <div className="space-y-2 rounded-lg border border-[var(--color-line)] p-3">
              <Field label="Amount received">
                <TextInput
                  type="number"
                  min="0"
                  step="0.01"
                  value={portions[0]?.amountTendered || ''}
                  onChange={(e) => updatePortion(0, { amountTendered: e.target.value })}
                  placeholder={String(previewGross)}
                />
              </Field>
              <div className="flex justify-between text-sm">
                <span className="text-[var(--color-ink-muted)]">Change to return</span>
                <span className="font-semibold">
                  {changeDue == null ? '—' : money(changeDue)}
                </span>
              </div>
            </div>
          )}
        </section>

        <section className="space-y-4 rounded-xl border border-[var(--color-line)] bg-[var(--color-section)] p-5 text-[var(--color-ink)]">
          <div className="flex items-center justify-between gap-2">
            <h2 className="app-section-title">Payment method</h2>
            {outstanding > 0 && (
              <button
                type="button"
                className="text-sm font-medium text-[var(--color-brand)] hover:underline"
                onClick={() => {
                  if (mixed) {
                    setMixed(false);
                    setPortions([]);
                  } else {
                    enableMixed();
                  }
                }}
              >
                {mixed ? 'Single method' : 'Split / mixed payment'}
              </button>
            )}
          </div>

          {!mixed && (
            <div className="grid gap-2 sm:grid-cols-2">
              {methods.map((m) => {
                const active = portions[0]?.methodId === m.id;
                const isCash = Boolean(m.isCash);
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => selectSingleMethod(m.id)}
                    className={`rounded-xl border-2 px-3 py-3 text-left transition ${
                      active
                        ? 'border-[var(--color-brand)] bg-[var(--color-brand-soft)]'
                        : 'border-[var(--color-line)] hover:border-[var(--color-brand)]/50'
                    }`}
                  >
                    <p className="font-semibold">{m.name}</p>
                    <p className="text-xs text-[var(--color-ink-muted)]">
                      Tax {Number(m.taxRate) || 0}%
                      {isCash ? ' · Cash' : ''}
                    </p>
                  </button>
                );
              })}
              {!methods.length && (
                <p className="col-span-full text-sm text-[var(--color-danger)]">
                  No active payment methods. Add them under Settings.
                </p>
              )}
            </div>
          )}

          {mixed && (
            <div className="space-y-3">
              {portions.map((p, index) => {
                const method = methods.find((m) => m.id === p.methodId);
                return (
                  <div
                    key={index}
                    className="space-y-2 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] p-3"
                  >
                    <Field label={`Method ${index + 1}`}>
                      <Select
                        value={p.methodId}
                        onChange={(e) => updatePortion(index, { methodId: e.target.value })}
                      >
                        {methods.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name} ({Number(m.taxRate)}%)
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Amount (pre-tax)">
                      <TextInput
                        type="number"
                        min="0"
                        step="0.01"
                        value={p.preTaxAmount}
                        onChange={(e) => updatePortion(index, { preTaxAmount: e.target.value })}
                      />
                    </Field>
                    {method?.isCash && (
                      <Field label="Cash received">
                        <TextInput
                          type="number"
                          min="0"
                          step="0.01"
                          value={p.amountTendered}
                          onChange={(e) => updatePortion(index, { amountTendered: e.target.value })}
                        />
                      </Field>
                    )}
                    {!method?.isCash && (
                      <Field label="Reference (optional)">
                        <TextInput
                          value={p.reference}
                          onChange={(e) => updatePortion(index, { reference: e.target.value })}
                        />
                      </Field>
                    )}
                    {portions.length > 2 && (
                      <Button
                        variant="ghost"
                        onClick={() => setPortions(portions.filter((_, i) => i !== index))}
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                );
              })}
              <Button
                variant="secondary"
                onClick={() =>
                  setPortions([...portions, emptyPortion(methods[0]?.id, '0')])
                }
              >
                Add method
              </Button>
            </div>
          )}

          {!mixed && methodSelected && (
            <Field
              label="Amount paying now (pre-tax)"
              hint="Lower this for a partial payment. Leave as full remaining to settle the bill."
            >
              <TextInput
                type="number"
                min="0"
                step="0.01"
                value={portions[0]?.preTaxAmount || ''}
                onChange={(e) => updatePortion(0, { preTaxAmount: e.target.value })}
              />
            </Field>
          )}

          {!mixed && selectedSingle && !Boolean(selectedSingle.isCash) && (
            <Field label="Reference (optional)">
              <TextInput
                value={portions[0]?.reference || ''}
                onChange={(e) => updatePortion(0, { reference: e.target.value })}
                placeholder="Txn ID / last 4 digits"
                autoComplete="off"
              />
            </Field>
          )}

          {stockError && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <p>{stockError}</p>
              {hasPermission('inventory.allow_negative') && (
                <label className="mt-2 flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={allowNegativeStock}
                    onChange={(e) => setAllowNegativeStock(e.target.checked)}
                  />
                  Manager override: allow sale even if stock goes negative
                </label>
              )}
            </div>
          )}

          {hasPermission('payments.create') && outstanding > 0 && (
            <Button
              className="w-full text-base"
              disabled={submitting || !activePortions.length || quoting}
              onClick={handlePay}
            >
              {submitting
                ? 'Processing…'
                : previewGross != null
                  ? `Confirm payment · ${money(previewGross)}`
                  : 'Confirm payment'}
            </Button>
          )}

          {outstanding <= 0 && (
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              This order is fully settled.
            </p>
          )}

          <button
            type="button"
            className="text-sm text-[var(--color-ink-muted)] hover:underline"
            onClick={() => setShowAdvanced((v) => !v)}
          >
            {showAdvanced ? 'Hide' : 'Show'} discounts & write-off
          </button>

          {showAdvanced && (
            <div className="space-y-4 border-t border-[var(--color-line)] pt-4">
              {hasPermission('billing.discount') && !order.discountLocked && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold">Discount</h3>
                  <div className="flex flex-wrap gap-2">
                    <Select value={discountType} onChange={(e) => setDiscountType(e.target.value)}>
                      <option value="FIXED">Fixed</option>
                      <option value="PERCENT">Percent</option>
                    </Select>
                    <TextInput
                      type="number"
                      min="0"
                      value={discountValue}
                      onChange={(e) => setDiscountValue(e.target.value)}
                      placeholder="Value"
                      className="max-w-[140px]"
                    />
                    <Button
                      variant="secondary"
                      onClick={async () => {
                        try {
                          await billingApi.applyDiscount(id, {
                            type: discountType,
                            value: Number(discountValue),
                          });
                          toast.success('Discount applied');
                          loadOrder({ resetForm: false });
                        } catch (err) {
                          toast.error(errMessage(err, 'Discount failed'));
                        }
                      }}
                    >
                      Apply
                    </Button>
                  </div>
                </div>
              )}

              {(hasPermission('billing.complimentary') || hasPermission('billing.write_off')) &&
                outstanding > 0 &&
                !(order.payments || []).length && (
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold">Complimentary / write-off</h3>
                    <Select value={settleStatus} onChange={(e) => setSettleStatus(e.target.value)}>
                      {hasPermission('billing.complimentary') && (
                        <option value="COMPLIMENTARY">Complimentary</option>
                      )}
                      {hasPermission('billing.write_off') && (
                        <option value="WRITTEN_OFF">Written off</option>
                      )}
                    </Select>
                    <TextArea
                      rows={2}
                      placeholder="Reason (required)"
                      value={settleReason}
                      onChange={(e) => setSettleReason(e.target.value)}
                    />
                    <Button
                      variant="danger"
                      onClick={async () => {
                        try {
                          await billingApi.settle(id, {
                            status: settleStatus,
                            reason: settleReason,
                          });
                          toast.success(`Marked ${settleStatus}`);
                          navigate(`/pos/orders/${id}`);
                        } catch (err) {
                          toast.error(errMessage(err, 'Settlement failed'));
                        }
                      }}
                    >
                      Confirm
                    </Button>
                  </div>
                )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

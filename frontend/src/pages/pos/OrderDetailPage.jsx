import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ordersApi } from '../../services/posService';
import { money } from '../../utils/formatMoney';
import { billingApi } from '../../services/billingService';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/ui/Toast';
import { useSocket } from '../../hooks/useSocket';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Modal from '../../components/ui/Modal';
import { Field, TextInput, Select, TextArea } from '../../components/ui/Input';

export default function OrderDetailPage() {
  const { id } = useParams();
  const { hasPermission } = useAuth();
  const toast = useToast();
  const [order, setOrder] = useState(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [splitOpen, setSplitOpen] = useState(false);
  const [splitQty, setSplitQty] = useState({});
  const [refundOpen, setRefundOpen] = useState(false);
  const [refundPayment, setRefundPayment] = useState(null);
  const [refundAmount, setRefundAmount] = useState('');
  const [refundType, setRefundType] = useState('PAYMENT_CORRECTION');
  const [refundReason, setRefundReason] = useState('');
  const [refunding, setRefunding] = useState(false);
  const readyToastFor = useRef(null);

  const load = useCallback(async () => {
    try {
      const data = await ordersApi.get(id);
      setOrder(data);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load order');
    }
  }, [id, toast]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    readyToastFor.current = null;
  }, [id]);

  useSocket(
    'pos',
    ['order.status.updated', 'order.ready', 'order.updated', 'payment.created', '__connected'],
    (event, payload) => {
      if (event === '__connected') {
        load();
        return;
      }
      const orderId = payload?.id || payload?.orderId;
      if (orderId && orderId !== id) return;

      if (event === 'order.ready' && orderId === id && readyToastFor.current !== id) {
        readyToastFor.current = id;
        toast.success(payload?.message || 'Order is ready');
      }
      load();
    },
    true
  );

  if (!order) return <p className="p-4 text-[var(--color-ink-muted)]">Loading order…</p>;

  return (
    <div className="space-y-4 p-4 text-[var(--color-ink)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight">
            {order.orderNumber}
          </h1>
          <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
            {order.type.replaceAll('_', ' ')}
            {order.diningTable?.number ? ` · Table ${order.diningTable.number}` : ''}
            {' · '}
            <Badge tone={order.status === 'READY' ? 'success' : 'brand'}>{order.status}</Badge>
            {' · '}
            <Badge tone="warning">{String(order.paymentStatus || '').replaceAll('_', ' ')}</Badge>
          </p>
          {order.estimatedReadyAt && order.status === 'PREPARING' && (
            <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
              ETA {new Date(order.estimatedReadyAt).toLocaleTimeString()}
            </p>
          )}
          {(order.customerName || order.customerPhone) && (
            <p className="mt-1 text-sm text-[var(--color-ink)]">
              {order.customerName || 'Customer'}
              {order.customerPhone ? ` · ${order.customerPhone}` : ''}
            </p>
          )}
          {order.type === 'DELIVERY' && order.deliveryAddressSnapshot && (
            <div className="mt-2 rounded-lg border border-[var(--color-line)] bg-[var(--color-panel)] px-3 py-2 text-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
                Delivery address
              </p>
              <p className="mt-1 text-[var(--color-ink)]">
                {order.deliveryAddressSnapshot.line1 || '—'}
              </p>
              {order.deliveryAddressSnapshot.city ? (
                <p className="text-[var(--color-ink-muted)]">
                  Near: {order.deliveryAddressSnapshot.city}
                </p>
              ) : null}
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {hasPermission('payments.create') &&
            !['PAID', 'COMPLIMENTARY', 'WRITTEN_OFF', 'REFUNDED'].includes(order.paymentStatus) && (
              <Link to={`/pos/orders/${order.id}/pay`}>
                <Button>Checkout / Pay</Button>
              </Link>
            )}
          <Link to={`/pos/orders/${order.id}/print`}>
            <Button variant="secondary">Print slips</Button>
          </Link>
          <Link to={`/pos/orders/${order.id}/receipt`}>
            <Button variant="secondary">Payment receipt</Button>
          </Link>
          <Link to="/pos">
            <Button variant="secondary">New order</Button>
          </Link>
          {hasPermission('orders.split') &&
            !['COMPLETED', 'CANCELLED'].includes(order.status) && (
            <Button variant="secondary" onClick={() => setSplitOpen(true)}>
              Split items
            </Button>
          )}
          {hasPermission('orders.update') && order.status === 'PREPARING' && (
            <Button
              variant="secondary"
              onClick={async () => {
                try {
                  await ordersApi.transition(order.id, 'READY');
                  toast.success('Marked ready');
                  load();
                } catch (err) {
                  toast.error(err.response?.data?.message || 'Failed');
                }
              }}
            >
              Mark ready
            </Button>
          )}
          {hasPermission('orders.update') && order.status === 'READY' && order.type === 'DINE_IN' && (
            <Button
              variant="secondary"
              onClick={async () => {
                try {
                  await ordersApi.transition(order.id, 'SERVED');
                  toast.success('Marked served');
                  load();
                } catch (err) {
                  toast.error(err.response?.data?.message || 'Failed');
                }
              }}
            >
              Mark served
            </Button>
          )}
          {hasPermission('orders.update') &&
            ['READY', 'SERVED', 'DELIVERED'].includes(order.status) &&
            ['PAID', 'COMPLIMENTARY', 'WRITTEN_OFF'].includes(order.paymentStatus) && (
              <Button
                variant="secondary"
                onClick={async () => {
                  try {
                    await ordersApi.transition(order.id, 'COMPLETED');
                    toast.success('Order completed');
                    load();
                  } catch (err) {
                    toast.error(err.response?.data?.message || 'Failed');
                  }
                }}
              >
                Complete
              </Button>
            )}
          {hasPermission('orders.cancel') &&
            ['DRAFT', 'PLACED', 'CONFIRMED', 'PREPARING'].includes(order.status) && (
              <Button variant="danger" onClick={() => setCancelOpen(true)}>
                Cancel
              </Button>
            )}
        </div>
      </div>

      <section className="rounded-xl border border-[var(--color-line)] bg-[var(--color-panel)] p-4">
        <h2 className="mb-3 font-semibold">Items</h2>
        <div className="space-y-2">
          {order.items.map((item) => (
            <div key={item.id} className="flex justify-between rounded-lg bg-[var(--color-section)] px-3 py-2 text-sm">
              <div>
                <p className="font-medium">
                  {item.quantity} × {item.nameSnapshot}
                  {item.variantNameSnapshot ? ` (${item.variantNameSnapshot})` : ''}
                </p>
                {(item.modifiers || []).map((m) => (
                  <p key={m.id} className="text-xs text-[var(--color-ink-muted)]">
                    + {m.nameSnapshot}
                  </p>
                ))}
                {item.specialInstructions && (
                  <p className="text-xs text-[var(--color-warning)]">Note: {item.specialInstructions}</p>
                )}
              </div>
              <p>{money(item.lineTotal)}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 space-y-1 border-t border-[var(--color-line)] pt-3 text-sm">
          <div className="flex justify-between"><span>Subtotal</span><span>{money(order.subtotal)}</span></div>
          <div className="flex justify-between"><span>Discount</span><span>{money(order.discountTotal)}</span></div>
          <div className="flex justify-between"><span>Tax</span><span>{money(order.taxTotal)}</span></div>
          <div className="flex justify-between font-semibold">
            <span>Grand total</span>
            <span>{money(order.grandTotal)}</span>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-[var(--color-line)] bg-[var(--color-panel)] p-4">
        <h2 className="mb-3 font-semibold">Payments</h2>
        {(order.payments || []).length === 0 ? (
          <p className="text-sm text-[var(--color-ink-muted)]">No payments yet.</p>
        ) : (
          <div className="space-y-3">
            {order.payments.map((p) => (
              <div key={p.id} className="rounded-lg bg-[var(--color-section)] px-3 py-2 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">
                      {p.method?.name || 'Payment'} · {money(p.amount)}
                    </p>
                    <p className="text-xs text-[var(--color-ink-muted)]">
                      Pre-tax {money(p.preTaxAmount)} · Tax {Number(p.taxRateSnapshot)}% ={' '}
                      {money(p.taxAmount)}
                      {p.reference ? ` · Ref ${p.reference}` : ''}
                      {Number(p.changeReturned) > 0 ? ` · Change ${money(p.changeReturned)}` : ''}
                    </p>
                  </div>
                  {hasPermission('payments.refund') &&
                    ['COMPLETED', 'PARTIALLY_REFUNDED'].includes(p.status) && (
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setRefundPayment(p);
                          setRefundAmount(String(p.amount));
                          setRefundType('PAYMENT_CORRECTION');
                          setRefundReason('');
                          setRefundOpen(true);
                        }}
                      >
                        Refund
                      </Button>
                    )}
                </div>
                {(p.refunds || []).map((r) => (
                  <p key={r.id} className="mt-1 text-xs text-[var(--color-warning)]">
                    Refund {r.type}: {money(r.amount)} — {r.reason}
                  </p>
                ))}
              </div>
            ))}
          </div>
        )}
      </section>

      <Modal open={cancelOpen} title="Cancel order" onClose={() => setCancelOpen(false)}>
        <div className="space-y-4 text-[var(--color-ink)]">
          <Field label="Reason">
            <TextInput value={reason} onChange={(e) => setReason(e.target.value)} required />
          </Field>
          <Button
            variant="danger"
            onClick={async () => {
              try {
                await ordersApi.cancel(order.id, reason);
                toast.success('Order cancelled');
                setCancelOpen(false);
                load();
              } catch (err) {
                toast.error(err.response?.data?.message || 'Cancel failed');
              }
            }}
          >
            Confirm cancel
          </Button>
        </div>
      </Modal>

      <Modal
        open={refundOpen}
        title="Refund payment"
        onClose={() => {
          setRefundOpen(false);
          setRefundPayment(null);
        }}
      >
        <div className="space-y-4 text-[var(--color-ink)]">
          <p className="text-sm">
            Original: {money(refundPayment?.amount)} ({refundPayment?.method?.name})
          </p>
          <Field label="Amount">
            <TextInput
              type="number"
              min="0"
              step="0.01"
              value={refundAmount}
              onChange={(e) => setRefundAmount(e.target.value)}
            />
          </Field>
          <Field label="Type">
            <Select value={refundType} onChange={(e) => setRefundType(e.target.value)}>
              <option value="PAYMENT_CORRECTION">Payment correction</option>
              <option value="SALES_RETURN">Sales return</option>
              <option value="VOID_AFTER_PAYMENT">Void after payment</option>
            </Select>
          </Field>
          <Field label="Reason">
            <TextArea rows={3} value={refundReason} onChange={(e) => setRefundReason(e.target.value)} />
          </Field>
          <Button
            variant="danger"
            disabled={refunding}
            onClick={async () => {
              if (refunding) return;
              setRefunding(true);
              try {
                await billingApi.refund(refundPayment.id, {
                  amount: Number(refundAmount),
                  type: refundType,
                  reason: refundReason,
                });
                toast.success('Refund recorded');
                setRefundOpen(false);
                load();
              } catch (err) {
                toast.error(err.response?.data?.message || 'Refund failed');
              } finally {
                setRefunding(false);
              }
            }}
          >
            {refunding ? 'Processing…' : 'Confirm refund'}
          </Button>
        </div>
      </Modal>

      <Modal open={splitOpen} title="Split items into new bill" onClose={() => setSplitOpen(false)} wide>
        <div className="space-y-3 text-[var(--color-ink)]">
          {order.items.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-3 text-sm">
              <span>
                {item.nameSnapshot} (qty {item.quantity})
              </span>
              <TextInput
                type="number"
                min="0"
                max={Number(item.quantity)}
                step="1"
                className="w-24"
                value={splitQty[item.id] || ''}
                onChange={(e) => setSplitQty({ ...splitQty, [item.id]: e.target.value })}
              />
            </div>
          ))}
          <Button
            onClick={async () => {
              const items = Object.entries(splitQty)
                .filter(([, q]) => Number(q) > 0)
                .map(([orderItemId, quantity]) => ({
                  orderItemId,
                  quantity: Number(quantity),
                }));
              if (!items.length) {
                toast.error('Select quantities to split');
                return;
              }
              try {
                const result = await ordersApi.split(order.id, items);
                toast.success(`Created ${result.splitOrder.orderNumber}`);
                setSplitOpen(false);
                load();
              } catch (err) {
                toast.error(err.response?.data?.message || 'Split failed');
              }
            }}
          >
            Split selected
          </Button>
        </div>
      </Modal>
    </div>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ordersApi } from '../../services/posService';
import { money } from '../../utils/formatMoney';
import { billingApi } from '../../services/billingService';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/ui/Toast';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Modal from '../../components/ui/Modal';
import { Field, TextInput, Select, TextArea } from '../../components/ui/Input';

const nextActions = {
  DINE_IN: {
    PLACED: 'CONFIRMED',
    CONFIRMED: 'PREPARING',
    PREPARING: 'READY',
    READY: 'SERVED',
    SERVED: 'COMPLETED',
  },
  TAKEAWAY: {
    PLACED: 'CONFIRMED',
    CONFIRMED: 'PREPARING',
    PREPARING: 'READY',
    READY: 'COMPLETED',
  },
  DELIVERY: {
    PLACED: 'CONFIRMED',
    CONFIRMED: 'PREPARING',
    PREPARING: 'READY',
    READY: 'OUT_FOR_DELIVERY',
    OUT_FOR_DELIVERY: 'DELIVERED',
    DELIVERED: 'COMPLETED',
  },
};

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

  if (!order) return <p className="p-4 text-white/70">Loading order…</p>;

  const next = nextActions[order.type]?.[order.status];

  return (
    <div className="space-y-4 p-4 text-white">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight">
            {order.orderNumber}
          </h1>
          <p className="mt-1 text-sm text-white/60">
            {order.type.replaceAll('_', ' ')} · <Badge tone="brand">{order.status}</Badge>
            {' · '}
            <Badge tone="warning">{String(order.paymentStatus || '').replaceAll('_', ' ')}</Badge>
            {order.diningTable ? ` · Table ${order.diningTable.number}` : ''}
          </p>
          {(order.customerName || order.customerPhone) && (
            <p className="mt-1 text-sm text-white/80">
              {order.customerName || 'Customer'}
              {order.customerPhone ? ` · ${order.customerPhone}` : ''}
            </p>
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
          {next && hasPermission('orders.update') && (
            <Button
              onClick={async () => {
                try {
                  await ordersApi.transition(order.id, next);
                  toast.success(`Moved to ${next}`);
                  load();
                } catch (err) {
                  toast.error(err.response?.data?.message || 'Transition failed');
                }
              }}
            >
              Mark {next}
            </Button>
          )}
          {hasPermission('orders.split') && order.tableSessionId && (
            <Button variant="secondary" onClick={() => setSplitOpen(true)}>
              Split items
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

      <section className="rounded-xl bg-white/5 p-4">
        <h2 className="mb-3 font-semibold">Items</h2>
        <div className="space-y-2">
          {order.items.map((item) => (
            <div key={item.id} className="flex justify-between rounded-lg bg-white/10 px-3 py-2 text-sm">
              <div>
                <p className="font-medium">
                  {item.quantity} × {item.nameSnapshot}
                  {item.variantNameSnapshot ? ` (${item.variantNameSnapshot})` : ''}
                </p>
                {(item.modifiers || []).map((m) => (
                  <p key={m.id} className="text-xs text-white/60">
                    + {m.nameSnapshot}
                  </p>
                ))}
                {item.specialInstructions && (
                  <p className="text-xs text-amber-200">Note: {item.specialInstructions}</p>
                )}
              </div>
              <p>{money(item.lineTotal)}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 space-y-1 border-t border-white/10 pt-3 text-sm">
          <div className="flex justify-between"><span>Subtotal</span><span>{money(order.subtotal)}</span></div>
          <div className="flex justify-between"><span>Discount</span><span>{money(order.discountTotal)}</span></div>
          <div className="flex justify-between"><span>Tax</span><span>{money(order.taxTotal)}</span></div>
          <div className="flex justify-between font-semibold">
            <span>Grand total</span>
            <span>{money(order.grandTotal)}</span>
          </div>
        </div>
      </section>

      <section className="rounded-xl bg-white/5 p-4">
        <h2 className="mb-3 font-semibold">Payments</h2>
        {(order.payments || []).length === 0 ? (
          <p className="text-sm text-white/60">No payments yet.</p>
        ) : (
          <div className="space-y-3">
            {order.payments.map((p) => (
              <div key={p.id} className="rounded-lg bg-white/10 px-3 py-2 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">
                      {p.method?.name || 'Payment'} · {money(p.amount)}
                    </p>
                    <p className="text-xs text-white/60">
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
                  <p key={r.id} className="mt-1 text-xs text-amber-200">
                    Refund {r.type}: {money(r.amount)} — {r.reason}
                  </p>
                ))}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-xl bg-white/5 p-4">
        <h2 className="mb-3 font-semibold">Status history</h2>
        <div className="space-y-2 text-sm">
          {(order.statusHistory || []).map((h) => (
            <div key={h.id} className="flex justify-between text-white/70">
              <span>
                {h.fromStatus || '—'} → {h.toStatus}
                {h.reason ? ` (${h.reason})` : ''}
              </span>
              <span>{new Date(h.createdAt).toLocaleString()}</span>
            </div>
          ))}
        </div>
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

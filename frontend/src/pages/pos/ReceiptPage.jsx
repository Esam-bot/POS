import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { billingApi } from '../../services/billingService';
import { money } from '../../utils/formatMoney';
import { useToast } from '../../components/ui/Toast';
import Button from '../../components/ui/Button';

export default function ReceiptPage() {
  const { id } = useParams();
  const toast = useToast();
  const [receipt, setReceipt] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await billingApi.createReceipt(id);
        setReceipt(data);
      } catch (err) {
        toast.error(err.response?.data?.message || 'Failed to load receipt');
      }
    })();
  }, [id, toast]);

  if (!receipt) {
    return <p className="p-4 text-[var(--color-ink-muted)]">Preparing receipt…</p>;
  }

  const snap = receipt.snapshot || {};
  const restaurant = snap.restaurant || {};
  const order = snap.order || {};
  const bill = snap.bill || {};
  const items = snap.items || [];
  const payments = snap.payments || [];
  const refunds = snap.refunds || [];

  return (
    <div className="p-4 text-[var(--color-ink)]">
      <div className="mb-4 flex gap-2 print:hidden">
        <Link to={`/pos/orders/${id}`}>
          <Button variant="secondary">Back</Button>
        </Link>
        <Button onClick={() => window.print()}>Print</Button>
      </div>

      <article className="receipt mx-auto rounded-xl bg-[var(--color-section)] p-5 text-[var(--color-ink)] shadow-lg print:rounded-none print:shadow-none">
        <header className="border-b border-dashed border-black/30 pb-3 text-center">
          <h1 className="text-lg font-bold">{restaurant.name || 'Restaurant'}</h1>
          {restaurant.address && <p className="text-xs">{restaurant.address}</p>}
          {restaurant.phone && <p className="text-xs">{restaurant.phone}</p>}
          <p className="mt-2 text-sm font-semibold">Receipt {receipt.receiptNumber}</p>
          <p className="text-xs">
            {order.orderNumber} · {order.type}
          </p>
          <p className="text-xs">
            {order.createdAt ? new Date(order.createdAt).toLocaleString() : ''}
          </p>
          {order.customerName && (
            <p className="mt-1 text-xs font-semibold">Customer: {order.customerName}</p>
          )}
          {order.customerPhone && <p className="text-xs">Phone: {order.customerPhone}</p>}
          {order.type === 'DELIVERY' && order.deliveryAddressSnapshot && (
            <>
              <p className="mt-1 text-xs">
                Address: {order.deliveryAddressSnapshot.line1 || '—'}
              </p>
              {order.deliveryAddressSnapshot.city ? (
                <p className="text-xs">Area: {order.deliveryAddressSnapshot.city}</p>
              ) : null}
            </>
          )}
        </header>

        <section className="space-y-1 border-b border-dashed border-black/30 py-3 text-xs">
          {items.map((item) => (
            <div key={item.id}>
              <div className="flex justify-between gap-2">
                <span>
                  {item.quantity} × {item.nameSnapshot}
                  {item.variantNameSnapshot ? ` (${item.variantNameSnapshot})` : ''}
                </span>
                <span>{money(item.lineTotal)}</span>
              </div>
              {(item.modifiers || []).map((m) => (
                <p key={m.id} className="pl-3 text-[10px] text-black/60">
                  + {m.nameSnapshot} {Number(m.priceDelta) ? money(m.priceDelta) : ''}
                </p>
              ))}
            </div>
          ))}
        </section>

        <section className="space-y-1 border-b border-dashed border-black/30 py-3 text-xs">
          <div className="flex justify-between"><span>Subtotal</span><span>{money(bill.subtotal)}</span></div>
          <div className="flex justify-between"><span>Discount</span><span>{money(bill.discount)}</span></div>
          {Number(bill.serviceCharge) > 0 && (
            <div className="flex justify-between"><span>Service charge</span><span>{money(bill.serviceCharge)}</span></div>
          )}
          {Number(bill.deliveryFee) > 0 && (
            <div className="flex justify-between"><span>Delivery fee</span><span>{money(bill.deliveryFee)}</span></div>
          )}
          <div className="flex justify-between"><span>Pre-tax total</span><span>{money(bill.preTaxTotal)}</span></div>
        </section>

        <section className="space-y-2 border-b border-dashed border-black/30 py-3 text-xs">
          <p className="font-semibold">Payments</p>
          {payments.map((p) => (
            <div key={p.id} className="rounded bg-black/5 p-2">
              <div className="flex justify-between font-medium">
                <span>{p.method?.name || 'Payment'}</span>
                <span>{money(p.amount)}</span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span>Pre-tax {money(p.preTaxAmount)}</span>
                <span>Tax {Number(p.taxRateSnapshot)}% = {money(p.taxAmount)}</span>
              </div>
              {Number(p.changeReturned) > 0 && (
                <p className="text-[10px]">Change returned: {money(p.changeReturned)}</p>
              )}
              {p.reference && <p className="text-[10px]">Ref: {p.reference}</p>}
            </div>
          ))}
          <div className="flex justify-between font-semibold">
            <span>Outstanding (pre-tax)</span>
            <span>{money(snap.outstandingPreTax)}</span>
          </div>
        </section>

        {refunds.length > 0 && (
          <section className="space-y-1 border-b border-dashed border-black/30 py-3 text-xs">
            <p className="font-semibold">Refunds</p>
            {refunds.map((r) => (
              <div key={r.id} className="flex justify-between">
                <span>
                  {r.type} · {r.reason}
                </span>
                <span>{money(r.amount)}</span>
              </div>
            ))}
          </section>
        )}

        <footer className="py-3 text-center text-[10px]">
          {order.cashier ? <p>Cashier: {order.cashier}</p> : null}
          <p>{restaurant.footer || 'Thank you'}</p>
        </footer>
      </article>

      <style>{`
        .receipt {
          width: 80mm;
          max-width: 100%;
          padding: 12px;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        }
        @media print {
          body * { visibility: hidden; }
          .receipt, .receipt * { visibility: visible; }
          .receipt {
            position: absolute;
            left: 0;
            top: 0;
            width: 80mm;
            box-shadow: none;
          }
        }
      `}</style>
    </div>
  );
}

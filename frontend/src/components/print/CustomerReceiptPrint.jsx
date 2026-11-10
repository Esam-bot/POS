import { money } from '../../utils/formatMoney';

export default function CustomerReceiptPrint({ snapshot, isReprint = false }) {
  if (!snapshot) return null;
  const restaurant = snapshot.restaurant || {};
  const order = snapshot.order || {};
  const bill = snapshot.bill || {};
  const items = snapshot.items || [];

  return (
    <article className="thermal-slip mx-auto bg-white text-black">
      {isReprint && (
        <p className="mb-2 text-center text-xs font-bold tracking-widest">*** REPRINT ***</p>
      )}
      <header className="border-b border-dashed border-black pb-2 text-center">
        <h1 className="text-base font-bold uppercase">{restaurant.name || 'Restaurant'}</h1>
        {restaurant.address && <p className="text-[11px] leading-snug">{restaurant.address}</p>}
        {restaurant.phone && <p className="text-[11px]">{restaurant.phone}</p>}
        <p className="mt-2 text-sm font-semibold">ORDER {order.orderNumber}</p>
        <p className="text-[11px]">
          {order.typeLabel || order.type}
          {order.table ? ` · Table ${order.table}` : ''}
        </p>
        <p className="text-[11px]">
          {order.placedAt ? new Date(order.placedAt).toLocaleString() : ''}
        </p>
        <p className="mt-1 text-[11px] font-semibold">
          Customer: {order.customerName || '—'}
        </p>
        {order.customerPhone ? (
          <p className="text-[11px]">Phone: {order.customerPhone}</p>
        ) : null}
        {order.cashier && <p className="text-[11px]">Cashier: {order.cashier}</p>}
      </header>

      <section className="border-b border-dashed border-black py-2 text-[12px]">
        {items.map((item) => (
          <div key={item.id} className="mb-1.5">
            <div className="flex justify-between gap-2 font-semibold">
              <span>
                {Number(item.quantity)} × {item.name}
                {item.variantName ? ` (${item.variantName})` : ''}
              </span>
              <span>{money(item.lineTotal)}</span>
            </div>
            {(item.modifiers || []).map((m, idx) => (
              <p key={`${item.id}-m-${idx}`} className="pl-3 text-[11px]">
                + {m.name}
                {Number(m.priceDelta) ? ` ${money(m.priceDelta)}` : ''}
              </p>
            ))}
            {item.specialInstructions && (
              <p className="pl-3 text-[11px] italic">Note: {item.specialInstructions}</p>
            )}
          </div>
        ))}
      </section>

      <section className="space-y-0.5 border-b border-dashed border-black py-2 text-[12px]">
        <div className="flex justify-between">
          <span>Subtotal</span>
          <span>{money(bill.subtotal)}</span>
        </div>
        {Number(bill.discount) > 0 && (
          <div className="flex justify-between">
            <span>Discount</span>
            <span>-{money(bill.discount)}</span>
          </div>
        )}
        {Number(bill.serviceCharge) > 0 && (
          <div className="flex justify-between">
            <span>Service charge</span>
            <span>{money(bill.serviceCharge)}</span>
          </div>
        )}
        {Number(bill.deliveryFee) > 0 && (
          <div className="flex justify-between">
            <span>Delivery fee</span>
            <span>{money(bill.deliveryFee)}</span>
          </div>
        )}
        {Number(bill.taxTotal) > 0 && (
          <div className="flex justify-between">
            <span>Tax</span>
            <span>{money(bill.taxTotal)}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span>Total</span>
          <span>{money(bill.grandTotal || bill.preTaxTotal)}</span>
        </div>
        {Number(bill.amountPaidGross) > 0 && (
          <div className="flex justify-between">
            <span>Paid</span>
            <span>{money(bill.amountPaidGross)}</span>
          </div>
        )}
        {Number(bill.remainingPreTax) > 0 && (
          <div className="flex justify-between font-semibold">
            <span>Remaining (pre-tax)</span>
            <span>{money(bill.remainingPreTax)}</span>
          </div>
        )}
      </section>

      {(snapshot.payments || []).length > 0 && (
        <section className="space-y-0.5 border-b border-dashed border-black py-2 text-[11px]">
          <p className="font-semibold">Payments</p>
          {snapshot.payments.map((p, idx) => (
            <div key={idx} className="flex justify-between gap-2">
              <span>{p.methodName}</span>
              <span>{money(p.amount)}</span>
            </div>
          ))}
        </section>
      )}

      <section className="py-2 text-center text-[12px]">
        <p className="font-bold tracking-wide">{String(order.paymentStatus || 'UNPAID')}</p>
        {snapshot.paymentNote && (
          <p className="mt-1 text-[11px] leading-snug">{snapshot.paymentNote}</p>
        )}
        {restaurant.footer && <p className="mt-2 text-[11px]">{restaurant.footer}</p>}
        <p className="mt-2 text-[10px]">Customer receipt</p>
      </section>
    </article>
  );
}

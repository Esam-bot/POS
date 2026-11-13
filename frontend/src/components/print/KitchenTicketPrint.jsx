import { formatOrderNumber } from '../../utils/orderNumber';

export default function KitchenTicketPrint({ snapshot, isReprint = false }) {
  if (!snapshot) return null;
  const order = snapshot.order || {};
  const items = snapshot.items || [];

  return (
    <article className="thermal-slip kitchen-ticket mx-auto bg-white text-black">
      {isReprint && (
        <p className="mb-2 text-center text-sm font-black tracking-widest">*** REPRINT ***</p>
      )}
      <header className="border-b-2 border-black pb-3 text-center">
        <p className="text-xs font-semibold tracking-wide">KITCHEN ORDER</p>
        <h1 className="mt-1 text-2xl font-black tracking-tight">
          ORDER {formatOrderNumber(order.orderNumber)}
        </h1>
        <p className="mt-2 text-base font-bold">{order.typeLabel || 'ORDER'}</p>
        {order.type === 'DELIVERY' ? (
          <p className="mt-1 text-sm font-black uppercase tracking-wide">*** DELIVERY ***</p>
        ) : null}
        <p className="mt-1 text-sm font-bold uppercase">
          Guest: {order.customerName || '—'}
        </p>
        {order.type === 'DELIVERY' && order.customerPhone ? (
          <p className="text-xs font-semibold">Phone: {order.customerPhone}</p>
        ) : null}
        <p className="mt-1 text-sm font-semibold">
          {order.placedAt
            ? new Date(order.placedAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })
            : ''}
        </p>
        <p className="text-xs">
          {order.placedAt ? new Date(order.placedAt).toLocaleDateString() : ''}
        </p>
      </header>

      <section className="border-b-2 border-black py-3">
        {items.map((item, idx) => (
          <div key={`${item.name}-${idx}`} className="mb-3">
            <p className="text-lg font-black uppercase leading-tight">
              {Number(item.quantity)} × {item.name}
            </p>
            {item.variantName && (
              <p className="text-sm font-bold uppercase">Size: {item.variantName}</p>
            )}
            {(item.modifiers || []).map((m, mIdx) => (
              <p key={`${idx}-m-${mIdx}`} className="pl-2 text-sm font-semibold">
                + {m.name}
                {m.quantity > 1 ? ` ×${m.quantity}` : ''}
              </p>
            ))}
            {item.specialInstructions && (
              <p className="mt-0.5 pl-2 text-sm font-bold uppercase">
                !! {item.specialInstructions}
              </p>
            )}
            {item.stationName && (
              <p className="mt-0.5 text-xs font-medium uppercase tracking-wide text-black/70">
                Station: {item.stationName}
              </p>
            )}
          </div>
        ))}
      </section>

      {order.notes && (
        <p className="border-b border-dashed border-black py-2 text-sm font-bold">
          ORDER NOTE: {order.notes}
        </p>
      )}

      <footer className="pt-3 text-center">
        <p className="text-base font-black tracking-widest">PREPARE ORDER</p>
      </footer>
    </article>
  );
}

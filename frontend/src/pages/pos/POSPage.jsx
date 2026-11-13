import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Search,
  Minus,
  Plus,
  Trash2,
  Pencil,
  UtensilsCrossed,
  Clock3,
  X,
  LayoutGrid,
  ShoppingBag,
  Truck,
  Package,
  Table2,
  UserRound,
  PlusCircle,
  ShoppingCart,
} from 'lucide-react';
import { menuApi, imageSrc } from '../../services/menuService';
import { ordersApi } from '../../services/posService';
import { money } from '../../utils/formatMoney';
import { useToast } from '../../components/ui/Toast';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import { Field, TextInput, TextArea, Select } from '../../components/ui/Input';
import CreateOrderWizard from './CreateOrderWizard';
import { clearPendingGuest, getPendingGuest, setPendingGuest } from '../../utils/posGuest';

function linePreview(item) {
  const base = Number(item.unitPrice || 0);
  const mods = (item.modifiers || []).reduce(
    (sum, m) => sum + Number(m.priceDelta || 0) * (m.quantity || 1),
    0
  );
  return (base + mods) * Number(item.quantity || 1);
}

function priceLabel(delta) {
  const n = Number(delta || 0);
  if (n === 0) return 'Free';
  return `+ ${money(n)}`;
}

function countSelectedInGroup(group, selectedMods) {
  return (group.modifiers || []).filter((m) => selectedMods[m.id]).length;
}

const ORDER_TYPE_LABEL = {
  DINE_IN: 'Dine-In',
  TAKEAWAY: 'Takeaway',
  DELIVERY: 'Delivery',
};

function ProductImage({ src, alt }) {
  const [failed, setFailed] = useState(!src);
  if (failed || !src) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[var(--color-section)] text-[var(--color-ink-muted)]">
        <UtensilsCrossed size={28} strokeWidth={1.5} />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      className="h-full w-full object-cover transition duration-200 group-hover:scale-[1.03]"
      onError={() => setFailed(true)}
    />
  );
}

export default function POSPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get('sessionId') || '';
  const tableId = searchParams.get('tableId') || '';
  const guestNameParam = searchParams.get('guestName') || '';
  const dineInSession = Boolean(sessionId);

  const pending = getPendingGuest();
  const initialName =
    guestNameParam || pending?.name || (dineInSession ? 'Table Guest' : '');

  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);
  const [categoryId, setCategoryId] = useState('');
  const [search, setSearch] = useState('');
  const [orderType, setOrderType] = useState(
    dineInSession ? 'DINE_IN' : pending?.orderType || ''
  );
  const [notes, setNotes] = useState('');
  const [cart, setCart] = useState([]);
  const [customizeItem, setCustomizeItem] = useState(null);
  const [editingKey, setEditingKey] = useState(null);
  const [variantId, setVariantId] = useState('');
  const [selectedMods, setSelectedMods] = useState({});
  const [itemNotes, setItemNotes] = useState('');
  const [guest, setGuest] = useState({
    name: initialName,
    phone: pending?.phone || '',
  });
  const [delivery, setDelivery] = useState({
    line1: pending?.delivery?.line1 || '',
    city: pending?.delivery?.city || '',
  });
  const [saveDeliveryAddress, setSaveDeliveryAddress] = useState(
    Boolean(pending?.saveDeliveryAddress)
  );
  const [selectedCustomerId, setSelectedCustomerId] = useState(
    pending?.customerId || null
  );
  const [submitting, setSubmitting] = useState(false);
  const [detailCache, setDetailCache] = useState({});
  const [wizardOpen, setWizardOpen] = useState(false);
  const [orderStarted, setOrderStarted] = useState(
    Boolean(dineInSession || pending?.orderType === 'TAKEAWAY' || pending?.orderType === 'DELIVERY')
  );

  const isOrdering =
    dineInSession ||
    (orderStarted && (orderType === 'TAKEAWAY' || orderType === 'DELIVERY'));

  useEffect(() => {
    if (dineInSession) {
      setOrderType('DINE_IN');
      setOrderStarted(true);
      if (guestNameParam) {
        const pendingNow = getPendingGuest() || {};
        setGuest((prev) => ({
          ...prev,
          name: guestNameParam,
          phone: prev.phone || pendingNow.phone || '',
        }));
        setPendingGuest({
          ...pendingNow,
          name: guestNameParam,
          phone: pendingNow.phone || '',
          orderType: 'DINE_IN',
        });
      }
    }
  }, [dineInSession, guestNameParam]);

  const loadMenu = useCallback(async () => {
    if (!isOrdering) return;
    try {
      const [cats, menuItems, allPosItems] = await Promise.all([
        menuApi.listCategories({ isActive: true, limit: 100 }),
        menuApi.listItems({
          forPos: true,
          categoryId: categoryId || undefined,
          search: search || undefined,
          limit: 100,
        }),
        menuApi.listItems({ forPos: true, limit: 100 }),
      ]);
      const categoryIdsWithProducts = new Set(
        (allPosItems.items || [])
          .map((i) => i.categoryId || i.category?.id)
          .filter(Boolean)
      );
      setCategories(
        (cats.items || []).filter(
          (c) => categoryIdsWithProducts.has(c.id) && !/\d{10,}/.test(c.name)
        )
      );
      setItems(menuItems.items);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load menu');
    }
  }, [categoryId, search, toast, isOrdering]);

  useEffect(() => {
    loadMenu();
  }, [loadMenu]);

  function handleWizardContinue(payload) {
    if (payload.orderType === 'DINE_IN') {
      setPendingGuest({
        name: payload.name,
        phone: payload.phone || '',
        orderType: 'DINE_IN',
      });
      setWizardOpen(false);
      navigate(`/pos/tables?guestName=${encodeURIComponent(payload.name)}`);
      return;
    }

    setGuest({ name: payload.name, phone: payload.phone || '' });
    setOrderType(payload.orderType);
    setSelectedCustomerId(payload.customerId || null);
    setDelivery(payload.delivery || { line1: '', city: '' });
    setSaveDeliveryAddress(Boolean(payload.saveDeliveryAddress));
    setPendingGuest({
      name: payload.name,
      phone: payload.phone || '',
      customerId: payload.customerId || null,
      orderType: payload.orderType,
      delivery: payload.delivery,
      saveDeliveryAddress: Boolean(payload.saveDeliveryAddress),
    });
    setOrderStarted(true);
    setWizardOpen(false);
  }

  function resetToIdle() {
    setOrderStarted(false);
    setOrderType('');
    setGuest({ name: '', phone: '' });
    setDelivery({ line1: '', city: '' });
    setSaveDeliveryAddress(false);
    setSelectedCustomerId(null);
    setCart([]);
    setNotes('');
    clearPendingGuest();
  }

  const subtotalPreview = useMemo(
    () => cart.reduce((sum, line) => sum + linePreview(line), 0),
    [cart]
  );

  const liveUnitPrice = useMemo(() => {
    if (!customizeItem) return 0;
    const variant = (customizeItem.variants || []).find((v) => v.id === variantId);
    const base = variant ? Number(variant.price) : Number(customizeItem.basePrice);
    let extras = 0;
    for (const group of customizeItem.modifierGroups || []) {
      for (const mod of group.modifiers || []) {
        if (selectedMods[mod.id]) extras += Number(mod.priceDelta || 0);
      }
    }
    return base + extras;
  }, [customizeItem, variantId, selectedMods]);

  async function openCustomize(item, existingLine = null) {
    try {
      let detail = detailCache[item.id || item.menuItemId];
      const itemId = item.id || item.menuItemId;
      if (!detail) {
        detail = await menuApi.getItem(itemId);
        setDetailCache((prev) => ({ ...prev, [itemId]: detail }));
      }
      setCustomizeItem(detail);
      if (existingLine) {
        setEditingKey(existingLine.key);
        setVariantId(existingLine.variantId || detail.variants?.[0]?.id || '');
        const mods = {};
        for (const m of existingLine.modifiers || []) {
          mods[m.modifierId] = true;
        }
        setSelectedMods(mods);
        setItemNotes(existingLine.specialInstructions || '');
      } else {
        setEditingKey(null);
        setVariantId(detail.variants?.[0]?.id || '');
        setSelectedMods({});
        setItemNotes('');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load product');
    }
  }

  function toggleMod(modId, group) {
    setSelectedMods((prev) => {
      const next = { ...prev };
      if (group.selectionType === 'SINGLE') {
        for (const m of group.modifiers || []) {
          delete next[m.id];
        }
        next[modId] = true;
      } else if (next[modId]) {
        delete next[modId];
      } else {
        const selectedCount = countSelectedInGroup(group, next);
        if (group.maxSelect && selectedCount >= Number(group.maxSelect)) {
          toast.error(`Choose up to ${group.maxSelect} options in ${group.name}`);
          return prev;
        }
        next[modId] = true;
      }
      return next;
    });
  }

  function validateCustomizations() {
    if (!customizeItem) return false;
    for (const group of customizeItem.modifierGroups || []) {
      const count = countSelectedInGroup(group, selectedMods);
      const min = Number(group.minSelect || 0);
      const required = group.isRequired || min > 0;
      if (required && count < Math.max(min, group.isRequired ? 1 : 0)) {
        toast.error(`Please choose options for “${group.name}”`);
        return false;
      }
      if (group.maxSelect && count > Number(group.maxSelect)) {
        toast.error(`Too many options selected in “${group.name}”`);
        return false;
      }
    }
    return true;
  }

  function addConfiguredToCart() {
    if (!customizeItem) return;
    if (!validateCustomizations()) return;

    const variant = (customizeItem.variants || []).find((v) => v.id === variantId);
    const unitPrice = variant ? Number(variant.price) : Number(customizeItem.basePrice);
    const modifiers = [];
    for (const group of customizeItem.modifierGroups || []) {
      for (const mod of group.modifiers || []) {
        if (selectedMods[mod.id]) {
          modifiers.push({
            modifierId: mod.id,
            name: mod.name,
            priceDelta: Number(mod.priceDelta),
            quantity: 1,
          });
        }
      }
    }

    const line = {
      key: editingKey || `${customizeItem.id}-${variantId}-${Date.now()}`,
      menuItemId: customizeItem.id,
      name: customizeItem.name,
      imageUrl: customizeItem.imageUrl,
      variantId: variantId || null,
      variantName: variant?.name || null,
      unitPrice,
      quantity: editingKey
        ? cart.find((c) => c.key === editingKey)?.quantity || 1
        : 1,
      modifiers,
      specialInstructions: itemNotes || null,
    };

    setCart((prev) => {
      if (editingKey) {
        return prev.map((c) => (c.key === editingKey ? line : c));
      }
      return [...prev, line];
    });
    setCustomizeItem(null);
    setEditingKey(null);
  }

  function updateQty(key, delta) {
    setCart((prev) =>
      prev
        .map((line) =>
          line.key === key ? { ...line, quantity: Math.max(0, line.quantity + delta) } : line
        )
        .filter((line) => line.quantity > 0)
    );
  }

  async function checkout() {
    if (!cart.length) {
      toast.error('Cart is empty');
      return;
    }
    if (!orderType) {
      toast.error('Select an order type first');
      return;
    }
    if (!guest.name.trim()) {
      toast.error('Customer name is required');
      return;
    }
    if (orderType === 'DELIVERY') {
      if (!guest.phone.trim() || guest.phone.trim().length < 7) {
        toast.error('Phone number is required');
        return;
      }
      if (!/^[0-9+\-\s()]+$/.test(guest.phone.trim())) {
        toast.error('Enter a valid phone number');
        return;
      }
      if (!delivery.line1.trim()) {
        toast.error('Complete delivery address is required');
        return;
      }
      if (!delivery.city.trim()) {
        toast.error('Nearby location / area is required');
        return;
      }
    }
    if (
      (orderType === 'TAKEAWAY' || orderType === 'DINE_IN') &&
      guest.phone.trim() &&
      (guest.phone.trim().length < 7 || !/^[0-9+\-\s()]+$/.test(guest.phone.trim()))
    ) {
      toast.error('Enter a valid phone number');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        type: orderType,
        customerId: selectedCustomerId || undefined,
        customerName: guest.name.trim(),
        customerPhone: guest.phone.trim() || null,
        notes: notes || null,
        tableSessionId: dineInSession ? sessionId : undefined,
        diningTableId: dineInSession && tableId ? tableId : undefined,
        deliveryFee: orderType === 'DELIVERY' ? undefined : 0,
        saveDeliveryAddress: orderType === 'DELIVERY' ? saveDeliveryAddress : false,
        deliveryAddressSnapshot:
          orderType === 'DELIVERY'
            ? {
                name: guest.name.trim(),
                phone: guest.phone.trim(),
                line1: delivery.line1.trim(),
                city: delivery.city.trim(),
              }
            : null,
        items: cart.map((line) => ({
          menuItemId: line.menuItemId,
          variantId: line.variantId,
          quantity: line.quantity,
          specialInstructions: line.specialInstructions,
          modifiers: line.modifiers.map((m) => ({
            modifierId: m.modifierId,
            quantity: m.quantity || 1,
          })),
        })),
      };

      const created = await ordersApi.create(payload);
      const submitted = await ordersApi.submit(created.id);
      toast.success(`Order ${submitted.orderNumber} — preparing`);
      setCart([]);
      setNotes('');
      if (!dineInSession) {
        resetToIdle();
      } else {
        clearPendingGuest();
      }
      navigate(`/pos/orders/${submitted.id}`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to place order');
    } finally {
      setSubmitting(false);
    }
  }

  const orderTypeLabel = ORDER_TYPE_LABEL[orderType] || orderType;

  if (!isOrdering) {
    return (
      <div className="flex h-[calc(100vh-3.5rem)] flex-col items-center justify-center p-6">
        <div className="flex max-w-md flex-col items-center text-center">
          <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-[var(--color-line)] bg-[var(--color-section)] text-[var(--color-brand)]">
            <ShoppingCart size={28} strokeWidth={1.75} />
          </div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold text-[#f5f5f5]">
            Ready to take an order?
          </h1>
          <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
            Start a new order to begin adding items.
          </p>
          <Button className="mt-6" onClick={() => setWizardOpen(true)}>
            <Plus size={16} strokeWidth={1.75} />
            Create New Order
          </Button>
        </div>
        <CreateOrderWizard
          open={wizardOpen}
          onClose={() => setWizardOpen(false)}
          onContinue={handleWizardContinue}
        />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col gap-3 p-3">
      <section className="flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-section)] px-4 py-3">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
            {orderType === 'DINE_IN' ? (
              <Table2 size={14} strokeWidth={1.75} />
            ) : orderType === 'DELIVERY' ? (
              <Truck size={14} strokeWidth={1.75} />
            ) : (
              <Package size={14} strokeWidth={1.75} />
            )}
            {orderTypeLabel}
          </p>
          <p className="mt-1 truncate text-sm font-semibold text-[#f5f5f5]">
            <UserRound size={14} className="mr-1 inline" strokeWidth={1.75} />
            {guest.name || 'Guest'}
            {guest.phone ? ` · ${guest.phone}` : ''}
          </p>
          {orderType === 'DELIVERY' && (delivery.line1 || delivery.city) ? (
            <p className="mt-0.5 truncate text-xs text-[var(--color-ink-muted)]">
              {[delivery.line1, delivery.city].filter(Boolean).join(' · ')}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {dineInSession ? (
            <Link to={`/pos/sessions/${sessionId}`}>
              <Button variant="secondary">Back to session</Button>
            </Link>
          ) : (
            <Button variant="secondary" onClick={resetToIdle}>
              Cancel order
            </Button>
          )}
        </div>
      </section>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[200px_minmax(0,1fr)_360px]">
          <aside className="overflow-y-auto rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-section)] p-3">
            <h2 className="mb-3 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
              <LayoutGrid size={14} strokeWidth={1.75} />
              Categories
            </h2>
            <button
              type="button"
              onClick={() => setCategoryId('')}
              className={`mb-1 flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm transition ${
                !categoryId
                  ? 'bg-[var(--color-brand-soft)] text-[var(--color-brand)] shadow-[inset_3px_0_0_0_var(--color-brand)]'
                  : 'text-[var(--color-ink-muted)] hover:bg-[var(--color-panel)] hover:text-[#f5f5f5]'
              }`}
            >
              All
            </button>
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategoryId(c.id)}
                className={`mb-1 flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm transition ${
                  categoryId === c.id
                    ? 'bg-[var(--color-brand-soft)] text-[var(--color-brand)] shadow-[inset_3px_0_0_0_var(--color-brand)]'
                    : 'text-[var(--color-ink-muted)] hover:bg-[var(--color-panel)] hover:text-[#f5f5f5]'
                }`}
              >
                {c.name}
              </button>
            ))}
          </aside>

          <section className="flex min-h-0 flex-col rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-section)] p-3">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
                Products
              </p>
              <p className="text-xs text-[var(--color-ink-muted)]">{items.length} items</p>
            </div>
            <div className="relative mb-3">
              <Search
                size={16}
                strokeWidth={1.75}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-ink-muted)]"
              />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search products…"
                className="w-full rounded-[var(--radius-control)] border border-[var(--color-line)] bg-[var(--color-panel)] py-2.5 pl-9 pr-10 text-sm text-[#f5f5f5] placeholder:text-[#7a828c] outline-none focus:border-[var(--color-brand)] focus:ring-2 focus:ring-[var(--color-brand)]/25"
              />
              {search ? (
                <button
                  type="button"
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-[var(--color-ink-muted)] hover:bg-[var(--color-panel-hover)] hover:text-[#f5f5f5]"
                  onClick={() => setSearch('')}
                >
                  <X size={14} strokeWidth={1.75} />
                </button>
              ) : null}
            </div>
            <div className="grid min-h-0 flex-1 auto-rows-max grid-cols-2 gap-3 overflow-y-auto md:grid-cols-3 xl:grid-cols-4">
              {items.map((item) => {
                const available = item.isAvailable !== false;
                const prep = item.prepTimeMinutes;
                return (
                  <div
                    key={item.id}
                    className="group flex h-full flex-col rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-panel)] p-3 transition hover:border-[var(--color-brand)]/50 hover:bg-[var(--color-panel-hover)]"
                  >
                    <button
                      type="button"
                      disabled={!available}
                      onClick={() => openCustomize(item)}
                      className="flex min-h-0 flex-1 flex-col text-left disabled:cursor-not-allowed disabled:opacity-55"
                    >
                      <div className="mb-2 aspect-[4/3] overflow-hidden rounded-lg border border-[var(--color-line)]">
                        <ProductImage src={imageSrc(item.imageUrl)} alt={item.name} />
                      </div>
                      <p className="line-clamp-2 min-h-[2.5rem] text-sm font-semibold leading-snug text-[#f5f5f5]">
                        {item.name}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                        <span
                          className={`rounded-md border px-1.5 py-0.5 font-medium ${
                            available
                              ? 'border-[color-mix(in_srgb,var(--color-brand)_35%,transparent)] bg-[var(--color-brand-soft)] text-[var(--color-brand)]'
                              : 'border-[var(--color-line)] text-[var(--color-ink-muted)]'
                          }`}
                        >
                          {available ? 'Available' : 'Unavailable'}
                        </span>
                        {prep != null && Number(prep) > 0 ? (
                          <span className="inline-flex items-center gap-1 text-[var(--color-ink-muted)]">
                            <Clock3 size={12} strokeWidth={1.75} />
                            {Number(prep)} min
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-auto pt-2 text-sm font-semibold text-[var(--color-brand)]">
                        {money(item.basePrice)}
                      </p>
                    </button>
                    <Button
                      className="mt-3 w-full"
                      disabled={!available}
                      onClick={() => openCustomize(item)}
                    >
                      <PlusCircle size={16} strokeWidth={1.75} />
                      Add
                    </Button>
                  </div>
                );
              })}
              {!items.length && (
                <p className="col-span-full p-6 text-sm text-[var(--color-ink-muted)]">
                  No available products.
                </p>
              )}
            </div>
          </section>

          <aside className="flex min-h-0 flex-col rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-section)] p-4">
            <div className="mb-3 flex items-start justify-between gap-2 border-b border-[var(--color-line)] pb-3">
              <div>
                <h2 className="inline-flex items-center gap-2 text-sm font-semibold text-[#f5f5f5]">
                  <ShoppingBag size={16} strokeWidth={1.75} />
                  Cart
                </h2>
                <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
                  {[guest.name.trim(), guest.phone.trim()].filter(Boolean).join(' · ') || 'Guest'}
                </p>
                <p className="text-xs text-[var(--color-ink-muted)]">{orderTypeLabel}</p>
              </div>
              <span className="rounded-md border border-[var(--color-line)] bg-[var(--color-panel)] px-2 py-0.5 text-xs text-[var(--color-ink-muted)]">
                {cart.reduce((n, l) => n + Number(l.quantity || 0), 0)} items
              </span>
            </div>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
              {cart.map((line) => (
                <div
                  key={line.key}
                  className="rounded-lg border border-[var(--color-line)] bg-[var(--color-panel)] p-3 text-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-[#f5f5f5]">{line.name}</p>
                      {line.variantName && (
                        <p className="text-xs text-[var(--color-ink-muted)]">{line.variantName}</p>
                      )}
                      {line.modifiers.map((m) => (
                        <p key={m.modifierId} className="text-xs text-[var(--color-ink-muted)]">
                          · {m.name}
                          {Number(m.priceDelta) > 0 ? ` (${priceLabel(m.priceDelta)})` : ''}
                        </p>
                      ))}
                      <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
                        {money(
                          line.unitPrice +
                            line.modifiers.reduce((s, m) => s + Number(m.priceDelta || 0), 0)
                        )}{' '}
                        each
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        title="Edit customizations"
                        className="rounded-md p-1 text-[var(--color-ink-muted)] hover:bg-[var(--color-panel-hover)]"
                        onClick={() => openCustomize({ id: line.menuItemId }, line)}
                      >
                        <Pencil size={14} strokeWidth={1.75} />
                      </button>
                      <button
                        type="button"
                        title="Remove item"
                        className="rounded-md p-1 text-[var(--color-danger)] hover:bg-[var(--color-panel-hover)]"
                        onClick={() => updateQty(line.key, -line.quantity)}
                      >
                        <Trash2 size={14} strokeWidth={1.75} />
                      </button>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="rounded-md border border-[var(--color-line)] bg-[var(--color-section)] p-1.5 hover:bg-[var(--color-panel-hover)]"
                        onClick={() => updateQty(line.key, -1)}
                      >
                        <Minus size={12} strokeWidth={1.75} />
                      </button>
                      <span className="min-w-[1.5rem] text-center font-medium">{line.quantity}</span>
                      <button
                        type="button"
                        className="rounded-md border border-[var(--color-line)] bg-[var(--color-section)] p-1.5 hover:bg-[var(--color-panel-hover)]"
                        onClick={() => updateQty(line.key, 1)}
                      >
                        <Plus size={12} strokeWidth={1.75} />
                      </button>
                    </div>
                    <span className="font-semibold text-[#f5f5f5]">{money(linePreview(line))}</span>
                  </div>
                </div>
              ))}
              {!cart.length && (
                <p className="rounded-lg border border-dashed border-[var(--color-line)] p-4 text-sm text-[var(--color-ink-muted)]">
                  Tap a product to add it. Customizations open when available.
                </p>
              )}
            </div>

            {orderType === 'DELIVERY' && (
              <div className="mt-3 space-y-2 border-t border-[var(--color-line)] pt-3">
                <p className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--color-ink-muted)]">
                  <Truck size={12} strokeWidth={1.75} />
                  Delivery details
                </p>
                {selectedCustomerId ? (
                  <p className="text-[11px] text-[var(--color-ink-muted)]">
                    Saved address loaded — edit for this order only, or check save to update the
                    profile.
                  </p>
                ) : null}
                <Field label="Complete delivery address" required>
                  <TextInput
                    placeholder="e.g. House 24, Street 5, Block B"
                    value={delivery.line1}
                    onChange={(e) => setDelivery({ ...delivery, line1: e.target.value })}
                  />
                </Field>
                <Field label="Nearby location / area" required>
                  <TextInput
                    placeholder="e.g. Gulshan-e-Iqbal, DHA Phase 5"
                    value={delivery.city}
                    onChange={(e) => setDelivery({ ...delivery, city: e.target.value })}
                  />
                </Field>
                <label className="flex cursor-pointer items-start gap-2 text-sm text-[var(--color-ink-muted)]">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={saveDeliveryAddress}
                    onChange={(e) => setSaveDeliveryAddress(e.target.checked)}
                  />
                  <span>Save this address for future orders</span>
                </label>
              </div>
            )}

            <TextArea
              className="mt-3"
              rows={2}
              placeholder="Order notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />

            <div className="mt-3 space-y-2 border-t border-[var(--color-line)] pt-3 text-sm">
              <div className="flex justify-between text-[var(--color-ink-muted)]">
                <span>Subtotal</span>
                <span className="text-[#f5f5f5]">{money(subtotalPreview)}</span>
              </div>
              <p className="text-xs text-[var(--color-ink-muted)]">
                Tax and discounts are applied at checkout from the payment method.
              </p>
              <div className="flex justify-between text-base font-semibold text-[#f5f5f5]">
                <span>Total</span>
                <span className="text-[var(--color-brand)]">{money(subtotalPreview)}</span>
              </div>
              <Button className="w-full" disabled={submitting || !cart.length} onClick={checkout}>
                {submitting ? 'Preparing checkout…' : 'Checkout'}
              </Button>
            </div>
          </aside>
      </div>

      <Modal
        open={Boolean(customizeItem)}
        title={
          customizeItem ? `${customizeItem.name} — ${money(liveUnitPrice)}` : 'Customize'
        }
        onClose={() => {
          setCustomizeItem(null);
          setEditingKey(null);
        }}
        wide
      >
        {customizeItem && (
          <div className="space-y-4">
            {(customizeItem.variants || []).length > 0 && (
              <Field label="Size / variant">
                <Select value={variantId} onChange={(e) => setVariantId(e.target.value)}>
                  {(customizeItem.variants || []).map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name} — {money(v.price)}
                    </option>
                  ))}
                </Select>
              </Field>
            )}

            {(customizeItem.modifierGroups || []).length === 0 && (
              <p className="text-sm text-[var(--color-ink-muted)]">
                No customizations for this product. Add it to the cart as is.
              </p>
            )}

            {(customizeItem.modifierGroups || []).map((group) => (
              <div key={group.id} className="rounded-lg border border-[var(--color-line)] bg-[var(--color-panel)] p-3">
                <div className="mb-2 flex items-baseline justify-between gap-2">
                  <p className="text-sm font-semibold">
                    {group.name}
                    {(group.isRequired || Number(group.minSelect) > 0) && (
                      <span className="ml-1 text-[var(--color-danger)]">*</span>
                    )}
                  </p>
                  <p className="text-xs text-[var(--color-ink-muted)]">
                    {group.selectionType === 'SINGLE' ? 'Choose one' : 'Choose any'}
                    {group.isRequired || Number(group.minSelect) > 0 ? ' · required' : ' · optional'}
                  </p>
                </div>
                <div className="divide-y divide-[var(--color-line)]">
                  {(group.modifiers || [])
                    .filter((m) => m.isActive !== false)
                    .map((mod) => (
                      <label
                        key={mod.id}
                        className="flex cursor-pointer items-center justify-between gap-3 py-2 text-sm"
                      >
                        <span className="inline-flex items-center gap-2">
                          <input
                            type={group.selectionType === 'SINGLE' ? 'radio' : 'checkbox'}
                            name={group.id}
                            checked={Boolean(selectedMods[mod.id])}
                            onChange={() => toggleMod(mod.id, group)}
                          />
                          {mod.name}
                        </span>
                        <span className="text-[var(--color-ink-muted)]">
                          {priceLabel(mod.priceDelta)}
                        </span>
                      </label>
                    ))}
                </div>
              </div>
            ))}

            <Field label="Special request">
              <TextInput
                value={itemNotes}
                onChange={(e) => setItemNotes(e.target.value)}
                placeholder="Optional note for kitchen"
              />
            </Field>

            <div className="flex items-center justify-between gap-3 border-t border-[var(--color-line)] pt-3">
              <p className="text-sm font-semibold">Item total: {money(liveUnitPrice)}</p>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setCustomizeItem(null);
                    setEditingKey(null);
                  }}
                >
                  Cancel
                </Button>
                <Button onClick={addConfiguredToCart}>
                  {editingKey ? 'Update cart' : 'Add to cart'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

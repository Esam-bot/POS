import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Search, Minus, Plus, Trash2, Pencil } from 'lucide-react';
import { menuApi, imageSrc, MENU_IMAGE_FALLBACK } from '../../services/menuService';
import { ordersApi, tablesApi, sessionsApi } from '../../services/posService';
import { customersApi } from '../../services/customersService';
import { money } from '../../utils/formatMoney';
import { useToast } from '../../components/ui/Toast';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import { Field, TextInput, TextArea, Select } from '../../components/ui/Input';
import {
  FLOORS,
  STATUS_CARD_TONE,
  STATUS_LABEL,
  tablesForFloor,
} from '../../utils/floors';

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

const ORDER_TYPES = [
  { value: 'DINE_IN', label: 'Dine In' },
  { value: 'TAKEAWAY', label: 'Takeaway' },
  { value: 'DELIVERY', label: 'Delivery' },
];

export default function POSPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const sessionId = params.get('sessionId') || '';
  const tableId = params.get('tableId') || '';

  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);
  const [categoryId, setCategoryId] = useState('');
  const [search, setSearch] = useState('');
  const [orderType, setOrderType] = useState(sessionId ? 'DINE_IN' : '');
  const [notes, setNotes] = useState('');
  const [cart, setCart] = useState([]);
  const [tableLabel, setTableLabel] = useState('');
  const [tables, setTables] = useState([]);
  const [floor, setFloor] = useState(FLOORS[0].key);
  const [seating, setSeating] = useState(false);
  const [customizeItem, setCustomizeItem] = useState(null);
  const [editingKey, setEditingKey] = useState(null);
  const [variantId, setVariantId] = useState('');
  const [selectedMods, setSelectedMods] = useState({});
  const [itemNotes, setItemNotes] = useState('');
  const [guest, setGuest] = useState({ name: '', phone: '' });
  const [guestSuggestions, setGuestSuggestions] = useState([]);
  const [showGuestSuggestions, setShowGuestSuggestions] = useState(false);
  const [guestSearchLoading, setGuestSearchLoading] = useState(false);
  const guestSuggestRef = useRef(null);
  const [delivery, setDelivery] = useState({ line1: '', city: '' });
  const [submitting, setSubmitting] = useState(false);
  const [detailCache, setDetailCache] = useState({});

  const guestReady =
    Boolean(guest.name.trim()) &&
    Boolean(guest.phone.trim()) &&
    guest.phone.trim().length >= 7;

  useEffect(() => {
    const term = guest.name.trim().length >= 2 ? guest.name.trim() : guest.phone.trim();
    if (term.length < 2) {
      setGuestSuggestions([]);
      return undefined;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setGuestSearchLoading(true);
      try {
        const data = await customersApi.search(term, { limit: 8 });
        if (!cancelled) {
          setGuestSuggestions(data.items || []);
          setShowGuestSuggestions(true);
        }
      } catch {
        if (!cancelled) setGuestSuggestions([]);
      } finally {
        if (!cancelled) setGuestSearchLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [guest.name, guest.phone]);

  useEffect(() => {
    function onDocClick(e) {
      if (!guestSuggestRef.current?.contains(e.target)) {
        setShowGuestSuggestions(false);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  function pickGuestSuggestion(row) {
    setGuest({
      name: row.name || '',
      phone: row.phone || '',
    });
    setGuestSuggestions([]);
    setShowGuestSuggestions(false);
  }
  const needsTablePicker = guestReady && orderType === 'DINE_IN' && !sessionId;
  const readyToOrder =
    guestReady &&
    (orderType === 'TAKEAWAY' ||
      orderType === 'DELIVERY' ||
      (orderType === 'DINE_IN' && Boolean(sessionId)));

  const loadMenu = useCallback(async () => {
    if (!readyToOrder) return;
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
  }, [categoryId, search, toast, readyToOrder]);

  useEffect(() => {
    loadMenu();
  }, [loadMenu]);

  useEffect(() => {
    if (sessionId) setOrderType('DINE_IN');
  }, [sessionId]);

  useEffect(() => {
    if (!tableId) {
      setTableLabel('');
      return;
    }
    tablesApi
      .get(tableId)
      .then((t) => setTableLabel(t.number))
      .catch(() => setTableLabel(''));
  }, [tableId]);

  const loadTables = useCallback(async () => {
    try {
      const data = await tablesApi.list({ limit: 100, isActive: true });
      setTables(data.items || []);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load tables');
    }
  }, [toast]);

  useEffect(() => {
    if (needsTablePicker) loadTables();
  }, [needsTablePicker, loadTables]);

  const floorTables = useMemo(() => tablesForFloor(tables, floor), [tables, floor]);

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

  function chooseOrderType(type) {
    setOrderType(type);
    if (type !== 'DINE_IN') {
      const next = new URLSearchParams(params);
      next.delete('sessionId');
      next.delete('tableId');
      setParams(next, { replace: true });
      setTableLabel('');
    }
  }

  async function pickTable(table) {
    if (table.activeSession?.id) {
      navigate(
        `/pos?sessionId=${table.activeSession.id}&tableId=${table.id}`,
        { replace: true }
      );
      return;
    }
    if (table.status !== 'AVAILABLE') {
      toast.error(`Table is ${STATUS_LABEL[table.status] || table.status}`);
      return;
    }
    setSeating(true);
    try {
      const session = await sessionsApi.open({ tableIds: [table.id] });
      toast.success(`Seated at ${table.number}`);
      navigate(`/pos?sessionId=${session.id}&tableId=${table.id}`, { replace: true });
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not open table');
      loadTables();
    } finally {
      setSeating(false);
    }
  }

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
    if (orderType === 'DINE_IN' && !sessionId) {
      toast.error('Select a table for dine-in');
      return;
    }
    if (!guest.name.trim() || !guest.phone.trim()) {
      toast.error('Customer name and phone number are required');
      return;
    }
    if (!/^[0-9+\-\s()]+$/.test(guest.phone.trim()) || guest.phone.trim().length < 7) {
      toast.error('Enter a valid phone number');
      return;
    }
    if (orderType === 'DELIVERY' && !delivery.line1.trim()) {
      toast.error('Delivery address is required');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        type: orderType,
        customerName: guest.name.trim(),
        customerPhone: guest.phone.trim(),
        tableSessionId: orderType === 'DINE_IN' ? sessionId : null,
        diningTableId: orderType === 'DINE_IN' ? tableId || null : null,
        notes: notes || null,
        deliveryFee: orderType === 'DELIVERY' ? 100 : 0,
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
      toast.success(`Order ${submitted.orderNumber} ready for payment`);
      setCart([]);
      setNotes('');
      setGuest({ name: '', phone: '' });
      setDelivery({ line1: '', city: '' });
      navigate(`/pos/orders/${submitted.id}/pay`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to place order');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col gap-3 p-3">
      <section className="shrink-0 rounded-xl bg-white/5 p-3" ref={guestSuggestRef}>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/60">
          1. Customer details
        </p>
        <div className="relative grid gap-3 sm:grid-cols-2">
          <Field label="Customer name" required>
            <TextInput
              value={guest.name}
              onChange={(e) => {
                setGuest({ ...guest, name: e.target.value });
                setShowGuestSuggestions(true);
              }}
              onFocus={() => setShowGuestSuggestions(true)}
              placeholder="Start typing a name…"
              autoComplete="off"
              required
            />
          </Field>
          <Field label="Phone number" required>
            <TextInput
              value={guest.phone}
              onChange={(e) => {
                setGuest({ ...guest, phone: e.target.value });
                setShowGuestSuggestions(true);
              }}
              onFocus={() => setShowGuestSuggestions(true)}
              placeholder="e.g. 03001234567"
              inputMode="tel"
              autoComplete="off"
              required
            />
          </Field>
          {showGuestSuggestions && (guestSuggestions.length > 0 || guestSearchLoading) && (
            <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-56 overflow-y-auto rounded-xl border border-white/15 bg-[#132033] shadow-xl">
              {guestSearchLoading && !guestSuggestions.length ? (
                <p className="px-3 py-2 text-xs text-white/50">Searching…</p>
              ) : (
                guestSuggestions.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm hover:bg-white/10"
                    onClick={() => pickGuestSuggestion(row)}
                  >
                    <span className="font-medium text-white">{row.name}</span>
                    <span className="text-xs text-white/60">{row.phone || '—'}</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
        <p className="mt-2 text-[11px] text-white/45">
          Returning customers: type a few letters of the name or phone to autofill.
        </p>
      </section>

      <section className="shrink-0 rounded-xl bg-white/5 p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/60">
          2. Order type
        </p>
        <div className="flex flex-wrap gap-2">
          {ORDER_TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              disabled={!guestReady}
              onClick={() => chooseOrderType(t.value)}
              className={`min-w-[120px] rounded-xl px-4 py-3 text-sm font-semibold transition ${
                orderType === t.value
                  ? 'bg-[var(--color-brand)] text-white'
                  : 'bg-white/10 text-white hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {!guestReady && (
          <p className="mt-2 text-xs text-white/50">Enter customer name and phone to continue.</p>
        )}
        {orderType === 'DINE_IN' && sessionId && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <span className="rounded-md bg-emerald-500/20 px-2 py-1 text-emerald-100">
              Table {tableLabel || '…'} · session open
            </span>
            <button
              type="button"
              className="text-xs text-white/70 underline hover:text-white"
              onClick={() => {
                const next = new URLSearchParams(params);
                next.delete('sessionId');
                next.delete('tableId');
                setParams(next, { replace: true });
              }}
            >
              Change table
            </button>
          </div>
        )}
      </section>

      {needsTablePicker && (
        <section className="min-h-0 flex-1 overflow-y-auto rounded-xl bg-white/5 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/60">
            Select table
          </p>
          <div className="mb-3 flex flex-wrap gap-2">
            {FLOORS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFloor(f.key)}
                className={`rounded-lg px-3 py-2 text-sm font-medium ${
                  floor === f.key ? 'bg-white text-[var(--color-ink)]' : 'bg-white/10 hover:bg-white/15'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="mb-3 flex flex-wrap gap-3 text-xs text-white/70">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" /> Available
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-red-400" /> Occupied — tap to add order
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
            {floorTables.map((table) => (
              <button
                key={table.id}
                type="button"
                disabled={seating}
                onClick={() => pickTable(table)}
                className={`rounded-xl border-2 p-3 text-left transition ${
                  STATUS_CARD_TONE[table.status] || 'border-white/20'
                }`}
              >
                <p className="text-xl font-bold">{table.number}</p>
                <p className="text-xs text-white/80">
                  {STATUS_LABEL[table.status] || table.status} · {table.capacity} seats
                </p>
              </button>
            ))}
            {!floorTables.length && (
              <p className="col-span-full text-sm text-white/50">No tables on this floor.</p>
            )}
          </div>
        </section>
      )}

      {guestReady && !orderType && (
        <section className="flex flex-1 items-center justify-center rounded-xl bg-white/5 p-8 text-center text-white/60">
          Choose Dine In, Takeaway, or Delivery to continue.
        </section>
      )}
      {!guestReady && (
        <section className="flex flex-1 items-center justify-center rounded-xl bg-white/5 p-8 text-center text-white/60">
          Enter the customer’s name and phone number to start the order.
        </section>
      )}

      {readyToOrder && (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[180px_1fr_340px]">
          <section className="overflow-y-auto rounded-xl bg-white/5 p-3">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-white/60">
              Categories
            </h2>
            <button
              type="button"
              onClick={() => setCategoryId('')}
              className={`mb-1 w-full rounded-lg px-3 py-2 text-left text-sm ${
                !categoryId ? 'bg-[var(--color-brand)] text-white' : 'hover:bg-white/10'
              }`}
            >
              All
            </button>
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategoryId(c.id)}
                className={`mb-1 w-full rounded-lg px-3 py-2 text-left text-sm ${
                  categoryId === c.id ? 'bg-[var(--color-brand)] text-white' : 'hover:bg-white/10'
                }`}
              >
                {c.name}
              </button>
            ))}
          </section>

          <section className="flex min-h-0 flex-col rounded-xl bg-white/5 p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/60">
              3. Products
            </p>
            <div className="relative mb-3">
              <Search size={16} className="absolute left-3 top-3 text-white/40" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search products…"
                className="w-full rounded-lg border border-white/20 bg-white/10 py-2 pl-9 pr-3 text-sm text-white placeholder:text-white/45 outline-none focus:ring-2 focus:ring-white/30"
              />
            </div>
            <div className="grid min-h-0 flex-1 grid-cols-2 gap-3 overflow-y-auto md:grid-cols-3 xl:grid-cols-4">
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => openCustomize(item)}
                  className="group flex h-full flex-col rounded-xl bg-white/10 p-3 text-left transition hover:bg-white/15 hover:ring-1 hover:ring-white/20"
                >
                  <div className="mb-2 aspect-square overflow-hidden rounded-lg bg-black/30">
                    <img
                      src={imageSrc(item.imageUrl) || MENU_IMAGE_FALLBACK}
                      alt={item.name}
                      loading="lazy"
                      className="h-full w-full object-cover transition duration-200 group-hover:scale-[1.03]"
                      onError={(e) => {
                        if (e.currentTarget.src.endsWith(MENU_IMAGE_FALLBACK)) return;
                        e.currentTarget.src = MENU_IMAGE_FALLBACK;
                      }}
                    />
                  </div>
                  <p className="line-clamp-2 text-sm font-semibold leading-snug">{item.name}</p>
                  <p className="mt-auto pt-1 text-xs font-medium text-emerald-200/90">
                    {money(item.basePrice)}
                  </p>
                </button>
              ))}
              {!items.length && (
                <p className="col-span-full p-6 text-sm text-white/50">No available products.</p>
              )}
            </div>
          </section>

          <section className="theme-light flex min-h-0 flex-col rounded-xl bg-white p-4 text-[var(--color-ink)]">
            <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
              4. Review order
            </h2>
            <p className="mb-1 text-xs text-[var(--color-ink-muted)]">
              {guest.name.trim()} · {guest.phone.trim()}
            </p>
            <p className="mb-3 text-xs text-[var(--color-ink-muted)]">
              {ORDER_TYPES.find((t) => t.value === orderType)?.label}
              {tableLabel ? ` · Table ${tableLabel}` : ''}
            </p>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
              {cart.map((line) => (
                <div
                  key={line.key}
                  className="rounded-lg border border-[var(--color-line)] p-3 text-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{line.name}</p>
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
                        {money(line.unitPrice + line.modifiers.reduce((s, m) => s + Number(m.priceDelta || 0), 0))} each
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        title="Edit customizations"
                        onClick={() => openCustomize({ id: line.menuItemId }, line)}
                      >
                        <Pencil size={14} className="text-[var(--color-ink-muted)]" />
                      </button>
                      <button type="button" onClick={() => updateQty(line.key, -line.quantity)}>
                        <Trash2 size={14} className="text-[var(--color-danger)]" />
                      </button>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="rounded border p-1"
                        onClick={() => updateQty(line.key, -1)}
                      >
                        <Minus size={12} />
                      </button>
                      <span>{line.quantity}</span>
                      <button
                        type="button"
                        className="rounded border p-1"
                        onClick={() => updateQty(line.key, 1)}
                      >
                        <Plus size={12} />
                      </button>
                    </div>
                    <span className="font-medium">{money(linePreview(line))}</span>
                  </div>
                </div>
              ))}
              {!cart.length && (
                <p className="text-sm text-[var(--color-ink-muted)]">
                  Tap a product to add it. Customizations open when available.
                </p>
              )}
            </div>

            {orderType === 'DELIVERY' && (
              <div className="mt-3 space-y-2 border-t border-[var(--color-line)] pt-3">
                <p className="text-xs font-medium text-[var(--color-ink-muted)]">Delivery address</p>
                <TextInput
                  placeholder="Address"
                  value={delivery.line1}
                  onChange={(e) => setDelivery({ ...delivery, line1: e.target.value })}
                />
                <TextInput
                  placeholder="City"
                  value={delivery.city}
                  onChange={(e) => setDelivery({ ...delivery, city: e.target.value })}
                />
              </div>
            )}

            <TextArea
              className="mt-3"
              rows={2}
              placeholder="Order notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />

            <div className="mt-3 border-t border-[var(--color-line)] pt-3 text-sm">
              <div className="mb-3 flex justify-between font-semibold">
                <span>Subtotal</span>
                <span>{money(subtotalPreview)}</span>
              </div>
              <p className="mb-2 text-xs text-[var(--color-ink-muted)]">
                Tax is calculated automatically at checkout from the payment method.
              </p>
              <Button className="w-full" disabled={submitting || !cart.length} onClick={checkout}>
                {submitting ? 'Preparing checkout…' : 'Checkout'}
              </Button>
            </div>
          </section>
        </div>
      )}

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
              <div key={group.id} className="rounded-lg border border-[var(--color-line)] p-3">
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

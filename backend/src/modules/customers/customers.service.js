const prisma = require('../../config/db');
const AppError = require('../../utils/AppError');

/**
 * Upsert a walk-in guest into customers by phone (unique).
 * Returns the customer record. Safe to call inside a transaction (pass tx).
 */
async function upsertGuestCustomer({ name, phone }, db = prisma) {
  const customerName = String(name || '').trim();
  const customerPhone = String(phone || '').trim();
  if (!customerName) throw new AppError('Customer name is required', 400);

  // Phone is required for delivery identity / saved addresses; optional for dine-in & takeaway.
  if (customerPhone) {
    const existing = await db.customer.findUnique({ where: { phone: customerPhone } });
    if (existing) {
      return db.customer.update({
        where: { id: existing.id },
        data: {
          name: customerName,
          deletedAt: null,
        },
      });
    }

    return db.customer.create({
      data: {
        name: customerName,
        phone: customerPhone,
      },
    });
  }

  return db.customer.create({
    data: {
      name: customerName,
      phone: null,
    },
  });
}

function mapDefaultAddress(customer) {
  const addr = (customer.addresses || [])[0] || null;
  if (!addr) {
    return {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      updatedAt: customer.updatedAt,
      defaultAddress: null,
    };
  }
  return {
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    updatedAt: customer.updatedAt,
    defaultAddress: {
      id: addr.id,
      line1: addr.line1,
      city: addr.city,
      isDefault: addr.isDefault,
    },
  };
}

/**
 * Search customers by name or phone prefix/substring for POS autocomplete.
 * Includes the default delivery address when present.
 */
async function searchCustomers(query, { limit = 10 } = {}) {
  const term = String(query || '').trim();
  if (term.length < 2) return [];

  const take = Math.min(Math.max(Number(limit) || 10, 1), 25);

  const items = await prisma.customer.findMany({
    where: {
      deletedAt: null,
      OR: [
        { name: { contains: term, mode: 'insensitive' } },
        { phone: { contains: term } },
      ],
    },
    select: {
      id: true,
      name: true,
      phone: true,
      updatedAt: true,
      addresses: {
        where: { isDefault: true },
        orderBy: { updatedAt: 'desc' },
        take: 1,
        select: {
          id: true,
          line1: true,
          city: true,
          isDefault: true,
        },
      },
    },
    orderBy: { updatedAt: 'desc' },
    take,
  });

  return items.map(mapDefaultAddress);
}

/**
 * Create or update the customer's single default delivery address.
 * Does not touch order snapshots.
 */
async function saveDefaultDeliveryAddress({ customerId, line1, city }, db = prisma) {
  if (!customerId) throw new AppError('Customer is required', 400);

  const addressLine = String(line1 || '').trim();
  const nearby = String(city || '').trim();
  if (!addressLine) throw new AppError('Complete delivery address is required', 400);
  if (!nearby) throw new AppError('Nearby location / area is required', 400);

  const customer = await db.customer.findFirst({
    where: { id: customerId, deletedAt: null },
    select: { id: true },
  });
  if (!customer) throw new AppError('Customer not found', 404);

  const existing = await db.customerAddress.findFirst({
    where: { customerId, isDefault: true },
    orderBy: { updatedAt: 'desc' },
  });

  if (existing) {
    return db.customerAddress.update({
      where: { id: existing.id },
      data: {
        line1: addressLine,
        city: nearby,
        label: existing.label || 'Delivery',
        isDefault: true,
      },
    });
  }

  await db.customerAddress.updateMany({
    where: { customerId, isDefault: true },
    data: { isDefault: false },
  });

  return db.customerAddress.create({
    data: {
      customerId,
      line1: addressLine,
      city: nearby,
      label: 'Delivery',
      isDefault: true,
    },
  });
}

module.exports = {
  upsertGuestCustomer,
  searchCustomers,
  saveDefaultDeliveryAddress,
};

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
  if (!customerPhone) throw new AppError('Customer phone number is required', 400);

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

/**
 * Search customers by name or phone prefix/substring for POS autocomplete.
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
    },
    orderBy: { updatedAt: 'desc' },
    take,
  });

  return items;
}

module.exports = {
  upsertGuestCustomer,
  searchCustomers,
};

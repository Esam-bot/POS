const prisma = require('../../config/db');
const AppError = require('../../utils/AppError');
const { parsePagination, paginatedResult } = require('../../utils/pagination');
const { serializeDecimals } = require('../../utils/decimal');

function mapSupplier(row) {
  return serializeDecimals({
    id: row.id,
    name: row.name,
    contactPerson: row.contactPerson,
    phone: row.phone,
    email: row.email,
    address: row.address,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    purchaseCount: row._count?.purchaseOrders ?? undefined,
  });
}

async function listSuppliers(query = {}) {
  const { page, limit, skip } = parsePagination(query);
  const where = { deletedAt: null };
  if (query.search) {
    where.name = { contains: query.search, mode: 'insensitive' };
  }
  if (query.isActive === 'true') where.isActive = true;
  if (query.isActive === 'false') where.isActive = false;

  const [total, rows] = await Promise.all([
    prisma.supplier.count({ where }),
    prisma.supplier.findMany({
      where,
      skip,
      take: limit,
      orderBy: { name: 'asc' },
      include: { _count: { select: { purchaseOrders: true } } },
    }),
  ]);
  return paginatedResult(rows.map(mapSupplier), total, page, limit);
}

async function getSupplier(id) {
  const row = await prisma.supplier.findFirst({
    where: { id, deletedAt: null },
    include: {
      _count: { select: { purchaseOrders: true } },
      purchaseOrders: {
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true,
          status: true,
          totalCost: true,
          orderedAt: true,
          receivedAt: true,
          createdAt: true,
        },
      },
    },
  });
  if (!row) throw new AppError('Supplier not found', 404);
  return serializeDecimals({
    ...mapSupplier(row),
    purchases: row.purchaseOrders,
  });
}

async function createSupplier(data) {
  const name = String(data.name || '').trim();
  if (!name) throw new AppError('Supplier name is required', 400);
  const row = await prisma.supplier.create({
    data: {
      name,
      contactPerson: data.contactPerson || null,
      phone: data.phone || null,
      email: data.email || null,
      address: data.address || null,
      isActive: data.isActive ?? true,
    },
  });
  return mapSupplier(row);
}

async function updateSupplier(id, data) {
  const existing = await prisma.supplier.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw new AppError('Supplier not found', 404);
  const row = await prisma.supplier.update({
    where: { id },
    data: {
      ...(data.name !== undefined ? { name: String(data.name).trim() } : {}),
      ...(data.contactPerson !== undefined ? { contactPerson: data.contactPerson || null } : {}),
      ...(data.phone !== undefined ? { phone: data.phone || null } : {}),
      ...(data.email !== undefined ? { email: data.email || null } : {}),
      ...(data.address !== undefined ? { address: data.address || null } : {}),
      ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
    },
  });
  return mapSupplier(row);
}

async function archiveSupplier(id) {
  const existing = await prisma.supplier.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw new AppError('Supplier not found', 404);
  const row = await prisma.supplier.update({
    where: { id },
    data: { isActive: false, deletedAt: new Date() },
  });
  return mapSupplier(row);
}

module.exports = {
  listSuppliers,
  getSupplier,
  createSupplier,
  updateSupplier,
  archiveSupplier,
};

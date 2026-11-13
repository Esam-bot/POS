const prisma = require('../../config/db');
const AppError = require('../../utils/AppError');
const { serializeDecimals } = require('../../utils/decimal');
const { D } = require('../../utils/moneyMath');

function expenseDateFilter(query) {
  if (!query.from && !query.to) return {};
  const range = {};
  if (query.from) range.gte = new Date(query.from);
  if (query.to) range.lte = new Date(query.to);
  return { expenseDate: range };
}

function mapExpense(row) {
  const isRecurring = Boolean(row.recurringExpenseId);
  return serializeDecimals({
    id: row.id,
    title: row.title,
    description: row.description,
    amount: row.amount,
    expenseDate: row.expenseDate,
    categoryId: row.categoryId,
    methodId: row.methodId,
    recordedById: row.recordedById,
    updatedById: row.updatedById,
    recurringExpenseId: row.recurringExpenseId || null,
    billingPeriod: row.billingPeriod || null,
    paymentStatus: row.paymentStatus || 'UNPAID',
    source: isRecurring ? 'RECURRING' : 'MANUAL',
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    category: row.category
      ? { id: row.category.id, name: row.category.name }
      : null,
    method: row.method
      ? { id: row.method.id, code: row.method.code, name: row.method.name }
      : null,
    recordedBy: row.recordedBy
      ? { id: row.recordedBy.id, name: row.recordedBy.name }
      : null,
    updatedBy: row.updatedBy
      ? { id: row.updatedBy.id, name: row.updatedBy.name }
      : null,
    recurringExpense: row.recurringExpense
      ? {
          id: row.recurringExpense.id,
          title: row.recurringExpense.title,
          frequency: row.recurringExpense.frequency,
          status: row.recurringExpense.status,
        }
      : null,
  });
}

const expenseInclude = {
  category: { select: { id: true, name: true } },
  method: { select: { id: true, code: true, name: true } },
  recordedBy: { select: { id: true, name: true } },
  updatedBy: { select: { id: true, name: true } },
  recurringExpense: {
    select: { id: true, title: true, frequency: true, status: true },
  },
};

async function listCategories({ includeInactive = false } = {}) {
  return prisma.expenseCategory.findMany({
    where: includeInactive
      ? { deletedAt: null }
      : { isActive: true, deletedAt: null },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, isActive: true },
  });
}

async function createCategory(body) {
  const name = String(body.name || '').trim();
  if (!name) throw new AppError('Category name is required', 400);

  const existing = await prisma.expenseCategory.findUnique({ where: { name } });
  if (existing && !existing.deletedAt) {
    throw new AppError('An expense category with this name already exists', 409);
  }
  if (existing?.deletedAt) {
    return prisma.expenseCategory.update({
      where: { id: existing.id },
      data: { isActive: true, deletedAt: null, name },
      select: { id: true, name: true, isActive: true },
    });
  }

  return prisma.expenseCategory.create({
    data: { name },
    select: { id: true, name: true, isActive: true },
  });
}

async function updateCategory(id, body) {
  const existing = await prisma.expenseCategory.findFirst({
    where: { id, deletedAt: null },
  });
  if (!existing) throw new AppError('Expense category not found', 404);

  if (body.name) {
    const clash = await prisma.expenseCategory.findFirst({
      where: { name: body.name, id: { not: id }, deletedAt: null },
    });
    if (clash) throw new AppError('An expense category with this name already exists', 409);
  }

  return prisma.expenseCategory.update({
    where: { id },
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
    },
    select: { id: true, name: true, isActive: true },
  });
}

async function archiveCategory(id) {
  const existing = await prisma.expenseCategory.findFirst({
    where: { id, deletedAt: null },
  });
  if (!existing) throw new AppError('Expense category not found', 404);

  const inUseExpenseCount = await prisma.expense.count({ where: { categoryId: id } });
  // Soft-archive; keep historical expense links
  const updated = await prisma.expenseCategory.update({
    where: { id },
    data: { isActive: false, deletedAt: new Date() },
    select: { id: true, name: true, isActive: true, deletedAt: true },
  });
  return { ...updated, inUseExpenseCount };
}

async function listExpenses(query = {}) {
  const page = query.page || 1;
  const limit = query.limit || 50;
  const skip = (page - 1) * limit;
  const search = String(query.search || '').trim();

  const where = {
    ...expenseDateFilter(query),
    ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    ...(query.paymentStatus ? { paymentStatus: query.paymentStatus } : {}),
    ...(search
      ? {
          OR: [
            { title: { contains: search, mode: 'insensitive' } },
            { description: { contains: search, mode: 'insensitive' } },
            { category: { name: { contains: search, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };

  // Summary totals ignore paymentStatus filter so cards stay meaningful while filtering the table
  const summaryWhere = {
    ...expenseDateFilter(query),
    ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    ...(search
      ? {
          OR: [
            { title: { contains: search, mode: 'insensitive' } },
            { description: { contains: search, mode: 'insensitive' } },
            { category: { name: { contains: search, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };

  const [items, total, aggregates, paidAgg, unpaidAgg] = await Promise.all([
    prisma.expense.findMany({
      where,
      include: expenseInclude,
      orderBy: [{ expenseDate: 'desc' }, { createdAt: 'desc' }],
      skip,
      take: limit,
    }),
    prisma.expense.count({ where }),
    prisma.expense.groupBy({
      by: ['categoryId'],
      where: summaryWhere,
      _sum: { amount: true },
    }),
    prisma.expense.aggregate({
      where: { ...summaryWhere, paymentStatus: 'PAID' },
      _sum: { amount: true },
    }),
    prisma.expense.aggregate({
      where: { ...summaryWhere, paymentStatus: 'UNPAID' },
      _sum: { amount: true },
    }),
  ]);

  const categoryIds = aggregates.map((a) => a.categoryId);
  const categories = categoryIds.length
    ? await prisma.expenseCategory.findMany({
        where: { id: { in: categoryIds } },
        select: { id: true, name: true },
      })
    : [];
  const catMap = Object.fromEntries(categories.map((c) => [c.id, c.name]));

  let totalAmount = D(0);
  const byCategory = {};
  for (const row of aggregates) {
    const amt = D(row._sum.amount || 0);
    totalAmount = totalAmount.plus(amt);
    const name = catMap[row.categoryId] || 'Unknown';
    byCategory[name] = amt;
  }

  return {
    items: items.map(mapExpense),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
    summary: serializeDecimals({
      total: totalAmount,
      paid: D(paidAgg._sum.amount || 0),
      unpaid: D(unpaidAgg._sum.amount || 0),
      byCategory,
    }),
  };
}

async function getExpense(id) {
  const row = await prisma.expense.findUnique({
    where: { id },
    include: expenseInclude,
  });
  if (!row) throw new AppError('Expense not found', 404);
  return mapExpense(row);
}

async function assertCategory(categoryId) {
  const cat = await prisma.expenseCategory.findFirst({
    where: { id: categoryId, isActive: true, deletedAt: null },
  });
  if (!cat) throw new AppError('Expense category not found', 400);
  return cat;
}

async function assertMethod(methodId) {
  if (!methodId) return null;
  const method = await prisma.paymentMethod.findFirst({
    where: { id: methodId, isActive: true, deletedAt: null },
  });
  if (!method) throw new AppError('Payment method not found', 400);
  return method;
}

async function createExpense(body, userId) {
  await assertCategory(body.categoryId);
  await assertMethod(body.methodId || null);

  const billingPeriod =
    body.billingPeriod ||
    (body.expenseDate ? String(body.expenseDate).slice(0, 7) : null);

  const row = await prisma.expense.create({
    data: {
      title: body.title,
      description: body.description || null,
      amount: body.amount,
      categoryId: body.categoryId,
      methodId: body.methodId || null,
      expenseDate: new Date(body.expenseDate),
      billingPeriod,
      paymentStatus: body.paymentStatus || 'UNPAID',
      recordedById: userId,
    },
    include: expenseInclude,
  });

  return mapExpense(row);
}

async function updateExpense(id, body, userId) {
  const existing = await prisma.expense.findUnique({ where: { id } });
  if (!existing) throw new AppError('Expense not found', 404);

  if (body.categoryId) await assertCategory(body.categoryId);
  if (body.methodId !== undefined) await assertMethod(body.methodId || null);

  const data = {
    updatedById: userId,
  };
  if (body.title !== undefined) data.title = body.title;
  if (body.description !== undefined) data.description = body.description || null;
  if (body.amount !== undefined) data.amount = body.amount;
  if (body.categoryId !== undefined) data.categoryId = body.categoryId;
  if (body.methodId !== undefined) data.methodId = body.methodId || null;
  if (body.expenseDate !== undefined) data.expenseDate = new Date(body.expenseDate);
  if (body.billingPeriod !== undefined) {
    data.billingPeriod = body.billingPeriod || null;
  }
  if (body.paymentStatus !== undefined) data.paymentStatus = body.paymentStatus;

  const row = await prisma.expense.update({
    where: { id },
    data,
    include: expenseInclude,
  });

  return mapExpense(row);
}

async function deleteExpense(id) {
  const existing = await prisma.expense.findUnique({ where: { id } });
  if (!existing) throw new AppError('Expense not found', 404);
  await prisma.expense.delete({ where: { id } });
  return { id };
}

/**
 * Totals for financial summary — respects inclusive expenseDate range.
 * Includes all expense records (manual + generated); schedules are never counted.
 */
async function expenseTotalsForRange(query = {}) {
  const where = expenseDateFilter(query);
  const aggregates = await prisma.expense.groupBy({
    by: ['categoryId'],
    where,
    _sum: { amount: true },
  });

  const categoryIds = aggregates.map((a) => a.categoryId);
  const categories = categoryIds.length
    ? await prisma.expenseCategory.findMany({
        where: { id: { in: categoryIds } },
        select: { id: true, name: true },
      })
    : [];
  const catMap = Object.fromEntries(categories.map((c) => [c.id, c.name]));

  let total = D(0);
  const byCategory = {};
  for (const row of aggregates) {
    const amt = D(row._sum.amount || 0);
    total = total.plus(amt);
    byCategory[catMap[row.categoryId] || 'Unknown'] = amt;
  }

  return { total, byCategory };
}

module.exports = {
  listCategories,
  createCategory,
  updateCategory,
  archiveCategory,
  listExpenses,
  getExpense,
  createExpense,
  updateExpense,
  deleteExpense,
  expenseTotalsForRange,
  expenseDateFilter,
};

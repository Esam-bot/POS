const prisma = require('../../config/db');
const AppError = require('../../utils/AppError');
const { serializeDecimals } = require('../../utils/decimal');
const {
  toDateOnlyString,
  todayDateOnly,
  advanceDueDate,
  anchorDayFromStart,
  compareDateOnly,
} = require('./expenseDates');

const recurringInclude = {
  category: { select: { id: true, name: true } },
  method: { select: { id: true, code: true, name: true } },
  createdBy: { select: { id: true, name: true } },
  updatedBy: { select: { id: true, name: true } },
};

function mapRecurring(row) {
  return serializeDecimals({
    id: row.id,
    title: row.title,
    description: row.description,
    amount: row.amount,
    frequency: row.frequency,
    status: row.status,
    startDate: row.startDate,
    nextDueDate: row.nextDueDate,
    endDate: row.endDate,
    anchorDay: row.anchorDay,
    categoryId: row.categoryId,
    methodId: row.methodId,
    createdById: row.createdById,
    updatedById: row.updatedById,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    category: row.category
      ? { id: row.category.id, name: row.category.name }
      : null,
    method: row.method
      ? { id: row.method.id, code: row.method.code, name: row.method.name }
      : null,
    createdBy: row.createdBy
      ? { id: row.createdBy.id, name: row.createdBy.name }
      : null,
    updatedBy: row.updatedBy
      ? { id: row.updatedBy.id, name: row.updatedBy.name }
      : null,
  });
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

function validateEndDate(startDate, endDate) {
  if (!endDate) return;
  if (compareDateOnly(endDate, startDate) < 0) {
    throw new AppError('End date must not be earlier than start date', 400);
  }
}

async function listRecurring(query = {}) {
  const where = {};
  if (query.status) where.status = query.status;
  if (query.categoryId) where.categoryId = query.categoryId;
  const search = String(query.search || '').trim();
  if (search) {
    where.OR = [
      { title: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
    ];
  }

  const items = await prisma.recurringExpense.findMany({
    where,
    include: recurringInclude,
    orderBy: [{ status: 'asc' }, { nextDueDate: 'asc' }, { title: 'asc' }],
  });

  return items.map(mapRecurring);
}

async function getRecurring(id) {
  const row = await prisma.recurringExpense.findUnique({
    where: { id },
    include: recurringInclude,
  });
  if (!row) throw new AppError('Recurring expense not found', 404);
  return mapRecurring(row);
}

async function createRecurring(body, userId) {
  await assertCategory(body.categoryId);
  await assertMethod(body.methodId || null);
  validateEndDate(body.startDate, body.endDate || null);

  const startDate = toDateOnlyString(body.startDate);
  const endDate = body.endDate ? toDateOnlyString(body.endDate) : null;
  const nextDueDate = body.nextDueDate
    ? toDateOnlyString(body.nextDueDate)
    : startDate;
  const anchorDay = anchorDayFromStart(startDate);

  const row = await prisma.recurringExpense.create({
    data: {
      title: body.title,
      description: body.description || null,
      categoryId: body.categoryId,
      methodId: body.methodId || null,
      amount: body.amount,
      frequency: body.frequency,
      status: 'ACTIVE',
      startDate: new Date(startDate),
      anchorDay,
      nextDueDate: new Date(nextDueDate),
      endDate: endDate ? new Date(endDate) : null,
      createdById: userId,
    },
    include: recurringInclude,
  });

  // Catch up any due periods immediately (e.g. start date in the past)
  await generateDueForSchedule(row.id);

  return getRecurring(row.id);
}

async function updateRecurring(id, body, userId) {
  const existing = await prisma.recurringExpense.findUnique({ where: { id } });
  if (!existing) throw new AppError('Recurring expense not found', 404);

  if (body.categoryId) await assertCategory(body.categoryId);
  if (body.methodId !== undefined) await assertMethod(body.methodId || null);

  const startDate = body.startDate
    ? toDateOnlyString(body.startDate)
    : toDateOnlyString(existing.startDate);
  const endDate =
    body.endDate !== undefined
      ? body.endDate
        ? toDateOnlyString(body.endDate)
        : null
      : toDateOnlyString(existing.endDate);
  validateEndDate(startDate, endDate);

  const data = { updatedById: userId };
  if (body.title !== undefined) data.title = body.title;
  if (body.description !== undefined) data.description = body.description || null;
  if (body.categoryId !== undefined) data.categoryId = body.categoryId;
  if (body.methodId !== undefined) data.methodId = body.methodId || null;
  if (body.amount !== undefined) data.amount = body.amount;
  if (body.frequency !== undefined) data.frequency = body.frequency;
  if (body.startDate !== undefined) {
    data.startDate = new Date(startDate);
    data.anchorDay = anchorDayFromStart(startDate);
  }
  if (body.endDate !== undefined) {
    data.endDate = endDate ? new Date(endDate) : null;
  }
  if (body.nextDueDate !== undefined) {
    data.nextDueDate = new Date(toDateOnlyString(body.nextDueDate));
  }

  await prisma.recurringExpense.update({ where: { id }, data });

  // Edits affect future generation only; catch up if still active and due
  if (existing.status === 'ACTIVE' || data.status === 'ACTIVE') {
    await generateDueForSchedule(id);
  }

  return getRecurring(id);
}

async function setStatus(id, status, userId) {
  const existing = await prisma.recurringExpense.findUnique({ where: { id } });
  if (!existing) throw new AppError('Recurring expense not found', 404);

  const data = { status, updatedById: userId };

  if (status === 'ACTIVE' && existing.status !== 'ACTIVE') {
    // Resume: if nextDueDate is in the past, generation will catch up missed periods
    // If nextDueDate is somehow after endDate, leave it — generateDue will no-op
  }

  await prisma.recurringExpense.update({ where: { id }, data });

  if (status === 'ACTIVE') {
    await generateDueForSchedule(id);
  }

  return getRecurring(id);
}

async function pauseRecurring(id, userId) {
  return setStatus(id, 'PAUSED', userId);
}

async function resumeRecurring(id, userId) {
  return setStatus(id, 'ACTIVE', userId);
}

async function deactivateRecurring(id, userId) {
  return setStatus(id, 'INACTIVE', userId);
}

/**
 * Generate expense rows for one schedule up through today (inclusive),
 * advancing nextDueDate. Idempotent via unique(recurringExpenseId, billingPeriod).
 */
async function generateDueForSchedule(scheduleId, { asOf = todayDateOnly() } = {}) {
  const today = toDateOnlyString(asOf);
  let generated = 0;
  const maxIterations = 120; // safety: up to 10 years monthly

  for (let i = 0; i < maxIterations; i += 1) {
    const schedule = await prisma.recurringExpense.findUnique({
      where: { id: scheduleId },
    });
    if (!schedule || schedule.status !== 'ACTIVE') break;

    const nextDue = toDateOnlyString(schedule.nextDueDate);
    const endDate = schedule.endDate ? toDateOnlyString(schedule.endDate) : null;

    if (endDate && compareDateOnly(nextDue, endDate) > 0) {
      // Past configured end — stop future generation
      if (schedule.status === 'ACTIVE') {
        await prisma.recurringExpense.update({
          where: { id: schedule.id },
          data: { status: 'INACTIVE' },
        });
      }
      break;
    }

    if (compareDateOnly(nextDue, today) > 0) break;

    const billingPeriod = nextDue;
    const advanced = advanceDueDate(nextDue, schedule.frequency, schedule.anchorDay);

    try {
      await prisma.$transaction(async (tx) => {
        // Re-check lock-ish: skip if already generated
        const existing = await tx.expense.findFirst({
          where: {
            recurringExpenseId: schedule.id,
            billingPeriod,
          },
          select: { id: true },
        });

        if (!existing) {
          await tx.expense.create({
            data: {
              title: schedule.title,
              description: schedule.description,
              amount: schedule.amount,
              categoryId: schedule.categoryId,
              methodId: schedule.methodId,
              expenseDate: new Date(nextDue),
              recurringExpenseId: schedule.id,
              billingPeriod,
              paymentStatus: 'UNPAID',
              recordedById: schedule.createdById,
            },
          });
          generated += 1;
        }

        // Always advance nextDueDate past this period (even if expense already existed)
        await tx.recurringExpense.update({
          where: { id: schedule.id },
          data: { nextDueDate: new Date(advanced) },
        });
      });
    } catch (err) {
      // Unique race: another worker created the same period — still advance
      if (err?.code === 'P2002') {
        await prisma.recurringExpense.update({
          where: { id: schedule.id },
          data: { nextDueDate: new Date(advanced) },
        });
        continue;
      }
      throw err;
    }
  }

  return { scheduleId, generated };
}

/**
 * Process all ACTIVE schedules that are due on or before today.
 * Safe to call repeatedly; DB uniqueness prevents duplicates.
 */
async function generateAllDueRecurringExpenses(options = {}) {
  const today = toDateOnlyString(options.asOf || todayDateOnly());
  const due = await prisma.recurringExpense.findMany({
    where: {
      status: 'ACTIVE',
      nextDueDate: { lte: new Date(today) },
    },
    select: { id: true },
    take: 100,
    orderBy: { nextDueDate: 'asc' },
  });

  let totalGenerated = 0;
  for (const row of due) {
    const result = await generateDueForSchedule(row.id, { asOf: today });
    totalGenerated += result.generated;
  }

  return { schedulesProcessed: due.length, generated: totalGenerated };
}

module.exports = {
  listRecurring,
  getRecurring,
  createRecurring,
  updateRecurring,
  pauseRecurring,
  resumeRecurring,
  deactivateRecurring,
  generateDueForSchedule,
  generateAllDueRecurringExpenses,
  mapRecurring,
};

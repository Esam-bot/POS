const prisma = require('../config/db');
const { emitEvent } = require('../sockets/emit');
const {
  generateAllDueRecurringExpenses,
} = require('../modules/expenses/recurring.service');

const DEFAULT_CLEANING_MINUTES = 2;
const RECURRING_EXPENSE_INTERVAL_MS = 60_000;
let lastRecurringExpenseRunAt = 0;

/**
 * Lightweight DB-backed poller:
 * 1) CLEANING tables whose delay elapsed → AVAILABLE
 * 2) Optional auto-READY when estimates elapse (only if settings.autoReadyOnEstimate)
 * 3) Delay alerts for overdue preparing kitchen items (always; does not mark READY)
 */
async function releaseDueCleaningTables(app) {
  const settings = await prisma.restaurantSettings.findFirst();
  const minutes = settings?.tableCleaningMinutes ?? DEFAULT_CLEANING_MINUTES;
  const cutoff = new Date(Date.now() - minutes * 60 * 1000);

  const due = await prisma.diningTable.findMany({
    where: {
      status: 'CLEANING',
      deletedAt: null,
      cleaningStartedAt: { lte: cutoff },
    },
    take: 50,
  });

  for (const table of due) {
    const updated = await prisma.diningTable.updateMany({
      where: {
        id: table.id,
        status: 'CLEANING',
        cleaningStartedAt: table.cleaningStartedAt,
      },
      data: { status: 'AVAILABLE', cleaningStartedAt: null },
    });
    if (!updated.count) continue;

    const fresh = await prisma.diningTable.findUnique({ where: { id: table.id } });
    emitEvent(app, 'table.status.updated', fresh);
  }
}

async function markDueOrdersReady(app) {
  const settings = await prisma.restaurantSettings.findFirst();
  if (!settings?.autoReadyOnEstimate) {
    return;
  }

  const now = new Date();
  const candidates = await prisma.order.findMany({
    where: {
      status: 'PREPARING',
      readyNotifiedAt: null,
      estimatedReadyAt: { lte: now },
    },
    include: {
      items: { where: { status: { not: 'CANCELLED' } } },
      diningTable: { select: { id: true, number: true, section: true } },
    },
    take: 50,
    orderBy: { estimatedReadyAt: 'asc' },
  });

  for (const order of candidates) {
    const result = await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRawUnsafe(
        `SELECT id, status, "readyNotifiedAt" FROM orders WHERE id = $1::uuid FOR UPDATE`,
        order.id
      );
      if (!locked.length) return null;
      if (locked[0].status !== 'PREPARING' || locked[0].readyNotifiedAt) return null;

      const items = await tx.orderItem.findMany({
        where: { orderId: order.id, status: { not: 'CANCELLED' } },
      });
      if (!items.length) return null;

      const allDue = items.every(
        (item) => item.prepCompletedAt || (item.estimatedReadyAt && item.estimatedReadyAt <= now)
      );
      if (!allDue) return null;

      await tx.orderItem.updateMany({
        where: {
          orderId: order.id,
          status: { not: 'CANCELLED' },
          prepCompletedAt: null,
        },
        data: { prepCompletedAt: now, status: 'READY' },
      });

      // Align kitchen ticket items when auto-ready is enabled
      const tickets = await tx.kitchenTicket.findMany({
        where: { orderId: order.id, status: { in: ['NEW', 'ACCEPTED', 'PREPARING'] } },
        select: { id: true },
      });
      for (const t of tickets) {
        await tx.kitchenTicketItem.updateMany({
          where: {
            ticketId: t.id,
            status: { in: ['NEW', 'ACCEPTED', 'PREPARING'] },
          },
          data: { status: 'READY', readyAt: now },
        });
        await tx.kitchenTicket.update({
          where: { id: t.id },
          data: { status: 'READY', readyAt: now },
        });
      }

      const updated = await tx.order.update({
        where: { id: order.id },
        data: {
          status: 'READY',
          readyNotifiedAt: now,
          statusHistory: {
            create: {
              fromStatus: 'PREPARING',
              toStatus: 'READY',
              reason: 'auto-ready: prep estimate elapsed (autoReadyOnEstimate=true)',
            },
          },
        },
        include: {
          diningTable: { select: { id: true, number: true, section: true } },
        },
      });

      return updated;
    });

    if (!result) continue;

    emitEvent(app, 'order.status.updated', result);
    emitEvent(app, 'order.ready', {
      orderId: result.id,
      orderNumber: result.orderNumber,
      type: result.type,
      customerName: result.customerName,
      table: result.diningTable?.number || null,
      tableSection: result.diningTable?.section || null,
      readyAt: result.readyNotifiedAt,
      message: result.diningTable?.number
        ? `Order ${result.orderNumber} for Table ${result.diningTable.number} is ready to serve!`
        : `Order ${result.orderNumber} (${result.type}) is ready!`,
    });
  }
}

/** Emit delay alerts for overdue preparing kitchen items — does NOT mark READY. */
async function emitPrepDelayAlerts(app) {
  const now = new Date();
  const items = await prisma.kitchenTicketItem.findMany({
    where: {
      status: { in: ['NEW', 'ACCEPTED', 'PREPARING'] },
      ticket: { status: { in: ['NEW', 'ACCEPTED', 'PREPARING'] } },
      orderItem: {
        OR: [
          { estimatedReadyAt: { lte: now } },
          {
            AND: [
              { estimatedReadyAt: null },
              { prepStartedAt: { not: null } },
            ],
          },
        ],
      },
    },
    include: {
      ticket: {
        select: {
          id: true,
          ticketNumber: true,
          stationId: true,
          order: { select: { orderNumber: true, type: true } },
        },
      },
      orderItem: {
        select: {
          nameSnapshot: true,
          estimatedReadyAt: true,
          prepStartedAt: true,
          prepTimeMinutesSnapshot: true,
        },
      },
    },
    take: 40,
  });

  for (const row of items) {
    const oi = row.orderItem;
    const mins = oi.prepTimeMinutesSnapshot ?? 5;
    const eta =
      oi.estimatedReadyAt ||
      (oi.prepStartedAt
        ? new Date(new Date(oi.prepStartedAt).getTime() + mins * 60 * 1000)
        : null);
    if (!eta || eta > now) continue;

    emitEvent(app, 'kitchen.prep.delayed', {
      ticketId: row.ticketId,
      ticketItemId: row.id,
      stationId: row.ticket.stationId,
      ticketNumber: row.ticket.ticketNumber,
      orderNumber: row.ticket.order?.orderNumber,
      orderType: row.ticket.order?.type,
      itemName: oi.nameSnapshot,
      estimatedReadyAt: eta,
      message: `${oi.nameSnapshot} on ${row.ticket.ticketNumber} is overdue`,
    });
  }
}

/**
 * DB-backed recurring expense generation.
 * Source of truth is nextDueDate on each schedule; the poller only discovers due rows.
 * Uniqueness on (recurringExpenseId, billingPeriod) prevents duplicates after downtime.
 */
async function processDueRecurringExpenses({ force = false } = {}) {
  const now = Date.now();
  if (!force && now - lastRecurringExpenseRunAt < RECURRING_EXPENSE_INTERVAL_MS) {
    return null;
  }
  lastRecurringExpenseRunAt = now;
  return generateAllDueRecurringExpenses();
}

function startOpsWorker(app, { intervalMs = 4000 } = {}) {
  if (process.env.NODE_ENV === 'test') return { stop() {} };

  let stopped = false;
  const tick = async () => {
    if (stopped) return;
    try {
      await releaseDueCleaningTables(app);
      await markDueOrdersReady(app);
      await emitPrepDelayAlerts(app);
      await processDueRecurringExpenses();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[opsWorker]', err.message);
    }
  };

  const handle = setInterval(tick, intervalMs);
  setTimeout(tick, 1500);
  // Immediate catch-up for missed billing periods after restart
  setTimeout(() => {
    processDueRecurringExpenses({ force: true }).catch((err) => {
      // eslint-disable-next-line no-console
      console.error('[opsWorker] recurring expenses', err.message);
    });
  }, 2500);

  return {
    stop() {
      stopped = true;
      clearInterval(handle);
    },
  };
}

module.exports = {
  startOpsWorker,
  releaseDueCleaningTables,
  markDueOrdersReady,
  emitPrepDelayAlerts,
  processDueRecurringExpenses,
};

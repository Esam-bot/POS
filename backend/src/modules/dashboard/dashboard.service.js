const prisma = require('../../config/db');
const { serializeDecimals } = require('../../utils/decimal');
const { D, money2 } = require('../../utils/moneyMath');

/**
 * Local calendar day bounds for a restaurant timezone.
 * Asia/Karachi is UTC+5 with no DST (project default).
 */
function dayBounds(timeZone = 'Asia/Karachi', forDay = null) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(forDay ? new Date(forDay) : new Date());
  const get = (type) => parts.find((p) => p.type === type)?.value;
  const ymd = `${get('year')}-${get('month')}-${get('day')}`;

  if (timeZone === 'Asia/Karachi' || timeZone === 'PKT') {
    return {
      from: new Date(`${ymd}T00:00:00.000+05:00`),
      to: new Date(`${ymd}T23:59:59.999+05:00`),
      day: ymd,
      timeZone: 'Asia/Karachi',
    };
  }

  return {
    from: new Date(`${ymd}T00:00:00.000Z`),
    to: new Date(`${ymd}T23:59:59.999Z`),
    day: ymd,
    timeZone,
  };
}

function lastNDays(timeZone, n) {
  const days = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i -= 1) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    days.push(dayBounds(timeZone, d));
  }
  return days;
}

async function netRevenueForRange(from, to) {
  const payments = await prisma.payment.findMany({
    where: {
      createdAt: { gte: from, lte: to },
      status: { in: ['COMPLETED', 'PARTIALLY_REFUNDED', 'REFUNDED'] },
    },
    include: {
      refunds: {
        where: { createdAt: { gte: from, lte: to } },
        select: { amount: true },
      },
    },
  });
  let revenue = D(0);
  for (const p of payments) {
    const refunded = (p.refunds || []).reduce((a, r) => a.plus(r.amount || 0), D(0));
    const net = D(p.amount || 0).minus(refunded);
    revenue = revenue.plus(net.lt(0) ? D(0) : net);
  }
  return money2(revenue);
}

async function getOverview() {
  const restaurant = await prisma.restaurant.findFirst({
    where: { isActive: true, deletedAt: null },
    include: { settings: true },
  });
  const timeZone = restaurant?.settings?.timezone || 'Asia/Karachi';
  const { from, to, day } = dayBounds(timeZone);
  const todayRange = { gte: from, lte: to };
  const weekDays = lastNDays(timeZone, 7);
  const weekFrom = weekDays[0].from;

  const [
    revenue,
    totalOrders,
    completedOrders,
    activeOrders,
    cancelledOrders,
    pendingKitchenOrders,
    inventoryItemCount,
    lowStockCount,
    recentOrders,
    statusGroups,
    orderItems,
  ] = await Promise.all([
    netRevenueForRange(from, to),
    prisma.order.count({
      where: { createdAt: todayRange, status: { notIn: ['DRAFT', 'CANCELLED'] } },
    }),
    prisma.order.count({
      where: { status: 'COMPLETED', updatedAt: todayRange },
    }),
    prisma.order.count({
      where: {
        status: { notIn: ['DRAFT', 'COMPLETED', 'CANCELLED'] },
      },
    }),
    prisma.order.count({
      where: { status: 'CANCELLED', updatedAt: todayRange },
    }),
    prisma.kitchenTicket.count({
      where: { status: { in: ['NEW', 'ACCEPTED', 'PREPARING'] } },
    }),
    prisma.ingredient.count({ where: { deletedAt: null, isActive: true } }),
    prisma.$queryRaw`
      SELECT COUNT(*)::int AS count FROM ingredients
      WHERE "deletedAt" IS NULL AND "isActive" = true
        AND (
          "currentStock" <= 0
          OR ("minStock" > 0 AND "currentStock" <= "minStock")
        )
    `.then((rows) => Number(rows[0]?.count || 0)),
    prisma.order.findMany({
      where: { status: { not: 'DRAFT' } },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        orderNumber: true,
        customerName: true,
        type: true,
        grandTotal: true,
        status: true,
        paymentStatus: true,
        createdAt: true,
      },
    }),
    prisma.order.groupBy({
      by: ['status'],
      where: {
        createdAt: { gte: weekFrom },
        status: { not: 'DRAFT' },
      },
      _count: { _all: true },
    }),
    prisma.orderItem.findMany({
      where: {
        createdAt: { gte: weekFrom },
        status: { not: 'CANCELLED' },
        order: { status: { notIn: ['DRAFT', 'CANCELLED'] } },
      },
      select: {
        quantity: true,
        nameSnapshot: true,
        menuItemId: true,
      },
      take: 2000,
    }),
  ]);

  const averageOrderValue =
    totalOrders > 0 ? money2(D(revenue).div(totalOrders)) : money2(0);

  const salesTrend = [];
  const ordersTrend = [];
  for (const d of weekDays) {
    const range = { gte: d.from, lte: d.to };
    const [dayRevenue, dayTotal, dayCompleted, dayCancelled] = await Promise.all([
      netRevenueForRange(d.from, d.to),
      prisma.order.count({
        where: { createdAt: range, status: { notIn: ['DRAFT'] } },
      }),
      prisma.order.count({
        where: { status: 'COMPLETED', updatedAt: range },
      }),
      prisma.order.count({
        where: { status: 'CANCELLED', updatedAt: range },
      }),
    ]);
    salesTrend.push({ date: d.day, revenue: dayRevenue });
    ordersTrend.push({
      date: d.day,
      total: dayTotal,
      completed: dayCompleted,
      cancelled: dayCancelled,
    });
  }

  const ordersByStatus = statusGroups.map((g) => ({
    status: g.status,
    count: g._count._all,
  }));

  const topMap = new Map();
  for (const line of orderItems) {
    const key = line.menuItemId || line.nameSnapshot || 'item';
    const prev = topMap.get(key) || { name: line.nameSnapshot || 'Item', quantity: 0 };
    prev.quantity += Number(line.quantity || 0);
    topMap.set(key, prev);
  }
  const topSellingItems = [...topMap.values()]
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 8);

  return serializeDecimals({
    revenue,
    totalOrders,
    averageOrderValue,
    pendingKitchenOrders,
    completedOrders,
    activeOrders,
    cancelledOrders,
    inventoryItemCount,
    lowStockCount,
    salesTrend,
    ordersTrend,
    ordersByStatus,
    topSellingItems,
    recentOrders,
    meta: {
      day,
      timeZone,
      from: from.toISOString(),
      to: to.toISOString(),
      rangeDays: 7,
    },
  });
}

module.exports = { getOverview, dayBounds };

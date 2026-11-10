const path = require('path');
const request = require('supertest');
const crypto = require('crypto');

process.env.NODE_ENV = 'test';
require('dotenv').config({ path: path.join(__dirname, '../../../../.env') });
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL =
    'postgresql://pos:pos_secret@127.0.0.1:5433/restaurant_pos?schema=public';
}

const app = require('../../../app');
const prisma = require('../../../config/db');
const { emitEvent } = require('../../../sockets/emit');
const { emitAutoReleaseEvents } = require('../../../sockets/emitAutoRelease');

jest.mock('../../../sockets/emit', () => ({
  emitEvent: jest.fn(),
  getIo: jest.fn(),
}));

async function login(username, password) {
  const res = await request(app).post('/api/auth/login').send({ username, password });
  return res.body.data.token;
}

function key(prefix = 'ar') {
  return `${prefix}-${crypto.randomUUID()}`;
}

describe('Auto-release dine-in tables on settlement', () => {
  let adminToken;
  let restaurantId;
  let menuItemId;
  let cashId;
  const suffix = Date.now();

  beforeAll(async () => {
    adminToken = await login('admin', 'Admin@123');
    const restaurant = await prisma.restaurant.findFirst({ where: { isActive: true } });
    restaurantId = restaurant.id;

    await prisma.restaurantSettings.updateMany({
      data: {
        autoReleaseTableOnPayment: true,
        useCleaningStatus: false,
        allowPartialPayments: true,
      },
    });

    const station = await prisma.kitchenStation.findFirst({ where: { isActive: true } });
    const category = await prisma.menuCategory.create({
      data: { name: `AR Cat ${suffix}`, isActive: true },
    });
    const item = await prisma.menuItem.create({
      data: {
        categoryId: category.id,
        kitchenStationId: station.id,
        name: `AR Dish ${suffix}`,
        sku: `AR-${suffix}`,
        basePrice: 500,
        isActive: true,
        isAvailable: true,
      },
    });
    menuItemId = item.id;

    const cash = await prisma.paymentMethod.findFirst({ where: { code: 'CASH' } });
    cashId = cash.id;
  });

  afterAll(async () => {
    await prisma.restaurantSettings.updateMany({
      data: { autoReleaseTableOnPayment: true, useCleaningStatus: false },
    });
    await prisma.$disconnect();
  });

  beforeEach(() => {
    emitEvent.mockClear();
  });

  async function openDineInOrder({ tableNumber, qty = 1 }) {
    const table = await request(app)
      .post('/api/tables')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        number: tableNumber,
        capacity: 4,
        section: 'AutoRelease',
      });
    expect(table.status).toBe(201);

    const session = await request(app)
      .post('/api/table-sessions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ tableIds: [table.body.data.id] });
    expect(session.status).toBe(201);

    const order = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        type: 'DINE_IN',
        tableSessionId: session.body.data.id,
        diningTableId: table.body.data.id,
        customerName: 'Auto Guest',
        customerPhone: '03001110000',
        items: [{ menuItemId, quantity: qty }],
      });
    expect(order.status).toBe(201);

    const submit = await request(app)
      .post(`/api/orders/${order.body.data.id}/submit`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(submit.status).toBe(200);

    return {
      tableId: table.body.data.id,
      sessionId: session.body.data.id,
      orderId: order.body.data.id,
    };
  }

  async function payFull(orderId, idem) {
    const quote = await request(app)
      .post(`/api/orders/${orderId}/payment-quote`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});
    const outstanding = Number(quote.body.data.outstandingPreTax);
    return request(app)
      .post(`/api/orders/${orderId}/payments`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Idempotency-Key', idem)
      .send({
        portions: [{ methodId: cashId, preTaxAmount: outstanding, amountTendered: outstanding * 2 }],
      });
  }

  it('single order fully paid -> session CLOSED, order COMPLETED, table AVAILABLE', async () => {
    const ctx = await openDineInOrder({ tableNumber: `AR-S-${suffix}` });
    const pay = await payFull(ctx.orderId, key('single'));
    expect(pay.status).toBe(201);
    expect(pay.body.data.autoRelease.released).toBe(true);

    const order = await prisma.order.findUnique({ where: { id: ctx.orderId } });
    const session = await prisma.tableSession.findUnique({ where: { id: ctx.sessionId } });
    const table = await prisma.diningTable.findUnique({ where: { id: ctx.tableId } });

    expect(order.status).toBe('COMPLETED');
    expect(order.paymentStatus).toBe('PAID');
    expect(session.status).toBe('CLOSED');
    expect(table.status).toBe('AVAILABLE');
  });

  it('split bills: pay one of two -> nothing; pay second -> released', async () => {
    const table = await request(app)
      .post('/api/tables')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ number: `AR-SP-${suffix}`, capacity: 4, section: 'AutoRelease' });
    const session = await request(app)
      .post('/api/table-sessions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ tableIds: [table.body.data.id] });

    const makeOrder = async () => {
      const order = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          type: 'DINE_IN',
          tableSessionId: session.body.data.id,
          diningTableId: table.body.data.id,
          customerName: 'Split Guest',
          customerPhone: '03002220000',
          items: [{ menuItemId, quantity: 1 }],
        });
      await request(app)
        .post(`/api/orders/${order.body.data.id}/submit`)
        .set('Authorization', `Bearer ${adminToken}`);
      return order.body.data.id;
    };

    const orderA = await makeOrder();
    const orderB = await makeOrder();

    const first = await payFull(orderA, key('split-a'));
    expect(first.status).toBe(201);
    expect(first.body.data.autoRelease.released).toBe(false);

    let sessionRow = await prisma.tableSession.findUnique({ where: { id: session.body.data.id } });
    let tableRow = await prisma.diningTable.findUnique({ where: { id: table.body.data.id } });
    expect(sessionRow.status).toBe('OPEN');
    expect(tableRow.status).toBe('OCCUPIED');

    const second = await payFull(orderB, key('split-b'));
    expect(second.status).toBe(201);
    expect(second.body.data.autoRelease.released).toBe(true);

    sessionRow = await prisma.tableSession.findUnique({ where: { id: session.body.data.id } });
    tableRow = await prisma.diningTable.findUnique({ where: { id: table.body.data.id } });
    expect(sessionRow.status).toBe('CLOSED');
    expect(tableRow.status).toBe('AVAILABLE');
  });

  it('partial payment -> nothing released', async () => {
    const ctx = await openDineInOrder({ tableNumber: `AR-P-${suffix}` });
    const quote = await request(app)
      .post(`/api/orders/${ctx.orderId}/payment-quote`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});
    const outstanding = Number(quote.body.data.outstandingPreTax);
    const half = Math.floor(outstanding / 2);

    const pay = await request(app)
      .post(`/api/orders/${ctx.orderId}/payments`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Idempotency-Key', key('partial'))
      .send({
        // Omit amountTendered so billing defaults it to tax-inclusive gross
        portions: [{ methodId: cashId, preTaxAmount: half }],
      });
    expect(pay.status).toBe(201);
    expect(pay.body.data.autoRelease.released).toBe(false);

    const session = await prisma.tableSession.findUnique({ where: { id: ctx.sessionId } });
    const table = await prisma.diningTable.findUnique({ where: { id: ctx.tableId } });
    expect(session.status).toBe('OPEN');
    expect(table.status).toBe('OCCUPIED');
  });

  it('cancelled order only -> released', async () => {
    const ctx = await openDineInOrder({ tableNumber: `AR-C-${suffix}` });
    const cancel = await request(app)
      .post(`/api/orders/${ctx.orderId}/cancel`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'Guest left before kitchen started' });
    expect(cancel.status).toBe(200);
    expect(cancel.body.data.autoRelease.released).toBe(true);

    const session = await prisma.tableSession.findUnique({ where: { id: ctx.sessionId } });
    const table = await prisma.diningTable.findUnique({ where: { id: ctx.tableId } });
    expect(session.status).toBe('CLOSED');
    expect(table.status).toBe('AVAILABLE');
  });

  it('complimentary settlement -> released', async () => {
    const ctx = await openDineInOrder({ tableNumber: `AR-COMP-${suffix}` });
    const settle = await request(app)
      .post(`/api/orders/${ctx.orderId}/settle`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'COMPLIMENTARY', reason: 'Manager comp for delay' });
    expect(settle.status).toBe(200);
    expect(settle.body.data.autoRelease.released).toBe(true);

    const order = await prisma.order.findUnique({ where: { id: ctx.orderId } });
    const session = await prisma.tableSession.findUnique({ where: { id: ctx.sessionId } });
    const table = await prisma.diningTable.findUnique({ where: { id: ctx.tableId } });
    expect(order.status).toBe('COMPLETED');
    expect(order.paymentStatus).toBe('COMPLIMENTARY');
    expect(session.status).toBe('CLOSED');
    expect(table.status).toBe('AVAILABLE');
  });

  it('useCleaningStatus true -> tables become CLEANING', async () => {
    await prisma.restaurantSettings.updateMany({ data: { useCleaningStatus: true } });
    try {
      const ctx = await openDineInOrder({ tableNumber: `AR-CL-${suffix}` });
      const pay = await payFull(ctx.orderId, key('cleaning'));
      expect(pay.status).toBe(201);
      expect(pay.body.data.autoRelease.released).toBe(true);
      const table = await prisma.diningTable.findUnique({ where: { id: ctx.tableId } });
      expect(table.status).toBe('CLEANING');
    } finally {
      await prisma.restaurantSettings.updateMany({ data: { useCleaningStatus: false } });
    }
  });

  it('autoReleaseTableOnPayment false -> no change from manual flow', async () => {
    await prisma.restaurantSettings.updateMany({
      data: { autoReleaseTableOnPayment: false },
    });
    try {
      const ctx = await openDineInOrder({ tableNumber: `AR-OFF-${suffix}` });
      const pay = await payFull(ctx.orderId, key('off'));
      expect(pay.status).toBe(201);
      expect(pay.body.data.autoRelease.released).toBe(false);

      const order = await prisma.order.findUnique({ where: { id: ctx.orderId } });
      const session = await prisma.tableSession.findUnique({ where: { id: ctx.sessionId } });
      const table = await prisma.diningTable.findUnique({ where: { id: ctx.tableId } });
      expect(order.status).toBe('PLACED');
      expect(order.paymentStatus).toBe('PAID');
      expect(session.status).toBe('OPEN');
      expect(table.status).toBe('OCCUPIED');
    } finally {
      await prisma.restaurantSettings.updateMany({
        data: { autoReleaseTableOnPayment: true },
      });
    }
  });

  it('two simultaneous final payments close session exactly once', async () => {
    const table = await request(app)
      .post('/api/tables')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ number: `AR-RACE-${suffix}`, capacity: 4, section: 'AutoRelease' });
    const session = await request(app)
      .post('/api/table-sessions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ tableIds: [table.body.data.id] });

    const makeOrder = async () => {
      const order = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          type: 'DINE_IN',
          tableSessionId: session.body.data.id,
          diningTableId: table.body.data.id,
          customerName: 'Race Guest',
          customerPhone: '03003330000',
          items: [{ menuItemId, quantity: 1 }],
        });
      await request(app)
        .post(`/api/orders/${order.body.data.id}/submit`)
        .set('Authorization', `Bearer ${adminToken}`);
      return order.body.data.id;
    };

    const orderA = await makeOrder();
    const orderB = await makeOrder();

    const [payA, payB] = await Promise.all([
      payFull(orderA, key('race-a')),
      payFull(orderB, key('race-b')),
    ]);
    expect(payA.status).toBe(201);
    expect(payB.status).toBe(201);

    const releasedCount = [payA, payB].filter((r) => r.body.data.autoRelease?.released).length;
    expect(releasedCount).toBe(1);

    const sessionRow = await prisma.tableSession.findUnique({
      where: { id: session.body.data.id },
    });
    const tableRow = await prisma.diningTable.findUnique({
      where: { id: table.body.data.id },
    });
    expect(sessionRow.status).toBe('CLOSED');
    expect(tableRow.status).toBe('AVAILABLE');

    const audits = await prisma.auditLog.count({
      where: {
        entityType: 'TableSession',
        entityId: session.body.data.id,
        action: 'SESSION_AUTO_RELEASE',
      },
    });
    expect(audits).toBe(1);
  });

  it('does not emit Socket.IO events when auto-release did not run', () => {
    emitAutoReleaseEvents({ app: {} }, { released: false });
    expect(emitEvent).not.toHaveBeenCalled();
  });

  it('emits session/table/order events only after successful release payload', () => {
    emitAutoReleaseEvents(
      { app: {} },
      {
        released: true,
        session: { id: 'sess-1', status: 'CLOSED' },
        tables: [{ id: 'tbl-1', status: 'AVAILABLE' }],
        completedOrders: [{ id: 'ord-1', status: 'COMPLETED' }],
      }
    );
    expect(emitEvent).toHaveBeenCalledWith(
      expect.anything(),
      'session.closed',
      expect.objectContaining({ id: 'sess-1' })
    );
    expect(emitEvent).toHaveBeenCalledWith(
      expect.anything(),
      'table.status.updated',
      expect.objectContaining({ id: 'tbl-1' })
    );
    expect(emitEvent).toHaveBeenCalledWith(
      expect.anything(),
      'order.status.updated',
      expect.objectContaining({ id: 'ord-1' })
    );
  });

  it('empty DRAFT does not block release of paid sibling order', async () => {
    const table = await request(app)
      .post('/api/tables')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ number: `AR-DR-${suffix}`, capacity: 4, section: 'AutoRelease' });
    const session = await request(app)
      .post('/api/table-sessions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ tableIds: [table.body.data.id] });

    const paid = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        type: 'DINE_IN',
        tableSessionId: session.body.data.id,
        diningTableId: table.body.data.id,
        customerName: 'Draft Guest',
        customerPhone: '03004440000',
        items: [{ menuItemId, quantity: 1 }],
      });
    await request(app)
      .post(`/api/orders/${paid.body.data.id}/submit`)
      .set('Authorization', `Bearer ${adminToken}`);

    // Empty draft sibling (no items) created directly
    await prisma.order.create({
      data: {
        orderNumber: `DRAFT-AR-${suffix}`,
        type: 'DINE_IN',
        status: 'DRAFT',
        paymentStatus: 'UNPAID',
        tableSessionId: session.body.data.id,
        diningTableId: table.body.data.id,
        createdById: (await prisma.user.findFirst({ where: { username: 'admin' } })).id,
        customerName: 'Draft Guest',
        customerPhone: '03004440000',
        subtotal: 0,
        grandTotal: 0,
      },
    });

    const pay = await payFull(paid.body.data.id, key('draft-ignore'));
    expect(pay.status).toBe(201);
    expect(pay.body.data.autoRelease.released).toBe(true);

    const sessionRow = await prisma.tableSession.findUnique({
      where: { id: session.body.data.id },
    });
    expect(sessionRow.status).toBe('CLOSED');
  });
});

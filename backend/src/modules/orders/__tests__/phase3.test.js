const path = require('path');
const request = require('supertest');

process.env.NODE_ENV = 'test';
require('dotenv').config({ path: path.join(__dirname, '../../../../.env') });
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL =
    'postgresql://pos:pos_secret@127.0.0.1:5433/restaurant_pos?schema=public';
}

const app = require('../../../app');
const prisma = require('../../../config/db');

async function login(username, password) {
  const res = await request(app).post('/api/auth/login').send({ username, password });
  return res.body.data.token;
}

describe('Phase 3 — orders + tables + prep timers', () => {
  let adminToken;
  let menuItemId;
  let variantId;
  let modifierId;
  let cashId;
  let restaurantId;
  let tableId;
  let sessionId;
  const suffix = Date.now();

  beforeAll(async () => {
    adminToken = await login('admin', 'Admin@123');

    const restaurant = await prisma.restaurant.findFirst({ where: { isActive: true } });
    restaurantId = restaurant.id;

    const station = await prisma.kitchenStation.findFirst({ where: { isActive: true } });
    const category = await prisma.menuCategory.create({
      data: { name: `P3 Cat ${suffix}`, isActive: true },
    });
    const group = await prisma.modifierGroup.create({
      data: {
        name: `Extras ${suffix}`,
        selectionType: 'MULTI',
        minSelect: 0,
        maxSelect: 3,
        modifiers: { create: { name: 'Cheese', priceDelta: 50 } },
      },
      include: { modifiers: true },
    });
    modifierId = group.modifiers[0].id;

    const item = await prisma.menuItem.create({
      data: {
        categoryId: category.id,
        kitchenStationId: station.id,
        name: `Test Burger ${suffix}`,
        sku: `P3-${suffix}`,
        basePrice: 500,
        prepTimeMinutes: 1,
        isActive: true,
        isAvailable: true,
        variants: { create: { name: 'Double', price: 700, isActive: true } },
        modifierGroups: { create: { modifierGroupId: group.id } },
      },
      include: { variants: true },
    });
    menuItemId = item.id;
    variantId = item.variants[0].id;

    const cash = await prisma.paymentMethod.findFirst({ where: { code: 'CASH' } });
    cashId = cash.id;

    const table = await prisma.diningTable.create({
      data: {
        restaurantId,
        number: `P3-T-${suffix}`,
        capacity: 4,
        section: 'Ground Floor',
        status: 'AVAILABLE',
        isActive: true,
      },
    });
    tableId = table.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function openSession() {
    const res = await request(app)
      .post('/api/table-sessions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ tableIds: [tableId] });
    expect(res.status).toBe(201);
    sessionId = res.body.data.id;
    return res.body.data;
  }

  it('exposes tables and table-sessions routes', async () => {
    const tables = await request(app)
      .get('/api/tables')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(tables.status).toBe(200);
    expect(Array.isArray(tables.body.data.items)).toBe(true);

    const sessions = await request(app)
      .get('/api/table-sessions')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(sessions.status).toBe(200);
  });

  it('requires a table session for dine-in and creates takeaway/delivery', async () => {
    const missing = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        type: 'DINE_IN',
        customerName: 'Walk-in Guest',
        customerPhone: '03001234567',
        items: [{ menuItemId, quantity: 1 }],
      });
    expect(missing.status).toBe(400);

    await openSession();

    const dineIn = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        type: 'DINE_IN',
        tableSessionId: sessionId,
        diningTableId: tableId,
        customerName: 'Walk-in Guest',
        customerPhone: '03001234567',
        items: [{ menuItemId, quantity: 1 }],
      });
    expect(dineIn.status).toBe(201);
    expect(dineIn.body.data.type).toBe('DINE_IN');
    expect(dineIn.body.data.tableSessionId).toBe(sessionId);
    expect(dineIn.body.data.diningTableId).toBe(tableId);

    const takeaway = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        type: 'TAKEAWAY',
        customerName: 'Walk-in Guest',
        customerPhone: '03001234567',
        items: [
          {
            menuItemId,
            variantId,
            quantity: 1,
            modifiers: [{ modifierId }],
          },
        ],
      });
    expect(takeaway.status).toBe(201);
    expect(Number(takeaway.body.data.grandTotal)).toBe(750);

    const delivery = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        type: 'DELIVERY',
        customerName: 'Walk-in Guest',
        customerPhone: '03001234567',
        deliveryFee: 100,
        deliveryAddressSnapshot: {
          name: 'Walk-in Guest',
          phone: '03001234567',
          line1: 'Street 1',
          city: 'Karachi',
        },
        items: [{ menuItemId, quantity: 1 }],
      });
    expect(delivery.status).toBe(201);
    expect(Number(delivery.body.data.grandTotal)).toBe(600);
  });

  it('submit starts PREPARING with prep timers; payment does not COMPLETE food', async () => {
    const order = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        type: 'TAKEAWAY',
        customerName: 'Walk-in Guest',
        customerPhone: '03001234567',
        items: [{ menuItemId, quantity: 1 }],
      });
    const submit = await request(app)
      .post(`/api/orders/${order.body.data.id}/submit`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(submit.status).toBe(200);
    expect(submit.body.data.status).toBe('PREPARING');
    expect(submit.body.data.estimatedReadyAt).toBeTruthy();
    expect(submit.body.data.items[0].prepTimeMinutesSnapshot).toBe(1);

    const quote = await request(app)
      .post(`/api/orders/${order.body.data.id}/payment-quote`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});
    const outstanding = Number(quote.body.data.outstandingPreTax);

    const pay = await request(app)
      .post(`/api/orders/${order.body.data.id}/payments`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Idempotency-Key', `p3-pay-${suffix}`)
      .send({
        portions: [
          { methodId: cashId, preTaxAmount: outstanding, amountTendered: outstanding + 100 },
        ],
      });
    expect(pay.status).toBe(201);
    expect(pay.body.data.orderCompleted).toBeFalsy();

    const fresh = await prisma.order.findUnique({ where: { id: order.body.data.id } });
    expect(fresh.status).toBe('PREPARING');
    expect(fresh.paymentStatus).toBe('PAID');

    // Items cannot be added after preparation / inventory deduction
    const add = await request(app)
      .post(`/api/orders/${order.body.data.id}/items`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ items: [{ menuItemId, quantity: 1 }] });
    expect(add.status).toBe(409);
  });

  it('cancels a preparing order with a reason', async () => {
    if (!sessionId) await openSession();
    const order = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        type: 'DINE_IN',
        tableSessionId: sessionId,
        diningTableId: tableId,
        customerName: 'Walk-in Guest',
        customerPhone: '03001234567',
        items: [{ menuItemId, quantity: 1 }],
      });
    await request(app)
      .post(`/api/orders/${order.body.data.id}/submit`)
      .set('Authorization', `Bearer ${adminToken}`);

    const cancel = await request(app)
      .post(`/api/orders/${order.body.data.id}/cancel`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'Guest changed mind' });
    expect(cancel.status).toBe(200);
    expect(cancel.body.data.status).toBe('CANCELLED');
  });

  it('splits items and keeps the table session on the new order', async () => {
    if (!sessionId) await openSession();
    const order = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        type: 'DINE_IN',
        tableSessionId: sessionId,
        diningTableId: tableId,
        customerName: 'Split Guest',
        customerPhone: '03007654321',
        items: [{ menuItemId, quantity: 2 }],
      });
    expect(order.status).toBe(201);
    const itemId = order.body.data.items[0].id;

    const split = await request(app)
      .post(`/api/orders/${order.body.data.id}/split`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ items: [{ orderItemId: itemId, quantity: 1 }] });
    expect(split.status).toBe(200);
    expect(split.body.data.splitOrder.customerName).toBe('Split Guest');
    expect(split.body.data.splitOrder.type).toBe('DINE_IN');
    expect(split.body.data.splitOrder.tableSessionId).toBe(sessionId);
    expect(Number(split.body.data.source.items[0].quantity)).toBe(1);
  });

  it('closes session into CLEANING and keeps kitchen tickets after payment', async () => {
    const kitchenService = require('../../kitchen/kitchen.service');

    const order = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        type: 'TAKEAWAY',
        customerName: 'Kitchen Guest',
        customerPhone: '03001112233',
        items: [{ menuItemId, quantity: 1 }],
      });
    const orderId = order.body.data.id;
    await request(app)
      .post(`/api/orders/${orderId}/submit`)
      .set('Authorization', `Bearer ${adminToken}`);

    const tickets = await prisma.$transaction((tx) =>
      kitchenService.createTicketsForOrder(tx, orderId)
    );
    expect(tickets.length).toBeGreaterThan(0);
    const ticketId = tickets[0].id;

    const quote = await request(app)
      .post(`/api/orders/${orderId}/payment-quote`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});
    const outstanding = Number(quote.body.data.outstandingPreTax);
    const pay = await request(app)
      .post(`/api/orders/${orderId}/payments`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Idempotency-Key', `p3-kitchen-${suffix}`)
      .send({
        portions: [
          {
            methodId: cashId,
            preTaxAmount: outstanding,
            amountTendered: outstanding * 2,
          },
        ],
      });
    expect(pay.status).toBe(201);

    const afterPay = await prisma.order.findUnique({ where: { id: orderId } });
    expect(afterPay.status).toBe('PREPARING');
    expect(afterPay.paymentStatus).toBe('PAID');

    const board = await kitchenService.listTickets({});
    expect(board.some((t) => t.id === ticketId)).toBe(true);

    const advanced = await kitchenService.updateTicketStatus(ticketId, 'PREPARING');
    expect(advanced.ticket.status).toBe('PREPARING');

    if (sessionId) {
      const close = await request(app)
        .post(`/api/table-sessions/${sessionId}/close`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(close.status).toBe(200);
      const table = await prisma.diningTable.findUnique({ where: { id: tableId } });
      expect(table.status).toBe('CLEANING');
      expect(table.cleaningStartedAt).toBeTruthy();
    }
  });
});

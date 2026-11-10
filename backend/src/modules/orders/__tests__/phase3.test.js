const path = require('path');
const request = require('supertest');
const bcrypt = require('bcrypt');

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

describe('Phase 3 — tables, sessions, orders', () => {
  let adminToken;
  let restaurantId;
  let categoryId;
  let stationId;
  let menuItemId;
  let variantId;
  let modifierId;
  let modifierGroupId;
  const suffix = Date.now();

  beforeAll(async () => {
    adminToken = await login('admin', 'Admin@123');

    const restaurant = await prisma.restaurant.findFirst({ where: { isActive: true } });
    restaurantId = restaurant.id;

    const station = await prisma.kitchenStation.findFirst({ where: { isActive: true } });
    stationId = station.id;

    const category = await prisma.menuCategory.create({
      data: { name: `P3 Cat ${suffix}`, isActive: true },
    });
    categoryId = category.id;

    const group = await prisma.modifierGroup.create({
      data: {
        name: `Extras ${suffix}`,
        selectionType: 'MULTI',
        minSelect: 0,
        maxSelect: 3,
        modifiers: {
          create: { name: 'Cheese', priceDelta: 50 },
        },
      },
      include: { modifiers: true },
    });
    modifierGroupId = group.id;
    modifierId = group.modifiers[0].id;

    const item = await prisma.menuItem.create({
      data: {
        categoryId,
        kitchenStationId: stationId,
        name: `Test Burger ${suffix}`,
        sku: `P3-${suffix}`,
        basePrice: 500,
        isActive: true,
        isAvailable: true,
        variants: {
          create: { name: 'Double', price: 700, isActive: true },
        },
        modifierGroups: {
          create: { modifierGroupId },
        },
      },
      include: { variants: true },
    });
    menuItemId = item.id;
    variantId = item.variants[0].id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('creates tables and blocks duplicate numbers', async () => {
    const create = await request(app)
      .post('/api/tables')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ number: `P3-${suffix}-A`, capacity: 4, section: 'Test' });
    expect(create.status).toBe(201);

    const dup = await request(app)
      .post('/api/tables')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ number: `p3-${suffix}-a`, capacity: 2 });
    expect(dup.status).toBe(409);

    const badCap = await request(app)
      .post('/api/tables')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ number: `P3-${suffix}-B`, capacity: 0 });
    expect(badCap.status).toBe(422);
  });

  it('opens session with concurrency safety and blocks occupied→available', async () => {
    const t1 = await request(app)
      .post('/api/tables')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ number: `P3-${suffix}-S1`, capacity: 4 });
    const t2 = await request(app)
      .post('/api/tables')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ number: `P3-${suffix}-S2`, capacity: 4 });

    const session = await request(app)
      .post('/api/table-sessions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ tableIds: [t1.body.data.id, t2.body.data.id], guestCount: 3 });
    expect(session.status).toBe(201);
    expect(session.body.data.tables).toHaveLength(2);

    const conflict = await request(app)
      .post('/api/table-sessions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ tableIds: [t1.body.data.id] });
    expect(conflict.status).toBe(409);

    const markAvailable = await request(app)
      .patch(`/api/tables/${t1.body.data.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'AVAILABLE' });
    expect(markAvailable.status).toBe(409);

    const deactivate = await request(app)
      .patch(`/api/tables/${t1.body.data.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: false });
    expect(deactivate.status).toBe(409);
  });

  it('creates dine-in / takeaway / delivery orders with snapshots', async () => {
    const table = await request(app)
      .post('/api/tables')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ number: `P3-${suffix}-O1`, capacity: 4 });
    const session = await request(app)
      .post('/api/table-sessions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ tableIds: [table.body.data.id] });

    const dineIn = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        type: 'DINE_IN',
        customerName: 'Walk-in Guest', customerPhone: '03001234567',
        tableSessionId: session.body.data.id,
        items: [
          {
            menuItemId,
            variantId,
            quantity: 2,
            modifiers: [{ modifierId }],
          },
        ],
      });
    expect(dineIn.status).toBe(201);
    expect(dineIn.body.data.items[0].nameSnapshot).toContain('Test Burger');
    expect(dineIn.body.data.items[0].variantNameSnapshot).toBe('Double');
    expect(Number(dineIn.body.data.grandTotal)).toBe(1500);

    const takeaway = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        type: 'TAKEAWAY',
        customerName: 'Walk-in Guest', customerPhone: '03001234567',
        items: [{ menuItemId, quantity: 1 }],
      });
    expect(takeaway.status).toBe(201);

    const delivery = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        type: 'DELIVERY',
        customerName: 'Walk-in Guest', customerPhone: '03001234567',
        deliveryFee: 100,
        deliveryAddressSnapshot: {
          name: 'Ali',
          phone: '03001234567',
          line1: 'Street 1',
        },
        items: [{ menuItemId, quantity: 1 }],
      });
    expect(delivery.status).toBe(201);
    expect(Number(delivery.body.data.grandTotal)).toBe(600);
    expect(delivery.body.data.customerName).toBe('Walk-in Guest');
    expect(delivery.body.data.customerPhone).toBe('03001234567');
  });

  it('requires customer name and a valid phone number', async () => {
    const missingName = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        type: 'TAKEAWAY',
        customerPhone: '03001234567',
        items: [{ menuItemId, quantity: 1 }],
      });
    expect(missingName.status).toBe(422);

    const missingPhone = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        type: 'TAKEAWAY',
        customerName: 'Ali',
        items: [{ menuItemId, quantity: 1 }],
      });
    expect(missingPhone.status).toBe(422);

    const badPhone = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        type: 'TAKEAWAY',
        customerName: 'Ali',
        customerPhone: 'abc',
        items: [{ menuItemId, quantity: 1 }],
      });
    expect(badPhone.status).toBe(422);

    const ok = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        type: 'TAKEAWAY',
        customerName: 'Sara Khan',
        customerPhone: '0300-1234567',
        items: [{ menuItemId, quantity: 1 }],
      });
    expect(ok.status).toBe(201);
    expect(ok.body.data.customerName).toBe('Sara Khan');
    expect(ok.body.data.customerPhone).toBe('0300-1234567');
    expect(ok.body.data.customerId).toBeTruthy();

    const saved = await prisma.customer.findUnique({
      where: { phone: '0300-1234567' },
    });
    expect(saved).toBeTruthy();
    expect(saved.name).toBe('Sara Khan');

    const search = await request(app)
      .get('/api/customers/search')
      .query({ q: 'Sara' })
      .set('Authorization', `Bearer ${adminToken}`);
    expect(search.status).toBe(200);
    expect(search.body.data.items.some((c) => c.phone === '0300-1234567')).toBe(true);

    const again = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        type: 'TAKEAWAY',
        customerName: 'Sara K',
        customerPhone: '0300-1234567',
        items: [{ menuItemId, quantity: 1 }],
      });
    expect(again.status).toBe(201);
    expect(again.body.data.customerId).toBe(saved.id);
    const updated = await prisma.customer.findUnique({ where: { id: saved.id } });
    expect(updated.name).toBe('Sara K');
  });

  it('rejects unavailable items and invalid transitions', async () => {
    await prisma.menuItem.update({
      where: { id: menuItemId },
      data: { isAvailable: false },
    });

    const bad = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        type: 'TAKEAWAY',
        customerName: 'Walk-in Guest', customerPhone: '03001234567',
        items: [{ menuItemId, quantity: 1 }],
      });
    expect(bad.status).toBe(400);

    await prisma.menuItem.update({
      where: { id: menuItemId },
      data: { isAvailable: true },
    });

    const order = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        type: 'TAKEAWAY',
        customerName: 'Walk-in Guest', customerPhone: '03001234567',
        items: [{ menuItemId, quantity: 1 }],
      });

    const served = await request(app)
      .post(`/api/orders/${order.body.data.id}/transition`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'SERVED' });
    expect(served.status).toBe(409);

    await request(app)
      .post(`/api/orders/${order.body.data.id}/submit`)
      .set('Authorization', `Bearer ${adminToken}`);
    await request(app)
      .post(`/api/orders/${order.body.data.id}/transition`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'CONFIRMED' });
    await request(app)
      .post(`/api/orders/${order.body.data.id}/transition`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'PREPARING' });
    await request(app)
      .post(`/api/orders/${order.body.data.id}/transition`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'READY' });

    const unpaidComplete = await request(app)
      .post(`/api/orders/${order.body.data.id}/transition`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'COMPLETED' });
    expect(unpaidComplete.status).toBe(409);

    const cash = await prisma.paymentMethod.findFirst({ where: { code: 'CASH' } });
    const pay = await request(app)
      .post(`/api/orders/${order.body.data.id}/payments`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Idempotency-Key', `p3-complete-${suffix}`)
      .send({
        portions: [
          {
            methodId: cash.id,
            preTaxAmount: Number(order.body.data.grandTotal),
            amountTendered: Number(order.body.data.grandTotal) + 100,
          },
        ],
      });
    expect(pay.status).toBe(201);

    const complete = await request(app)
      .post(`/api/orders/${order.body.data.id}/transition`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'COMPLETED' });
    expect(complete.status).toBe(200);
  });

  it('supports multiple orders per session, split, cancel, and close rules', async () => {
    const table = await request(app)
      .post('/api/tables')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ number: `P3-${suffix}-M1`, capacity: 4 });
    const session = await request(app)
      .post('/api/table-sessions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ tableIds: [table.body.data.id] });
    const sessionId = session.body.data.id;

    const order1 = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        type: 'DINE_IN',
        customerName: 'Walk-in Guest', customerPhone: '03001234567',
        tableSessionId: sessionId,
        items: [{ menuItemId, quantity: 2 }],
      });
    const order2 = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        type: 'DINE_IN',
        customerName: 'Walk-in Guest', customerPhone: '03001234567',
        tableSessionId: sessionId,
        items: [{ menuItemId, quantity: 1 }],
      });
    expect(order1.status).toBe(201);
    expect(order2.status).toBe(201);

    const itemId = order1.body.data.items[0].id;
    const split = await request(app)
      .post(`/api/orders/${order1.body.data.id}/split`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ items: [{ orderItemId: itemId, quantity: 1 }] });
    expect(split.status).toBe(200);
    expect(split.body.data.splitOrder.tableSessionId).toBe(sessionId);

    const earlyClose = await request(app)
      .post(`/api/table-sessions/${sessionId}/close`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(earlyClose.status).toBe(409);

    const cancelIds = [
      order1.body.data.id,
      order2.body.data.id,
      split.body.data.splitOrder.id,
    ];
    let lastCancel;
    for (const orderId of cancelIds) {
      lastCancel = await request(app)
        .post(`/api/orders/${orderId}/cancel`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'Test cleanup' });
      expect(lastCancel.status).toBe(200);
    }
    // Last cancel auto-releases the session (default autoReleaseTableOnPayment)
    expect(lastCancel.body.data.autoRelease.released).toBe(true);

    const closedSession = await request(app)
      .get(`/api/table-sessions/${sessionId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(closedSession.body.data.status).toBe('CLOSED');

    const freed = await request(app)
      .get(`/api/tables/${table.body.data.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(freed.body.data.status).toBe('AVAILABLE');

    const close = await request(app)
      .post(`/api/table-sessions/${sessionId}/close`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(close.status).toBe(409);

    // CLEANING → AVAILABLE (audit only; no reason required)
    await prisma.diningTable.update({
      where: { id: table.body.data.id },
      data: { status: 'CLEANING' },
    });
    const available = await request(app)
      .patch(`/api/tables/${table.body.data.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'AVAILABLE' });
    expect(available.status).toBe(200);
  });

  it('transfers session tables', async () => {
    const from = await request(app)
      .post('/api/tables')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ number: `P3-${suffix}-X1`, capacity: 2 });
    const to = await request(app)
      .post('/api/tables')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ number: `P3-${suffix}-X2`, capacity: 2 });
    const session = await request(app)
      .post('/api/table-sessions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ tableIds: [from.body.data.id] });

    const transfer = await request(app)
      .post(`/api/table-sessions/${session.body.data.id}/transfer`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ fromTableId: from.body.data.id, toTableId: to.body.data.id });
    expect(transfer.status).toBe(200);
    expect(transfer.body.data.tables.some((t) => t.id === to.body.data.id)).toBe(true);
  });
});

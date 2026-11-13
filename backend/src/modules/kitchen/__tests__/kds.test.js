const path = require('path');
const request = require('supertest');

process.env.NODE_ENV = 'test';
require('dotenv').config({ path: path.join(__dirname, '../../../../.env') });
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const app = require('../../../app');
const prisma = require('../../../config/db');

async function login(username, password) {
  const res = await request(app).post('/api/auth/login').send({ username, password });
  return res.body.data.token;
}

describe('KDS — kitchen board & item workflow', () => {
  let adminToken;
  let grillId;
  let fryerId;
  let burgerId;
  let friesId;
  const suffix = Date.now();

  beforeAll(async () => {
    adminToken = await login('admin', 'Admin@123');

    const grill = await prisma.kitchenStation.findFirst({ where: { code: 'GRILL', deletedAt: null } });
    const fryer = await prisma.kitchenStation.findFirst({ where: { code: 'FRYER', deletedAt: null } });
    grillId = grill?.id;
    fryerId = fryer?.id;
    expect(grillId).toBeTruthy();
    expect(fryerId).toBeTruthy();

    let cat = await prisma.menuCategory.findFirst({ where: { name: 'Burgers', deletedAt: null } });
    if (!cat) {
      cat = await prisma.menuCategory.create({ data: { name: `KDS Cat ${suffix}`, isActive: true } });
    }

    const burger = await prisma.menuItem.create({
      data: {
        categoryId: cat.id,
        kitchenStationId: grillId,
        name: `KDS Burger ${suffix}`,
        sku: `KDS-B-${suffix}`,
        basePrice: 500,
        prepTimeMinutes: 8,
        isActive: true,
        isAvailable: true,
      },
    });
    const fries = await prisma.menuItem.create({
      data: {
        categoryId: cat.id,
        kitchenStationId: fryerId,
        name: `KDS Fries ${suffix}`,
        sku: `KDS-F-${suffix}`,
        basePrice: 200,
        prepTimeMinutes: 5,
        isActive: true,
        isAvailable: true,
      },
    });
    burgerId = burger.id;
    friesId = fries.id;

    // Ensure auto-ready stays off for these tests
    await prisma.restaurantSettings.updateMany({ data: { autoReadyOnEstimate: false } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('does not put DRAFT orders on the kitchen board', async () => {
    const created = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        type: 'TAKEAWAY',
        customerName: 'KDS Draft Guest',
        items: [{ menuItemId: burgerId, quantity: 1 }],
      });
    expect(created.status).toBe(201);

    const board = await request(app)
      .get('/api/kitchen/board')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(board.status).toBe(200);
    const hit = (board.body.data || []).some((c) => c.orderId === created.body.data.id);
    expect(hit).toBe(false);
  });

  it('assigns sequential global order numbers', async () => {
    const a = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        type: 'TAKEAWAY',
        customerName: 'Seq A',
        items: [{ menuItemId: burgerId, quantity: 1 }],
      });
    const b = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        type: 'DELIVERY',
        customerName: 'Seq B',
        customerPhone: '03001234567',
        deliveryAddressSnapshot: { line1: 'Street 1', city: 'Test Area' },
        items: [{ menuItemId: friesId, quantity: 1 }],
      });
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(/^\d+$/.test(String(a.body.data.orderNumber))).toBe(true);
    expect(/^\d+$/.test(String(b.body.data.orderNumber))).toBe(true);
    expect(Number(b.body.data.orderNumber)).toBeGreaterThan(Number(a.body.data.orderNumber));
  });

  it('shows one board card per order with station groups; item READY → order READY', async () => {
    const created = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        type: 'TAKEAWAY',
        customerName: 'KDS Flow Guest',
        items: [
          { menuItemId: burgerId, quantity: 1 },
          { menuItemId: friesId, quantity: 1 },
        ],
      });
    expect(created.status).toBe(201);
    const orderId = created.body.data.id;

    const submitted = await request(app)
      .post(`/api/orders/${orderId}/submit`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});
    expect(submitted.status).toBe(200);
    expect(submitted.body.data.status).toBe('PREPARING');

    const boardAll = await request(app)
      .get('/api/kitchen/board')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(boardAll.status).toBe(200);
    const cards = (boardAll.body.data || []).filter((c) => c.orderId === orderId);
    expect(cards.length).toBe(1);
    expect(cards[0].stations.length).toBeGreaterThanOrEqual(2);
    expect(cards[0].items.length).toBe(2);

    const grillBoard = await request(app)
      .get('/api/kitchen/board')
      .query({ stationId: grillId })
      .set('Authorization', `Bearer ${adminToken}`);
    const grillCards = (grillBoard.body.data || []).filter((c) => c.orderId === orderId);
    expect(grillCards.length).toBe(1);
    expect(grillCards[0].stations.every((s) => s.stationId === grillId)).toBe(true);
    expect(grillCards[0].stations.length).toBe(1);

    const fryerBoard = await request(app)
      .get('/api/kitchen/board')
      .query({ stationId: fryerId })
      .set('Authorization', `Bearer ${adminToken}`);
    const fryerCards = (fryerBoard.body.data || []).filter((c) => c.orderId === orderId);
    expect(fryerCards.length).toBe(1);
    expect(fryerCards[0].stations[0].stationId).toBe(fryerId);

    const allItems = cards[0].items;
    expect(allItems.length).toBe(2);

    const first = allItems[0];
    const start1 = await request(app)
      .patch(`/api/kitchen/items/${first.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'PREPARING' });
    expect(start1.status).toBe(200);

    const ready1 = await request(app)
      .patch(`/api/kitchen/items/${first.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'READY' });
    expect(ready1.status).toBe(200);
    expect(ready1.body.data.orderReady).toBeNull();

    const mid = await request(app)
      .get(`/api/orders/${orderId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(mid.body.data.status).toBe('PREPARING');

    const second = allItems[1];
    await request(app)
      .patch(`/api/kitchen/items/${second.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'PREPARING' });
    const ready2 = await request(app)
      .patch(`/api/kitchen/items/${second.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'READY' });
    expect(ready2.status).toBe(200);
    expect(ready2.body.data.orderReady).toBeTruthy();
    expect(ready2.body.data.orderReady.status).toBe('READY');

    const final = await request(app)
      .get(`/api/orders/${orderId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(final.body.data.status).toBe('READY');
    expect(final.body.data.paymentStatus).toBe('UNPAID');
  });
});

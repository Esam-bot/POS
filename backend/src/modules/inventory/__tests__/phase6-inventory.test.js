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
  if (!res.body?.data?.token) throw new Error(`Login failed: ${JSON.stringify(res.body)}`);
  return res.body.data.token;
}

describe('Phase 6 — Inventory Management', () => {
  let token;
  let categoryId;
  let unitId;
  let beefId;
  let bunId;
  let cheeseId;
  let menuItemId;
  let modifierId;
  let cashId;
  let stationId;
  const suffix = Date.now();

  beforeAll(async () => {
    token = await login('admin', 'Admin@123');
    const units = await prisma.unit.findMany();
    unitId = units.find((u) => u.code === 'G')?.id || units[0].id;
    const pcs = units.find((u) => u.code === 'PCS')?.id || units[0].id;
    stationId = (await prisma.kitchenStation.findFirst({ where: { isActive: true } })).id;
    cashId = (await prisma.paymentMethod.findFirst({ where: { isCash: true } })).id;

    const cat = await request(app)
      .post('/api/inventory/categories')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `Meat Test ${suffix}`, description: 'Test' });
    expect(cat.status).toBe(201);
    categoryId = cat.body.data.id;

    const beef = await request(app)
      .post('/api/inventory/items')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: `Beef ${suffix}`,
        categoryId,
        unitId,
        currentStock: 1000,
        minStock: 200,
        avgCost: 20,
      });
    expect(beef.status).toBe(201);
    beefId = beef.body.data.id;
    expect(beef.body.data.sku).toBeUndefined();

    const bun = await request(app)
      .post('/api/inventory/items')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: `Bun ${suffix}`,
        categoryId,
        unitId: pcs,
        currentStock: 50,
        minStock: 10,
        avgCost: 15,
      });
    bunId = bun.body.data.id;

    const cheese = await request(app)
      .post('/api/inventory/items')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: `Cheese ${suffix}`,
        categoryId,
        unitId,
        currentStock: 500,
        minStock: 50,
        avgCost: 10,
      });
    cheeseId = cheese.body.data.id;

    const menuCat = await prisma.menuCategory.create({
      data: { name: `Inv Menu ${suffix}`, isActive: true },
    });
    const group = await prisma.modifierGroup.create({
      data: {
        name: `Inv Extras ${suffix}`,
        selectionType: 'MULTI',
        minSelect: 0,
        maxSelect: 3,
        isRequired: false,
        isActive: true,
      },
    });
    const mod = await prisma.modifier.create({
      data: {
        groupId: group.id,
        name: 'Extra Cheese',
        priceDelta: 50,
        isActive: true,
      },
    });
    modifierId = mod.id;

    const item = await prisma.menuItem.create({
      data: {
        categoryId: menuCat.id,
        kitchenStationId: stationId,
        name: `Inv Burger ${suffix}`,
        sku: `INVB-${suffix}`,
        basePrice: 500,
        isActive: true,
        isAvailable: true,
        trackInventory: true,
        modifierGroups: { create: [{ modifierGroupId: group.id }] },
      },
    });
    menuItemId = item.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('prevents duplicate category names', async () => {
    const res = await request(app)
      .post('/api/inventory/categories')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `Meat Test ${suffix}` });
    expect(res.status).toBe(409);
  });

  it('adds stock and records movement history', async () => {
    const before = await prisma.ingredient.findUnique({ where: { id: beefId } });
    const add = await request(app)
      .post('/api/inventory/stock/add')
      .set('Authorization', `Bearer ${token}`)
      .send({ ingredientId: beefId, quantity: 100, unitCost: 22, notes: 'Delivery' });
    expect(add.status).toBe(201);
    expect(Number(add.body.data.item.currentStock)).toBe(Number(before.currentStock) + 100);
    expect(add.body.data.movement.typeLabel).toBe('Stock added');
    expect(Number(add.body.data.movement.stockBefore)).toBe(Number(before.currentStock));
  });

  it('adjusts stock with required reason', async () => {
    const adj = await request(app)
      .post('/api/inventory/stock/adjust')
      .set('Authorization', `Bearer ${token}`)
      .send({ ingredientId: bunId, newStock: 40, reason: 'Count correction' });
    expect(adj.status).toBe(200);
    expect(Number(adj.body.data.item.currentStock)).toBe(40);
  });

  it('records wastage and reduces stock', async () => {
    const waste = await request(app)
      .post('/api/inventory/stock/waste')
      .set('Authorization', `Bearer ${token}`)
      .send({ ingredientId: cheeseId, quantity: 50, reason: 'Expired' });
    expect(waste.status).toBe(201);
    expect(Number(waste.body.data.item.currentStock)).toBe(450);
    const hist = await request(app)
      .get('/api/inventory/movements')
      .set('Authorization', `Bearer ${token}`)
      .query({ ingredientId: cheeseId, type: 'WASTE' });
    expect(hist.body.data.items.length).toBeGreaterThan(0);
  });

  it('creates and updates recipes with ingredients', async () => {
    const recipe = await request(app)
      .post('/api/inventory/recipes')
      .set('Authorization', `Bearer ${token}`)
      .send({
        menuItemId,
        items: [
          { ingredientId: beefId, quantity: 150 },
          { ingredientId: bunId, quantity: 1 },
          { ingredientId: cheeseId, quantity: 30 },
        ],
      });
    expect(recipe.status).toBe(200);
    expect(recipe.body.data.items).toHaveLength(3);
    expect(recipe.body.data.menuItemName).toContain('Inv Burger');

    const modMap = await request(app)
      .put(`/api/inventory/modifiers/${modifierId}/ingredients`)
      .set('Authorization', `Bearer ${token}`)
      .send({ items: [{ ingredientId: cheeseId, quantity: 20 }] });
    expect(modMap.status).toBe(200);
    expect(modMap.body.data.items).toHaveLength(1);
  });

  async function placeAndPay({ withModifier = false, allowNegative = false, key }) {
    const create = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        type: 'TAKEAWAY',
        customerName: 'Walk-in Guest', customerPhone: '03001234567',
        items: [
          {
            menuItemId,
            quantity: 1,
            modifiers: withModifier ? [{ modifierId, quantity: 1 }] : [],
          },
        ],
      });
    expect(create.status).toBe(201);
    const orderId = create.body.data.id;
    await request(app)
      .post(`/api/orders/${orderId}/submit`)
      .set('Authorization', `Bearer ${token}`);

    const quote = await request(app)
      .post(`/api/orders/${orderId}/payment-quote`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    const outstanding = Number(quote.body.data.outstandingPreTax);

    const pay = await request(app)
      .post(`/api/orders/${orderId}/payments`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', key)
      .send({
        portions: [{ methodId: cashId, preTaxAmount: outstanding, amountTendered: outstanding * 2 }],
        allowNegativeStock: allowNegative || undefined,
      });
    return { orderId, pay, outstanding };
  }

  it('deducts recipe + modifier stock after successful payment once', async () => {
    const beefBefore = Number((await prisma.ingredient.findUnique({ where: { id: beefId } })).currentStock);
    const cheeseBefore = Number(
      (await prisma.ingredient.findUnique({ where: { id: cheeseId } })).currentStock
    );

    const { orderId, pay, outstanding } = await placeAndPay({
      withModifier: true,
      key: `inv-pay-${suffix}-1`,
    });
    expect(pay.status).toBe(201);

    const beefAfter = Number((await prisma.ingredient.findUnique({ where: { id: beefId } })).currentStock);
    const cheeseAfter = Number(
      (await prisma.ingredient.findUnique({ where: { id: cheeseId } })).currentStock
    );
    expect(beefAfter).toBeCloseTo(beefBefore - 150, 3);
    // base cheese 30 + extra cheese modifier 20
    expect(cheeseAfter).toBeCloseTo(cheeseBefore - 50, 3);

    const ledger = await prisma.orderInventoryDeduction.findUnique({ where: { orderId } });
    expect(ledger).toBeTruthy();

    // Idempotent retry with same key — no further deduction
    const replayPay = await request(app)
      .post(`/api/orders/${orderId}/payments`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', `inv-pay-${suffix}-1`)
      .send({
        portions: [
          { methodId: cashId, preTaxAmount: outstanding, amountTendered: outstanding * 2 },
        ],
      });
    expect(replayPay.status).toBe(200);
    expect(replayPay.body.data.replayed).toBe(true);

    const beefFinal = Number((await prisma.ingredient.findUnique({ where: { id: beefId } })).currentStock);
    expect(beefFinal).toBeCloseTo(beefAfter, 3);
    expect(await prisma.orderInventoryDeduction.count({ where: { orderId } })).toBe(1);
  });

  it('does not deduct stock when payment fails', async () => {
    const create = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        type: 'TAKEAWAY',
        customerName: 'Walk-in Guest', customerPhone: '03001234567',
        items: [{ menuItemId, quantity: 1, modifiers: [] }],
      });
    const orderId = create.body.data.id;
    await request(app)
      .post(`/api/orders/${orderId}/submit`)
      .set('Authorization', `Bearer ${token}`);

    const before = Number((await prisma.ingredient.findUnique({ where: { id: beefId } })).currentStock);
    const bad = await request(app)
      .post(`/api/orders/${orderId}/payments`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', `inv-fail-${suffix}`)
      .send({
        portions: [{ methodId: '00000000-0000-0000-0000-000000000000', preTaxAmount: 100 }],
      });
    expect(bad.status).toBeGreaterThanOrEqual(400);
    const after = Number((await prisma.ingredient.findUnique({ where: { id: beefId } })).currentStock);
    expect(after).toBe(before);
    expect(await prisma.orderInventoryDeduction.findUnique({ where: { orderId } })).toBeNull();
  });

  it('blocks payment when stock is insufficient unless override', async () => {
    // Drain buns almost empty
    await prisma.ingredient.update({ where: { id: bunId }, data: { currentStock: 0 } });

    const create = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        type: 'TAKEAWAY',
        customerName: 'Walk-in Guest', customerPhone: '03001234567',
        items: [{ menuItemId, quantity: 1, modifiers: [] }],
      });
    const orderId = create.body.data.id;
    await request(app)
      .post(`/api/orders/${orderId}/submit`)
      .set('Authorization', `Bearer ${token}`);
    const quote = await request(app)
      .post(`/api/orders/${orderId}/payment-quote`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    const outstanding = Number(quote.body.data.outstandingPreTax);

    const blocked = await request(app)
      .post(`/api/orders/${orderId}/payments`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', `inv-block-${suffix}`)
      .send({
        portions: [{ methodId: cashId, preTaxAmount: outstanding, amountTendered: outstanding * 2 }],
      });
    expect(blocked.status).toBe(422);
    expect(blocked.body.message).toMatch(/not enough stock/i);
    expect(await prisma.payment.count({ where: { orderId } })).toBe(0);

    const override = await request(app)
      .post(`/api/orders/${orderId}/payments`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', `inv-override-${suffix}`)
      .send({
        portions: [{ methodId: cashId, preTaxAmount: outstanding, amountTendered: outstanding * 2 }],
        allowNegativeStock: true,
      });
    expect(override.status).toBe(201);
    const bun = await prisma.ingredient.findUnique({ where: { id: bunId } });
    expect(Number(bun.currentStock)).toBeLessThan(0);
  });

  it('dashboard returns alerts without exposing sku', async () => {
    const dash = await request(app)
      .get('/api/inventory/dashboard')
      .set('Authorization', `Bearer ${token}`);
    expect(dash.status).toBe(200);
    expect(dash.body.data.totals.itemCount).toBeGreaterThan(0);
    const blob = JSON.stringify(dash.body.data);
    expect(blob).not.toMatch(/"sku"/i);
  });
});

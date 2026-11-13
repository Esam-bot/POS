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
  let kgId;
  let beefId;
  let bunId;
  let cheeseId;
  let menuItemId;
  let modifierId;
  let cashId;
  let stationId;
  let supplierId;
  const suffix = Date.now();

  beforeAll(async () => {
    token = await login('admin', 'Admin@123');
    const units = await prisma.unit.findMany();
    unitId = units.find((u) => u.code === 'G')?.id || units[0].id;
    kgId = units.find((u) => u.code === 'KG')?.id || unitId;
    const pcs = units.find((u) => u.code === 'PCS')?.id || units[0].id;
    stationId = (await prisma.kitchenStation.findFirst({ where: { isActive: true } })).id;
    cashId = (await prisma.paymentMethod.findFirst({ where: { isCash: true } })).id;

    const cat = await request(app)
      .post('/api/inventory/categories')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `Meat Test ${suffix}`, description: 'Test' });
    expect(cat.status).toBe(201);
    categoryId = cat.body.data.id;

    const supplier = await request(app)
      .post('/api/inventory/suppliers')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `Farm Co ${suffix}`, phone: '03001112233' });
    expect(supplier.status).toBe(201);
    supplierId = supplier.body.data.id;

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

    const group = await prisma.modifierGroup.create({
      data: {
        name: `Inv Mod ${suffix}`,
        selectionType: 'MULTI',
        minSelect: 0,
        maxSelect: 3,
        isRequired: false,
        isActive: true,
        modifiers: { create: { name: 'Extra Cheese', priceDelta: 40, isActive: true } },
      },
      include: { modifiers: true },
    });
    modifierId = group.modifiers[0].id;

    const category = await prisma.menuCategory.create({
      data: { name: `Inv Menu ${suffix}`, isActive: true },
    });
    const item = await prisma.menuItem.create({
      data: {
        categoryId: category.id,
        kitchenStationId: stationId,
        name: `Inv Burger ${suffix}`,
        sku: `INV-B-${suffix}`,
        basePrice: 500,
        trackInventory: true,
        isActive: true,
        isAvailable: true,
        modifierGroups: { create: [{ modifierGroupId: group.id }] },
      },
    });
    menuItemId = item.id;

    await request(app)
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

    await request(app)
      .put(`/api/inventory/modifiers/${modifierId}/ingredients`)
      .set('Authorization', `Bearer ${token}`)
      .send({ items: [{ ingredientId: cheeseId, quantity: 20 }] });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function createTrackedOrder({ withModifier = false } = {}) {
    const create = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        type: 'TAKEAWAY',
        customerName: 'Walk-in Guest',
        customerPhone: '03001234567',
        items: [
          {
            menuItemId,
            quantity: 1,
            modifiers: withModifier ? [{ modifierId, quantity: 1 }] : [],
          },
        ],
      });
    expect(create.status).toBe(201);
    return create.body.data.id;
  }

  it('converts purchase unit kg into ingredient grams on receive', async () => {
    const before = Number((await prisma.ingredient.findUnique({ where: { id: beefId } })).currentStock);
    const po = await request(app)
      .post('/api/inventory/purchases')
      .set('Authorization', `Bearer ${token}`)
      .send({
        supplierId,
        submit: true,
        items: [{ ingredientId: beefId, qtyOrdered: 1000, unitCost: 0.8 }],
      });
    expect(po.status).toBe(201);
    const lineId = po.body.data.items[0].id;

    const recv = await request(app)
      .post(`/api/inventory/purchases/${po.body.data.id}/receive`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        idempotencyKey: `kg-${suffix}`,
        items: [{ purchaseOrderItemId: lineId, qtyReceived: 1, unitId: kgId }],
      });
    expect(recv.status).toBe(200);
    const after = Number((await prisma.ingredient.findUnique({ where: { id: beefId } })).currentStock);
    // 1 kg input → 1000 g stock unit
    expect(after).toBeCloseTo(before + 1000, 2);
  });

  it('supports partial receive without double-applying idempotent key', async () => {
    const chicken = await request(app)
      .post('/api/inventory/items')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: `Chicken PO ${suffix}`,
        categoryId,
        unitId,
        currentStock: 0,
        minStock: 0,
        avgCost: 5,
      });
    const chickenId = chicken.body.data.id;
    const po = await request(app)
      .post('/api/inventory/purchases')
      .set('Authorization', `Bearer ${token}`)
      .send({
        supplierId,
        submit: true,
        items: [{ ingredientId: chickenId, qtyOrdered: 10, unitCost: 5 }],
      });
    const lineId = po.body.data.items[0].id;
    const first = await request(app)
      .post(`/api/inventory/purchases/${po.body.data.id}/receive`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        idempotencyKey: `partial-${suffix}`,
        items: [{ purchaseOrderItemId: lineId, qtyReceived: 6 }],
      });
    expect(first.status).toBe(200);
    expect(first.body.data.purchase.status).toBe('PARTIAL');

    const replay = await request(app)
      .post(`/api/inventory/purchases/${po.body.data.id}/receive`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        idempotencyKey: `partial-${suffix}`,
        items: [{ purchaseOrderItemId: lineId, qtyReceived: 6 }],
      });
    expect(replay.body.data.replayed).toBe(true);

    const second = await request(app)
      .post(`/api/inventory/purchases/${po.body.data.id}/receive`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        idempotencyKey: `partial2-${suffix}`,
        items: [{ purchaseOrderItemId: lineId, qtyReceived: 4 }],
      });
    expect(second.body.data.purchase.status).toBe('RECEIVED');
    const stock = Number((await prisma.ingredient.findUnique({ where: { id: chickenId } })).currentStock);
    expect(stock).toBeCloseTo(10, 3);
  });

  it('deducts recipe + modifier stock when order enters PREPARING (not on payment)', async () => {
    const beefBefore = Number((await prisma.ingredient.findUnique({ where: { id: beefId } })).currentStock);
    const cheeseBefore = Number(
      (await prisma.ingredient.findUnique({ where: { id: cheeseId } })).currentStock
    );

    const orderId = await createTrackedOrder({ withModifier: true });
    const submit = await request(app)
      .post(`/api/orders/${orderId}/submit`)
      .set('Authorization', `Bearer ${token}`);
    expect(submit.status).toBe(200);
    expect(submit.body.data.status).toBe('PREPARING');

    const beefAfter = Number((await prisma.ingredient.findUnique({ where: { id: beefId } })).currentStock);
    const cheeseAfter = Number(
      (await prisma.ingredient.findUnique({ where: { id: cheeseId } })).currentStock
    );
    expect(beefAfter).toBeCloseTo(beefBefore - 150, 3);
    expect(cheeseAfter).toBeCloseTo(cheeseBefore - 50, 3);
    expect(await prisma.orderInventoryDeduction.findUnique({ where: { orderId } })).toBeTruthy();

    const quote = await request(app)
      .post(`/api/orders/${orderId}/payment-quote`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    const outstanding = Number(quote.body.data.outstandingPreTax);
    const pay = await request(app)
      .post(`/api/orders/${orderId}/payments`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', `inv-pay-${suffix}-1`)
      .send({
        portions: [{ methodId: cashId, preTaxAmount: outstanding, amountTendered: outstanding * 2 }],
      });
    expect(pay.status).toBe(201);

    const beefFinal = Number((await prisma.ingredient.findUnique({ where: { id: beefId } })).currentStock);
    expect(beefFinal).toBeCloseTo(beefAfter, 3);
  });

  it('blocks PREPARING when stock is insufficient unless override', async () => {
    await prisma.ingredient.update({ where: { id: bunId }, data: { currentStock: 0 } });

    const orderId = await createTrackedOrder();
    const blocked = await request(app)
      .post(`/api/orders/${orderId}/submit`)
      .set('Authorization', `Bearer ${token}`);
    expect(blocked.status).toBe(422);
    expect(blocked.body.message).toMatch(/not enough stock/i);

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    expect(order.status).toBe('PLACED');
    expect(await prisma.orderInventoryDeduction.findUnique({ where: { orderId } })).toBeNull();

    const override = await request(app)
      .post(`/api/orders/${orderId}/transition`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'PREPARING', allowNegativeStock: true });
    expect(override.status).toBe(200);
    expect(override.body.data.status).toBe('PREPARING');
    const bun = await prisma.ingredient.findUnique({ where: { id: bunId } });
    expect(Number(bun.currentStock)).toBeLessThan(0);
  });

  it('records wastage once when cancelling after PREPARING (no restock)', async () => {
    await prisma.ingredient.update({ where: { id: bunId }, data: { currentStock: 20 } });
    const orderId = await createTrackedOrder();
    const submit = await request(app)
      .post(`/api/orders/${orderId}/submit`)
      .set('Authorization', `Bearer ${token}`);
    expect(submit.status).toBe(200);

    const beefAfterPrep = Number(
      (await prisma.ingredient.findUnique({ where: { id: beefId } })).currentStock
    );

    const cancel = await request(app)
      .post(`/api/orders/${orderId}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'Guest left after kitchen started' });
    expect(cancel.status).toBe(200);

    const beefAfterCancel = Number(
      (await prisma.ingredient.findUnique({ where: { id: beefId } })).currentStock
    );
    expect(beefAfterCancel).toBeCloseTo(beefAfterPrep, 3);

    const deduction = await prisma.orderInventoryDeduction.findUnique({ where: { orderId } });
    expect(deduction.wastageAt).toBeTruthy();
    const wasteCount = await prisma.wastageRecord.count({
      where: { reason: { contains: 'Guest left' } },
    });
    expect(wasteCount).toBeGreaterThan(0);
  });

  it('dashboard and reports work without exposing sku', async () => {
    const dash = await request(app)
      .get('/api/inventory/dashboard')
      .set('Authorization', `Bearer ${token}`);
    expect(dash.status).toBe(200);
    expect(dash.body.data.totals.itemCount).toBeGreaterThan(0);
    expect(JSON.stringify(dash.body.data)).not.toMatch(/"sku"/);

    const stock = await request(app)
      .get('/api/inventory/reports/stock')
      .set('Authorization', `Bearer ${token}`);
    expect(stock.status).toBe(200);
    expect(Array.isArray(stock.body.data.items)).toBe(true);
  });
});

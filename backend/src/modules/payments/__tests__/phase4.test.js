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

async function login(username, password) {
  const res = await request(app).post('/api/auth/login').send({ username, password });
  return res.body.data.token;
}

function key(prefix = 'idem') {
  return `${prefix}-${crypto.randomUUID()}`;
}

describe('Phase 4 — billing, payments, refunds', () => {
  let adminToken;
  let stationId;
  let menuItemId;
  let methods;
  const suffix = Date.now();

  beforeAll(async () => {
    adminToken = await login('admin', 'Admin@123');

    // Ensure tax rates seeded
    await prisma.paymentMethod.updateMany({ where: { code: 'CASH' }, data: { taxRate: 14, isActive: true } });
    await prisma.paymentMethod.updateMany({
      where: { code: { in: ['CARD', 'BANK_TRANSFER', 'EASYPAISA', 'JAZZCASH'] } },
      data: { taxRate: 8, isActive: true },
    });

    methods = await prisma.paymentMethod.findMany({ where: { deletedAt: null } });
    methods = Object.fromEntries(methods.map((m) => [m.code, m]));

    const station = await prisma.kitchenStation.findFirst({ where: { isActive: true } });
    stationId = station.id;

    const category = await prisma.menuCategory.create({
      data: { name: `P4 Cat ${suffix}`, isActive: true },
    });

    const item = await prisma.menuItem.create({
      data: {
        categoryId: category.id,
        kitchenStationId: stationId,
        name: `P4 Dish ${suffix}`,
        sku: `P4-${suffix}`,
        basePrice: 1000,
        isActive: true,
        isAvailable: true,
      },
    });
    menuItemId = item.id;

    await prisma.restaurantSettings.updateMany({
      data: { taxServiceCharge: false, taxDeliveryFee: false, allowPartialPayments: true },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function createTakeawayOrder(qty = 10) {
    const create = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        type: 'TAKEAWAY',
        customerName: 'Walk-in Guest', customerPhone: '03001234567',
        items: [{ menuItemId, quantity: qty }],
      });
    expect(create.status).toBe(201);
    const submit = await request(app)
      .post(`/api/orders/${create.body.data.id}/submit`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(submit.status).toBe(200);
    return create.body.data;
  }

  it('applies method-based tax rates and ignores order type', async () => {
    for (const type of ['TAKEAWAY', 'DELIVERY']) {
      let order;
      if (type === 'TAKEAWAY') {
        order = await createTakeawayOrder(10);
      } else {
        const created = await request(app)
          .post('/api/orders')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            type: 'DELIVERY',
        customerName: 'Walk-in Guest', customerPhone: '03001234567',
            deliveryFee: 0,
            deliveryAddressSnapshot: {
              name: 'Test',
              phone: '03001234567',
              line1: 'Street 1',
            },
            items: [{ menuItemId, quantity: 10 }],
          });
        expect(created.status).toBe(201);
        order = created.body.data;
        await request(app)
          .post(`/api/orders/${order.id}/submit`)
          .set('Authorization', `Bearer ${adminToken}`);
      }

      const quote = await request(app)
        .post(`/api/orders/${order.id}/payment-quote`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});
      expect(quote.status).toBe(200);
      expect(Number(quote.body.data.preTaxTotal)).toBe(10000);
      expect(Number(quote.body.data.allCash.tax)).toBe(1400);
      expect(Number(quote.body.data.allNonCash.tax)).toBe(800);
    }
  });

  it('calculates mixed payment tax correctly', async () => {
    const order = await createTakeawayOrder(10);
    const pay = await request(app)
      .post(`/api/orders/${order.id}/payments`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Idempotency-Key', key('mix'))
      .send({
        portions: [
          { methodId: methods.CASH.id, preTaxAmount: 5000, amountTendered: 5700 },
          { methodId: methods.CARD.id, preTaxAmount: 5000, reference: `CARD-${suffix}-mix` },
        ],
      });
    expect(pay.status).toBe(201);
    const payments = pay.body.data.payments;
    expect(payments).toHaveLength(2);
    const cash = payments.find((p) => p.methodId === methods.CASH.id);
    const card = payments.find((p) => p.methodId === methods.CARD.id);
    expect(Number(cash.taxAmount)).toBe(700);
    expect(Number(card.taxAmount)).toBe(400);
    expect(Number(cash.amount)).toBe(5700);
    expect(Number(card.amount)).toBe(5400);

    const refreshed = await request(app)
      .get(`/api/orders/${order.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(refreshed.body.data.paymentStatus).toBe('PAID');
  });

  it('keeps service charge and delivery fee non-taxable by default', async () => {
    const create = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        type: 'DELIVERY',
        customerName: 'Walk-in Guest', customerPhone: '03001234567',
        deliveryFee: 200,
        deliveryAddressSnapshot: {
          name: 'Test',
          phone: '03001234567',
          line1: 'Street 1',
        },
        items: [{ menuItemId, quantity: 1 }],
      });
    expect(create.status).toBe(201);
    await prisma.order.update({
      where: { id: create.body.data.id },
      data: { serviceCharge: 100, deliveryFee: 200 },
    });
    await request(app)
      .post(`/api/orders/${create.body.data.id}/submit`)
      .set('Authorization', `Bearer ${adminToken}`);

    const quote = await request(app)
      .post(`/api/orders/${create.body.data.id}/payment-quote`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});
    expect(Number(quote.body.data.taxableBase)).toBe(1000);
    expect(Number(quote.body.data.nonTaxable)).toBe(300);
    expect(Number(quote.body.data.allCash.tax)).toBe(140);
  });

  it('supports partial payments and rejects overpayment', async () => {
    const order = await createTakeawayOrder(10);

    const first = await request(app)
      .post(`/api/orders/${order.id}/payments`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Idempotency-Key', key('partial1'))
      .send({
        portions: [{ methodId: methods.CASH.id, preTaxAmount: 3000, amountTendered: 3500 }],
      });
    expect(first.status).toBe(201);
    expect(Number(first.body.data.payments[0].taxAmount)).toBe(420);
    expect(Number(first.body.data.payments[0].changeReturned)).toBe(
      Number(first.body.data.payments[0].amountTendered) - Number(first.body.data.payments[0].amount)
    );

    const mid = await request(app)
      .get(`/api/orders/${order.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(mid.body.data.paymentStatus).toBe('PARTIALLY_PAID');

    const second = await request(app)
      .post(`/api/orders/${order.id}/payments`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Idempotency-Key', key('partial2'))
      .send({
        portions: [
          { methodId: methods.CARD.id, preTaxAmount: 2000, reference: `CARD-${suffix}-p2` },
        ],
      });
    expect(second.status).toBe(201);
    expect(Number(second.body.data.payments[0].taxAmount)).toBe(160);

    const over = await request(app)
      .post(`/api/orders/${order.id}/payments`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Idempotency-Key', key('over'))
      .send({
        portions: [{ methodId: methods.CASH.id, preTaxAmount: 6000, amountTendered: 7000 }],
      });
    expect(over.status).toBe(400);
  });

  it('rejects inactive methods and preserves tax snapshots', async () => {
    const order = await createTakeawayOrder(1);
    await prisma.paymentMethod.update({
      where: { id: methods.JAZZCASH.id },
      data: { isActive: false },
    });

    const inactive = await request(app)
      .post(`/api/orders/${order.id}/payments`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Idempotency-Key', key('inactive'))
      .send({
        portions: [
          {
            methodId: methods.JAZZCASH.id,
            preTaxAmount: 1000,
            reference: `JZ-${suffix}`,
          },
        ],
      });
    expect(inactive.status).toBe(400);

    await prisma.paymentMethod.update({
      where: { id: methods.CARD.id },
      data: { taxRate: 20 },
    });

    const paid = await request(app)
      .post(`/api/orders/${order.id}/payments`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Idempotency-Key', key('snap'))
      .send({
        portions: [
          { methodId: methods.CARD.id, preTaxAmount: 1000, reference: `SNAP-${suffix}` },
        ],
      });
    expect(paid.status).toBe(201);
    expect(Number(paid.body.data.payments[0].taxRateSnapshot)).toBe(20);
    expect(Number(paid.body.data.payments[0].taxAmount)).toBe(200);

    await prisma.paymentMethod.update({
      where: { id: methods.CARD.id },
      data: { taxRate: 8 },
    });
    await prisma.paymentMethod.update({
      where: { id: methods.JAZZCASH.id },
      data: { isActive: true },
    });

    const getPay = await request(app)
      .get(`/api/payments/${paid.body.data.payments[0].id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(Number(getPay.body.data.taxRateSnapshot)).toBe(20);
  });

  it('enforces idempotency same/different payload', async () => {
    const order = await createTakeawayOrder(5);
    const idem = key('same');
    const body = {
      portions: [
        { methodId: methods.BANK_TRANSFER.id, preTaxAmount: 5000, reference: `BT-${suffix}-1` },
      ],
    };

    const a = await request(app)
      .post(`/api/orders/${order.id}/payments`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Idempotency-Key', idem)
      .send(body);
    expect(a.status).toBe(201);

    const b = await request(app)
      .post(`/api/orders/${order.id}/payments`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Idempotency-Key', idem)
      .send(body);
    expect(b.status).toBe(200);
    expect(b.body.data.replayed).toBe(true);
    expect(b.body.data.payments[0].id).toBe(a.body.data.payments[0].id);

    const c = await request(app)
      .post(`/api/orders/${order.id}/payments`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Idempotency-Key', idem)
      .send({
        portions: [
          { methodId: methods.EASYPAISA.id, preTaxAmount: 5000, reference: `EP-${suffix}-diff` },
        ],
      });
    expect(c.status).toBe(422);
  });

  it('handles concurrent duplicate payment requests without duplicates', async () => {
    const order = await createTakeawayOrder(2);
    const idem = key('conc');
    const body = {
      portions: [
        { methodId: methods.CASH.id, preTaxAmount: 2000, amountTendered: 2500 },
      ],
    };

    const [r1, r2] = await Promise.all([
      request(app)
        .post(`/api/orders/${order.id}/payments`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', idem)
        .send(body),
      request(app)
        .post(`/api/orders/${order.id}/payments`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', idem)
        .send(body),
    ]);

    expect([200, 201]).toContain(r1.status);
    expect([200, 201]).toContain(r2.status);
    expect(r1.body.data.payments[0].id).toBe(r2.body.data.payments[0].id);

    const list = await request(app)
      .get(`/api/orders/${order.id}/payments`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(list.body.data).toHaveLength(1);
  });

  it('keeps operational completion separate from settlement', async () => {
    const order = await createTakeawayOrder(1);

    const completeUnpaid = await request(app)
      .post(`/api/orders/${order.id}/transition`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'CONFIRMED' });
    expect(completeUnpaid.status).toBe(200);

    await request(app)
      .post(`/api/orders/${order.id}/transition`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'PREPARING' });
    await request(app)
      .post(`/api/orders/${order.id}/transition`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'READY' });

    const tryComplete = await request(app)
      .post(`/api/orders/${order.id}/transition`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'COMPLETED' });
    expect(tryComplete.status).toBe(409);

    await request(app)
      .post(`/api/orders/${order.id}/payments`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Idempotency-Key', key('settle-op'))
      .send({
        portions: [{ methodId: methods.CASH.id, preTaxAmount: 1000, amountTendered: 1200 }],
      });

    const done = await request(app)
      .post(`/api/orders/${order.id}/transition`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'COMPLETED' });
    expect(done.status).toBe(200);
    expect(done.body.data.status).toBe('COMPLETED');
    expect(done.body.data.paymentStatus).toBe('PAID');
  });

  it('supports complimentary authorization without tax', async () => {
    const order = await createTakeawayOrder(1);
    const settle = await request(app)
      .post(`/api/orders/${order.id}/settle`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'COMPLIMENTARY', reason: 'Manager guest courtesy' });
    expect(settle.status).toBe(200);
    expect(settle.body.data.paymentStatus).toBe('COMPLIMENTARY');

    const pay = await request(app)
      .post(`/api/orders/${order.id}/payments`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Idempotency-Key', key('comp-pay'))
      .send({
        portions: [{ methodId: methods.CASH.id, preTaxAmount: 1000, amountTendered: 1000 }],
      });
    expect(pay.status).toBe(409);
  });

  it('refunds proportionally, rejects over-refund, and keeps corrections out of sales reduction', async () => {
    const order = await createTakeawayOrder(10);
    const pay = await request(app)
      .post(`/api/orders/${order.id}/payments`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Idempotency-Key', key('ref-base'))
      .send({
        portions: [
          { methodId: methods.CARD.id, preTaxAmount: 10000, reference: `REF-${suffix}` },
        ],
      });
    const paymentId = pay.body.data.payments[0].id;
    expect(Number(pay.body.data.payments[0].taxAmount)).toBe(800);

    const partial = await request(app)
      .post(`/api/payments/${paymentId}/refunds`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Idempotency-Key', key('ref-partial'))
      .send({
        amount: 5400,
        type: 'PAYMENT_CORRECTION',
        reason: 'Wrong tender recorded',
      });
    expect(partial.status).toBe(201);
    expect(Number(partial.body.data.refund.preTaxAmount) + Number(partial.body.data.refund.taxAmount)).toBe(
      Number(partial.body.data.refund.amount)
    );

    const replay = await request(app)
      .post(`/api/payments/${paymentId}/refunds`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Idempotency-Key', partial.body.data.refund.idempotencyKey || key('x'))
      .send({
        amount: 5400,
        type: 'PAYMENT_CORRECTION',
        reason: 'Wrong tender recorded',
        idempotencyKey: partial.body.data.refund.idempotencyKey,
      });
    // Use same key explicitly
    const sameKey = key('ref-idem');
    const firstRefundKey = await request(app)
      .post(`/api/payments/${paymentId}/refunds`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Idempotency-Key', sameKey)
      .send({
        amount: 100,
        type: 'PAYMENT_CORRECTION',
        reason: 'Tiny correction',
      });
    const secondRefundKey = await request(app)
      .post(`/api/payments/${paymentId}/refunds`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Idempotency-Key', sameKey)
      .send({
        amount: 100,
        type: 'PAYMENT_CORRECTION',
        reason: 'Tiny correction',
      });
    expect(firstRefundKey.status).toBe(201);
    expect(secondRefundKey.status).toBe(200);
    expect(secondRefundKey.body.data.replayed).toBe(true);

    const over = await request(app)
      .post(`/api/payments/${paymentId}/refunds`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Idempotency-Key', key('ref-over'))
      .send({
        amount: 999999,
        type: 'SALES_RETURN',
        reason: 'Too much',
      });
    expect(over.status).toBe(400);

    // Fresh order for sales return reporting
    const order2 = await createTakeawayOrder(1);
    const pay2 = await request(app)
      .post(`/api/orders/${order2.id}/payments`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Idempotency-Key', key('sr-base'))
      .send({
        portions: [
          { methodId: methods.CASH.id, preTaxAmount: 1000, amountTendered: 1200 },
        ],
      });
    const salesReturn = await request(app)
      .post(`/api/payments/${pay2.body.data.payments[0].id}/refunds`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Idempotency-Key', key('sr'))
      .send({
        amount: Number(pay2.body.data.payments[0].amount),
        type: 'SALES_RETURN',
        reason: 'Customer returned meal',
      });
    expect(salesReturn.status).toBe(201);

    const report = await request(app)
      .get('/api/reports/financial')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(report.status).toBe(200);
    expect(Number(report.body.data.refunds.salesReturns)).toBeGreaterThan(0);
    expect(Number(report.body.data.refunds.paymentCorrections)).toBeGreaterThan(0);
    // Net sales formula present
    expect(report.body.data.sales.netSales).toBeDefined();

    void replay;
  });

  it('locks discount after first payment', async () => {
    const order = await createTakeawayOrder(10);
    const disc = await request(app)
      .post(`/api/orders/${order.id}/discount`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ type: 'FIXED', value: 500, reason: 'Promo' });
    expect(disc.status).toBe(200);

    await request(app)
      .post(`/api/orders/${order.id}/payments`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Idempotency-Key', key('disc-pay'))
      .send({
        portions: [{ methodId: methods.CASH.id, preTaxAmount: 1000, amountTendered: 1200 }],
      });

    const locked = await request(app)
      .post(`/api/orders/${order.id}/discount`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ type: 'FIXED', value: 100 });
    expect(locked.status).toBe(409);
  });

  it('creates printable receipt snapshot from backend records', async () => {
    const order = await createTakeawayOrder(1);
    await request(app)
      .post(`/api/orders/${order.id}/payments`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Idempotency-Key', key('rcpt'))
      .send({
        portions: [{ methodId: methods.CASH.id, preTaxAmount: 1000, amountTendered: 1200 }],
      });

    const receipt = await request(app)
      .post(`/api/orders/${order.id}/receipt`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(receipt.status).toBe(200);
    expect(receipt.body.data.snapshot.order.orderNumber).toBeTruthy();
    expect(receipt.body.data.snapshot.order.customerName).toBe('Walk-in Guest');
    expect(receipt.body.data.snapshot.order.customerPhone).toBe('03001234567');
    expect(receipt.body.data.snapshot.payments.length).toBeGreaterThan(0);
  });
});

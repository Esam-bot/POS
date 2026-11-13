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
  if (!res.body?.data?.token) {
    throw new Error(`Login failed: ${JSON.stringify(res.body)}`);
  }
  return res.body.data.token;
}

describe('Phase 5 — dual print after successful payment', () => {
  let adminToken;
  let menuItemId;
  let cashId;
  let cardId;
  let bankId;
  let easypaisaId;
  let jazzcashId;
  let stationId;
  const suffix = Date.now();

  beforeAll(async () => {
    adminToken = await login('admin', 'Admin@123');
    const station = await prisma.kitchenStation.findFirst({ where: { isActive: true } });
    stationId = station.id;

    const methods = await prisma.paymentMethod.findMany({ where: { isActive: true } });
    cashId = methods.find((m) => m.isCash).id;
    cardId = methods.find((m) => m.code === 'CARD').id;
    bankId = methods.find((m) => m.code === 'BANK_TRANSFER').id;
    easypaisaId = methods.find((m) => m.code === 'EASYPAISA').id;
    jazzcashId = methods.find((m) => m.code === 'JAZZCASH').id;

    const category = await prisma.menuCategory.create({
      data: { name: `PrintPay Cat ${suffix}`, isActive: true },
    });
    const group = await prisma.modifierGroup.create({
      data: {
        name: `PrintPay Extras ${suffix}`,
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
    global.__printModId = mod.id;

    const item = await prisma.menuItem.create({
      data: {
        categoryId: category.id,
        kitchenStationId: stationId,
        name: `PrintPay Burger ${suffix}`,
        sku: `PRTPAY-${suffix}`,
        basePrice: 500,
        isActive: true,
        isAvailable: true,
        modifierGroups: { create: [{ modifierGroupId: group.id }] },
      },
    });
    menuItemId = item.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function submitOrder(type = 'TAKEAWAY', extra = {}) {
    let dineInExtra = {};
    if (type === 'DINE_IN' && !extra.tableSessionId) {
      const restaurant = await prisma.restaurant.findFirst({ where: { isActive: true } });
      const table = await prisma.diningTable.create({
        data: {
          restaurantId: restaurant.id,
          number: `PRT-T-${suffix}-${Date.now()}`,
          capacity: 2,
          section: 'Ground Floor',
          status: 'AVAILABLE',
          isActive: true,
        },
      });
      const session = await request(app)
        .post('/api/table-sessions')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ tableIds: [table.id] });
      expect(session.status).toBe(201);
      dineInExtra = { tableSessionId: session.body.data.id, diningTableId: table.id };
    }

    const create = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        type,
        customerName: 'Print Guest',
        customerPhone: '03001112233',
        ...dineInExtra,
        ...extra,
        items: [
          {
            menuItemId,
            quantity: 2,
            modifiers: [{ modifierId: global.__printModId, quantity: 1 }],
            specialInstructions: 'No onion',
          },
        ],
      });
    expect(create.status).toBe(201);
    const submit = await request(app)
      .post(`/api/orders/${create.body.data.id}/submit`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(submit.status).toBe(200);
    expect(submit.body.data.printJobs || []).toHaveLength(0);
    expect(await prisma.printJob.count({ where: { orderId: create.body.data.id } })).toBe(0);
    return create.body.data.id;
  }

  async function pay(orderId, portions, key) {
    return request(app)
      .post(`/api/orders/${orderId}/payments`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Idempotency-Key', key)
      .send({ portions });
  }

  it('does not create print jobs on submit; creates them once after cash payment', async () => {
    const orderId = await submitOrder();
    const quote = await request(app)
      .post(`/api/orders/${orderId}/payment-quote`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});
    const outstanding = Number(quote.body.data.outstandingPreTax);

    const payRes = await pay(
      orderId,
      [{ methodId: cashId, preTaxAmount: outstanding, amountTendered: outstanding * 2 }],
      `print-cash-${suffix}-${orderId}`
    );
    expect(payRes.status).toBe(201);
    expect(payRes.body.data.initiatePrint).toBe(true);
    expect(payRes.body.data.printJobs).toHaveLength(3);

    const jobs = await prisma.printJob.findMany({ where: { orderId } });
    expect(jobs).toHaveLength(3);
    expect(jobs.map((j) => j.type).sort()).toEqual([
      'CASHIER_RECORD',
      'CUSTOMER_ORDER_SLIP',
      'KITCHEN_TICKET',
    ]);

    // Idempotent replay must not re-initiate auto print
    const replay = await pay(
      orderId,
      [{ methodId: cashId, preTaxAmount: outstanding, amountTendered: outstanding * 2 }],
      `print-cash-${suffix}-${orderId}`
    );
    expect(replay.status).toBe(200);
    expect(replay.body.data.replayed).toBe(true);
    expect(replay.body.data.initiatePrint).toBe(false);
    expect(await prisma.printJob.count({ where: { orderId } })).toBe(3);
  });

  it('creates slips for bank transfer, easypaisa, and jazzcash payments', async () => {
    for (const [code, methodId] of [
      ['BANK', bankId],
      ['EASY', easypaisaId],
      ['JAZZ', jazzcashId],
    ]) {
      const orderId = await submitOrder();
      const quote = await request(app)
        .post(`/api/orders/${orderId}/payment-quote`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});
      const outstanding = Number(quote.body.data.outstandingPreTax);
      const payRes = await pay(
        orderId,
        [{ methodId, preTaxAmount: outstanding, reference: `${code}-${suffix}-${orderId}` }],
        `print-${code.toLowerCase()}-${suffix}-${orderId}`
      );
      expect(payRes.status).toBe(201);
      expect(payRes.body.data.initiatePrint).toBe(true);
      expect(await prisma.printJob.count({ where: { orderId } })).toBe(3);
    }
  });

  it('creates slips for card payment and kitchen ticket has no financial fields', async () => {
    const orderId = await submitOrder();
    const quote = await request(app)
      .post(`/api/orders/${orderId}/payment-quote`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});
    const outstanding = Number(quote.body.data.outstandingPreTax);

    const payRes = await pay(
      orderId,
      [{ methodId: cardId, preTaxAmount: outstanding, reference: `CARD-${suffix}-${orderId}` }],
      `print-card-${suffix}-${orderId}`
    );
    expect(payRes.status).toBe(201);
    expect(payRes.body.data.initiatePrint).toBe(true);

    const kitchen = await request(app)
      .get(`/api/orders/${orderId}/print/kitchen-ticket`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(kitchen.status).toBe(200);
    const snap = kitchen.body.data.snapshot;
    expect(snap.items[0].modifiers[0].name).toBe('Extra Cheese');
    expect(JSON.stringify(snap)).not.toMatch(/subtotal|grandTotal|taxTotal|amountPaid/i);

    const customer = await request(app)
      .get(`/api/orders/${orderId}/print/customer-slip`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(customer.body.data.snapshot.order.paymentStatus).toBe('PAID');
    expect(Number(customer.body.data.snapshot.bill.amountPaidGross)).toBeGreaterThan(0);
    expect(customer.body.data.snapshot.order.customerName).toBe('Print Guest');
    expect(customer.body.data.snapshot.order.customerPhone).toBe('03001112233');
    expect(kitchen.body.data.snapshot.order.customerName).toBe('Print Guest');
    expect(kitchen.body.data.snapshot.order.customerPhone).toBeUndefined();
  });

  it('mixed payment initiates print once; second partial payment does not', async () => {
    const orderId = await submitOrder();
    const quote = await request(app)
      .post(`/api/orders/${orderId}/payment-quote`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});
    const outstanding = Number(quote.body.data.outstandingPreTax);
    const half = Math.floor(outstanding / 2);
    const rest = outstanding - half;

    const first = await pay(
      orderId,
      [
        { methodId: cashId, preTaxAmount: half, amountTendered: half * 2 },
        { methodId: cardId, preTaxAmount: rest, reference: `MIX-${suffix}-${orderId}` },
      ],
      `print-mix-${suffix}-${orderId}`
    );
    expect(first.status).toBe(201);
    expect(first.body.data.initiatePrint).toBe(true);
    expect(await prisma.printJob.count({ where: { orderId } })).toBe(3);
  });

  it('partial payment prints once; settling remainder does not auto-print again', async () => {
    const orderId = await submitOrder();
    const quote = await request(app)
      .post(`/api/orders/${orderId}/payment-quote`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});
    const outstanding = Number(quote.body.data.outstandingPreTax);
    const part = Math.floor(outstanding / 2);

    const first = await pay(
      orderId,
      [{ methodId: cardId, preTaxAmount: part, reference: `PART1-${suffix}-${orderId}` }],
      `print-part1-${suffix}-${orderId}`
    );
    expect(first.status).toBe(201);
    expect(first.body.data.initiatePrint).toBe(true);

    const customer = await request(app)
      .get(`/api/orders/${orderId}/print/customer-slip`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(customer.body.data.snapshot.order.paymentStatus).toBe('PARTIALLY_PAID');
    expect(Number(customer.body.data.snapshot.bill.remainingPreTax)).toBeGreaterThan(0);

    const remQuote = await request(app)
      .post(`/api/orders/${orderId}/payment-quote`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});
    const rem = Number(remQuote.body.data.outstandingPreTax);
    const second = await pay(
      orderId,
      [{ methodId: cashId, preTaxAmount: rem, amountTendered: rem * 2 }],
      `print-part2-${suffix}-${orderId}`
    );
    expect(second.status).toBe(201);
    expect(second.body.data.initiatePrint).toBe(false);
    expect(await prisma.printJob.count({ where: { orderId } })).toBe(3);
  });

  it('failed payment does not create print jobs', async () => {
    const orderId = await submitOrder();
    const bad = await pay(
      orderId,
      [{ methodId: '00000000-0000-0000-0000-000000000000', preTaxAmount: 100 }],
      `print-fail-${suffix}-${orderId}`
    );
    expect(bad.status).toBeGreaterThanOrEqual(400);
    expect(await prisma.printJob.count({ where: { orderId } })).toBe(0);
  });

  it('manual reprint increments count and marks reprint without new jobs', async () => {
    const orderId = await submitOrder();
    const quote = await request(app)
      .post(`/api/orders/${orderId}/payment-quote`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});
    const outstanding = Number(quote.body.data.outstandingPreTax);
    await pay(
      orderId,
      [{ methodId: cashId, preTaxAmount: outstanding, amountTendered: outstanding * 2 }],
      `print-reprint-${suffix}-${orderId}`
    );

    const first = await request(app)
      .post(`/api/orders/${orderId}/print/kitchen-ticket/printed`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});
    expect(first.body.data.printCount).toBe(1);
    expect(first.body.data.isReprint).toBe(false);

    const second = await request(app)
      .post(`/api/orders/${orderId}/print/kitchen-ticket/printed`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reprint: true });
    expect(second.body.data.printCount).toBe(2);
    expect(second.body.data.isReprint).toBe(true);
    expect(await prisma.printJob.count({ where: { orderId } })).toBe(3);
  });

  it('dine-in payment slips omit table; payment receipt still works', async () => {
    const orderId = await submitOrder('DINE_IN');

    const quote = await request(app)
      .post(`/api/orders/${orderId}/payment-quote`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});
    const outstanding = Number(quote.body.data.outstandingPreTax);
    const payRes = await pay(
      orderId,
      [{ methodId: cashId, preTaxAmount: outstanding, amountTendered: outstanding * 2 }],
      `print-dine-${suffix}-${orderId}`
    );
    expect(payRes.body.data.initiatePrint).toBe(true);

    const kitchen = await request(app)
      .get(`/api/orders/${orderId}/print/kitchen-ticket`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(kitchen.body.data.snapshot.order.table).toBeUndefined();
    expect(kitchen.body.data.snapshot.order.typeLabel).toBe('DINE IN');

    const receipt = await request(app)
      .post(`/api/orders/${orderId}/receipt`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(receipt.status).toBe(200);
    expect(receipt.body.data.receiptNumber).toBeTruthy();
    expect(receipt.body.data.snapshot.order.table).toBeUndefined();
  });
});

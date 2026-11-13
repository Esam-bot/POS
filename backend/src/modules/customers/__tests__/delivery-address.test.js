/**
 * Delivery address save + order snapshot isolation.
 * Creates minimal fixtures; does not rely on seeded menu catalog.
 */
const request = require('supertest');
const bcrypt = require('bcrypt');
const app = require('../../../app');
const prisma = require('../../../config/db');

describe('Delivery address management', () => {
  let adminToken;
  let menuItemId;
  const phone = `0300${String(Date.now()).slice(-7)}`;

  beforeAll(async () => {
    let admin = await prisma.user.findUnique({ where: { username: 'admin' } });
    if (!admin) {
      const hash = await bcrypt.hash('Admin@123', 10);
      admin = await prisma.user.create({
        data: { username: 'admin', name: 'Admin', passwordHash: hash, email: 'admin@test.local' },
      });
      const role = await prisma.role.findUnique({ where: { name: 'ADMIN' } });
      if (role) {
        await prisma.userRole.create({ data: { userId: admin.id, roleId: role.id } });
      }
    }

    const login = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'Admin@123' });
    adminToken = login.body.data.token;

    let station = await prisma.kitchenStation.findFirst({ where: { deletedAt: null } });
    if (!station) {
      station = await prisma.kitchenStation.create({
        data: { name: 'Test Station', code: `TS-${Date.now()}` },
      });
    }
    let category = await prisma.menuCategory.findFirst({ where: { deletedAt: null } });
    if (!category) {
      category = await prisma.menuCategory.create({
        data: { name: `Cat ${Date.now()}`, sortOrder: 0 },
      });
    }
    const item = await prisma.menuItem.create({
      data: {
        name: `Delivery Test Item ${Date.now()}`,
        sku: `DTI-${Date.now()}`,
        basePrice: 250,
        categoryId: category.id,
        kitchenStationId: station.id,
        isAvailable: true,
        isActive: true,
        prepTimeMinutes: 5,
      },
    });
    menuItemId = item.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('rejects delivery without nearby location', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        type: 'DELIVERY',
        customerName: 'Address Guest',
        customerPhone: phone,
        deliveryFee: 100,
        deliveryAddressSnapshot: { line1: 'House 1' },
        items: [{ menuItemId, quantity: 1 }],
      });
    expect([400, 422]).toContain(res.status);
  });

  it('saves default address when flagged and keeps order snapshot on later profile change', async () => {
    const create = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        type: 'DELIVERY',
        customerName: 'Ahmed Khan',
        customerPhone: phone,
        deliveryFee: 100,
        saveDeliveryAddress: true,
        deliveryAddressSnapshot: {
          line1: 'House 24, Street 5, Block B',
          city: 'Gulshan-e-Iqbal',
        },
        items: [{ menuItemId, quantity: 1 }],
      });
    expect(create.status).toBe(201);
    expect(create.body.data.deliveryAddressSnapshot.line1).toBe('House 24, Street 5, Block B');
    expect(create.body.data.deliveryAddressSnapshot.city).toBe('Gulshan-e-Iqbal');

    const search = await request(app)
      .get('/api/customers/search')
      .query({ q: phone })
      .set('Authorization', `Bearer ${adminToken}`);
    expect(search.status).toBe(200);
    const found = (search.body.data.items || []).find((c) => c.phone === phone);
    expect(found).toBeTruthy();
    expect(found.defaultAddress.line1).toBe('House 24, Street 5, Block B');
    expect(found.defaultAddress.city).toBe('Gulshan-e-Iqbal');

    const orderId = create.body.data.id;

    // Different address for this order, do NOT save to profile
    const second = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        type: 'DELIVERY',
        customerName: 'Ahmed Khan',
        customerPhone: phone,
        deliveryFee: 100,
        saveDeliveryAddress: false,
        deliveryAddressSnapshot: {
          line1: 'Flat 9, Sea View',
          city: 'Clifton',
        },
        items: [{ menuItemId, quantity: 1 }],
      });
    expect(second.status).toBe(201);
    expect(second.body.data.deliveryAddressSnapshot.city).toBe('Clifton');

    const searchAgain = await request(app)
      .get('/api/customers/search')
      .query({ q: phone })
      .set('Authorization', `Bearer ${adminToken}`);
    const again = (searchAgain.body.data.items || []).find((c) => c.phone === phone);
    expect(again.defaultAddress.city).toBe('Gulshan-e-Iqbal');

    // Update saved profile address
    const save = await request(app)
      .put(`/api/customers/${found.id}/default-address`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ line1: 'Plot 12, DHA Phase 5', city: 'DHA Phase 5' });
    expect(save.status).toBe(200);

    const historical = await request(app)
      .get(`/api/orders/${orderId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(historical.status).toBe(200);
    expect(historical.body.data.deliveryAddressSnapshot.line1).toBe(
      'House 24, Street 5, Block B'
    );
    expect(historical.body.data.deliveryAddressSnapshot.city).toBe('Gulshan-e-Iqbal');
  });

  it('allows takeaway without delivery address', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        type: 'TAKEAWAY',
        customerName: 'Takeaway Guest',
        customerPhone: `0311${String(Date.now()).slice(-7)}`,
        items: [{ menuItemId, quantity: 1 }],
      });
    expect(res.status).toBe(201);
    expect(res.body.data.deliveryAddressSnapshot).toBeNull();
  });
});

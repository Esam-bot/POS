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
const bcrypt = require('bcrypt');

async function loginAs(username, password) {
  const res = await request(app).post('/api/auth/login').send({ username, password });
  return res.body.data?.token;
}

describe('Menu API', () => {
  let adminToken;
  let viewerToken;
  let stationId;
  const suffix = Date.now();

  beforeAll(async () => {
    adminToken = await loginAs('admin', 'Admin@123');

    const passwordHash = await bcrypt.hash('Cashier@123', 10);
    const cashierRole = await prisma.role.findUnique({ where: { name: 'CASHIER' } });
    const cashier = await prisma.user.upsert({
      where: { username: 'cashier_menu_test' },
      update: { passwordHash, isActive: true, deletedAt: null },
      create: {
        username: 'cashier_menu_test',
        name: 'Cashier Tester',
        passwordHash,
        email: 'cashier_menu_test@local',
      },
    });
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: cashier.id, roleId: cashierRole.id } },
      update: {},
      create: { userId: cashier.id, roleId: cashierRole.id },
    });
    viewerToken = await loginAs('cashier_menu_test', 'Cashier@123');

    const station = await prisma.kitchenStation.findFirst({
      where: { deletedAt: null, isActive: true },
    });
    stationId = station.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('rejects unauthenticated menu access', async () => {
    const res = await request(app).get('/api/menu/categories');
    expect(res.status).toBe(401);
  });

  it('rejects cashier without menu.create', async () => {
    const res = await request(app)
      .post('/api/menu/categories')
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ name: `Denied ${suffix}` });
    expect(res.status).toBe(403);
  });

  it('creates, lists, updates and deactivates a category', async () => {
    const create = await request(app)
      .post('/api/menu/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: `Burgers ${suffix}`, description: 'Beef & chicken', sortOrder: 1 });
    expect(create.status).toBe(201);
    const categoryId = create.body.data.id;

    const dup = await request(app)
      .post('/api/menu/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: `burgers ${suffix}` });
    expect(dup.status).toBe(409);

    const update = await request(app)
      .patch(`/api/menu/categories/${categoryId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ description: 'Updated' });
    expect(update.status).toBe(200);
    expect(update.body.data.description).toBe('Updated');

    const deactivate = await request(app)
      .patch(`/api/menu/categories/${categoryId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: false });
    expect(deactivate.status).toBe(200);
    expect(deactivate.body.data.isActive).toBe(false);

    const itemOnInactive = await request(app)
      .post('/api/menu/items')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        categoryId,
        kitchenStationId: stationId,
        name: `Blocked Burger ${suffix}`,
        sku: `BLK-${suffix}`,
        basePrice: 500,
      });
    expect(itemOnInactive.status).toBe(400);

    await request(app)
      .patch(`/api/menu/categories/${categoryId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: true });
  });

  it('creates station and rejects inactive station assignment', async () => {
    const create = await request(app)
      .post('/api/menu/stations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: `Temp Station ${suffix}`, code: `TMP${suffix}` });
    expect(create.status).toBe(201);

    const dup = await request(app)
      .post('/api/menu/stations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: `Other ${suffix}`, code: `TMP${suffix}` });
    expect(dup.status).toBe(409);

    await request(app)
      .patch(`/api/menu/stations/${create.body.data.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: false });

    const category = await request(app)
      .post('/api/menu/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: `Cat for station ${suffix}` });

    const item = await request(app)
      .post('/api/menu/items')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        categoryId: category.body.data.id,
        kitchenStationId: create.body.data.id,
        name: `Item Station ${suffix}`,
        sku: `STN-${suffix}`,
        basePrice: 100,
      });
    expect(item.status).toBe(400);
  });

  it('creates menu item with variants, archive and POS filtering', async () => {
    const category = await request(app)
      .post('/api/menu/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: `Pizza ${suffix}` });
    const categoryId = category.body.data.id;

    const create = await request(app)
      .post('/api/menu/items')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        categoryId,
        kitchenStationId: stationId,
        name: `Margherita ${suffix}`,
        sku: `PZA-${suffix}`,
        basePrice: 1200,
      });
    expect(create.status).toBe(201);
    const itemId = create.body.data.id;

    const dupSku = await request(app)
      .post('/api/menu/items')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        categoryId,
        name: `Other ${suffix}`,
        sku: `pza-${suffix}`,
        basePrice: 100,
      });
    expect(dupSku.status).toBe(409);

    const negative = await request(app)
      .post('/api/menu/items')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        categoryId,
        name: `Bad ${suffix}`,
        sku: `BAD-${suffix}`,
        basePrice: -10,
      });
    expect(negative.status).toBe(422);

    const variant = await request(app)
      .post(`/api/menu/items/${itemId}/variants`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Large', price: 1600 });
    expect(variant.status).toBe(201);

    const negVariant = await request(app)
      .post(`/api/menu/items/${itemId}/variants`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Tiny', price: -1 });
    expect(negVariant.status).toBe(422);

    const list = await request(app)
      .get('/api/menu/items')
      .query({ search: `Margherita ${suffix}` })
      .set('Authorization', `Bearer ${adminToken}`);
    expect(list.status).toBe(200);
    expect(list.body.data.items.length).toBeGreaterThan(0);

    await request(app)
      .patch(`/api/menu/items/${itemId}/archive`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ archived: true });

    const posList = await request(app)
      .get('/api/menu/items')
      .query({ forPos: true, search: `Margherita ${suffix}` })
      .set('Authorization', `Bearer ${adminToken}`);
    expect(posList.body.data.items.length).toBe(0);

    await request(app)
      .patch(`/api/menu/items/${itemId}/archive`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ archived: false });
  });

  it('validates modifier groups and assignments', async () => {
    const badSingle = await request(app)
      .post('/api/menu/modifier-groups')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: `Bad Single ${suffix}`,
        selectionType: 'SINGLE',
        minSelect: 0,
        maxSelect: 3,
      });
    expect(badSingle.status).toBe(422);

    const group = await request(app)
      .post('/api/menu/modifier-groups')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: `Toppings ${suffix}`,
        selectionType: 'MULTI',
        minSelect: 0,
        maxSelect: 3,
      });
    expect(group.status).toBe(201);
    const groupId = group.body.data.id;

    const modifier = await request(app)
      .post(`/api/menu/modifier-groups/${groupId}/modifiers`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Extra Cheese', priceDelta: 100 });
    expect(modifier.status).toBe(201);

    await request(app)
      .patch(`/api/menu/modifiers/${modifier.body.data.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: false });

    const category = await prisma.menuCategory.findFirst({
      where: { deletedAt: null, isActive: true },
    });
    const item = await request(app)
      .post('/api/menu/items')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        categoryId: category.id,
        kitchenStationId: stationId,
        name: `Custom Burger ${suffix}`,
        sku: `CB-${suffix}`,
        basePrice: 450,
      });
    const itemId = item.body.data.id;

    const assign = await request(app)
      .put(`/api/menu/items/${itemId}/modifier-groups`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ groups: [{ modifierGroupId: groupId, sortOrder: 0 }] });
    expect(assign.status).toBe(200);

    const detail = await request(app)
      .get(`/api/menu/items/${itemId}`)
      .query({ forPos: 'true' })
      .set('Authorization', `Bearer ${adminToken}`);
    expect(detail.status).toBe(200);
    const mods = detail.body.data.modifierGroups?.[0]?.modifiers || [];
    expect(mods.every((m) => m.isActive)).toBe(true);

    const clear = await request(app)
      .put(`/api/menu/items/${itemId}/modifier-groups`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ groups: [] });
    expect(clear.status).toBe(200);
    expect(clear.body.data).toHaveLength(0);
  });

  it('validates image uploads', async () => {
    const missing = await request(app)
      .post('/api/menu/upload-image')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(missing.status).toBe(400);

    const invalid = await request(app)
      .post('/api/menu/upload-image')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('image', Buffer.from('not-an-image'), {
        filename: 'note.txt',
        contentType: 'text/plain',
      });
    expect(invalid.status).toBe(400);

    const ok = await request(app)
      .post('/api/menu/upload-image')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('image', Buffer.from([0xff, 0xd8, 0xff, 0xd9]), {
        filename: 'tiny.jpg',
        contentType: 'image/jpeg',
      });
    expect(ok.status).toBe(201);
    expect(ok.body.data.url).toContain('/uploads/menu/');
  });

  it('keeps Phase 1 auth working', async () => {
    const me = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(me.status).toBe(200);
    expect(me.body.data.username).toBe('admin');

    const dash = await request(app)
      .get('/api/dashboard/overview')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(dash.status).toBe(200);
  });
});

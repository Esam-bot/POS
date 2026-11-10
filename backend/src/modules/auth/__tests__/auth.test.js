const request = require('supertest');

process.env.NODE_ENV = 'test';
require('dotenv').config({ path: require('path').join(__dirname, '../../../../.env') });
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL =
    'postgresql://pos:pos_secret@127.0.0.1:5433/restaurant_pos?schema=public';
}

const app = require('../../../app');
const prisma = require('../../../config/db');

describe('Auth API', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('POST /api/auth/login rejects invalid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'nobody', password: 'wrong' });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('POST /api/auth/login accepts seeded admin', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'Admin@123' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeTruthy();
    expect(res.body.data.user.roles).toContain('ADMIN');
  });

  it('GET /api/auth/me requires auth', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('GET /api/auth/me returns user with permissions', async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'Admin@123' });

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${login.body.data.token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.permissions.length).toBeGreaterThan(0);
  });

  it('GET /api/dashboard/overview is protected', async () => {
    const res = await request(app).get('/api/dashboard/overview');
    expect(res.status).toBe(401);
  });
});

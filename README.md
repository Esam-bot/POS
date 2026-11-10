# Restaurant POS & Management System

Modular monolith: Express + Prisma + PostgreSQL backend, React + Vite frontend (Admin, POS, Kitchen).

## Prerequisites

- Node.js 20+
- PostgreSQL 14+ (Docker Compose recommended, or embedded helper below)

## Quick start

### 1. Database

**Option A — Docker Compose**

```bash
docker compose up -d
```

Then set in `backend/.env`:

```
DATABASE_URL=postgresql://pos:pos_secret@127.0.0.1:5432/restaurant_pos?schema=public
```

**Option B — Embedded Postgres (no Docker)**

```bash
cd backend
npm install
npm run db:embedded
```

Keep that process running. Default URL (already in `.env.example`):

```
DATABASE_URL=postgresql://pos:pos_secret@127.0.0.1:5433/restaurant_pos?schema=public
```

### 2. Backend

```bash
cd backend
cp .env.example .env
# edit JWT_SECRET if needed
npm install
npx prisma migrate deploy
npm run db:seed
npm run dev
```

API: `http://localhost:6000` (see `backend/.env` `PORT`)  
Health: `GET /api/health`

Default admin (change after first login):

- Username: `admin`
- Password: `Admin@123`

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

App: `http://localhost:5173`

## Phase status

| Phase | Status |
|-------|--------|
| 1 Foundation — schema, auth/RBAC, login + admin shell | Complete |
| 2 Menu — categories, items, variants, modifiers, stations, uploads | Complete |
| 3 POS & tables — sessions, orders, POS UI | Complete |
| 4 Kitchen / Socket.IO | Pending |
| 5 Payments & receipts | Pending |
| 6 Inventory | Pending |
| 7 Purchasing | Pending |
| 8 Customers, employees, shifts, expenses | Pending |
| 9 Dashboard & reports | Pending |
| 10 Production readiness | Pending |

## Useful commands

```bash
# backend
cd backend
npm run db:migrate      # create/apply migrations in development
npm run db:seed
npm test
npm run dev

# frontend
cd frontend
npm run dev
npm run build
```

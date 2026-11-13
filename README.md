# Restaurant POS & Management System

Modular monolith: Express + Prisma + PostgreSQL backend, React + Vite frontend (Admin + POS).

## Prerequisites

- Node.js 20+
- System PostgreSQL 14+ (primary database)

## Quick start

### 1. Database

Ensure PostgreSQL is running on port **5432** with database **`pos_db`**, then set `backend/.env`:

```env
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/pos_db?schema=public
PORT=4000
```

### 2. Backend

```bash
cd backend
cp .env.example .env   # then edit DATABASE_URL / JWT_SECRET
npm install
npx prisma migrate deploy
npx prisma generate
npm run db:seed
npm run dev
```

API: `http://localhost:4000` (avoid port **6000** — Chrome blocks it)  
Health: `GET /api/health`

Default admin: `admin` / `Admin@123`

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

App: `http://localhost:5173` (Vite proxies `/api` and `/socket.io` to the backend)

## Useful commands

```bash
# backend
cd backend
npm run db:migrate        # create/apply migrations in development
npm run db:seed
npm test
npm run dev               # listens on PORT from .env (4000)

# frontend
cd frontend
npm run dev               # http://localhost:5173 → proxies to VITE_PROXY_TARGET (4000)
npm run build
```

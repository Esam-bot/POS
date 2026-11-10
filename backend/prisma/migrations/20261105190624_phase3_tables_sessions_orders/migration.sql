-- CreateEnum
CREATE TYPE "TableSessionStatus" AS ENUM ('OPEN', 'CLOSED');

-- AlterEnum
ALTER TYPE "TableStatus" ADD VALUE 'INACTIVE';

-- AlterTable
ALTER TABLE "dining_tables" ADD COLUMN     "notes" TEXT;

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "skuSnapshot" TEXT;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "tableSessionId" UUID;

-- CreateTable
CREATE TABLE "table_sessions" (
    "id" UUID NOT NULL,
    "status" "TableSessionStatus" NOT NULL DEFAULT 'OPEN',
    "openedById" UUID NOT NULL,
    "guestCount" INTEGER,
    "notes" TEXT,
    "openedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "table_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_tables" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "tableId" UUID NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "joinedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMPTZ,

    CONSTRAINT "session_tables_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "table_sessions_status_openedAt_idx" ON "table_sessions"("status", "openedAt");

-- CreateIndex
CREATE INDEX "session_tables_sessionId_isActive_idx" ON "session_tables"("sessionId", "isActive");

-- CreateIndex
CREATE INDEX "session_tables_tableId_isActive_idx" ON "session_tables"("tableId", "isActive");

-- CreateIndex
CREATE INDEX "orders_tableSessionId_status_idx" ON "orders"("tableSessionId", "status");

-- AddForeignKey
ALTER TABLE "table_sessions" ADD CONSTRAINT "table_sessions_openedById_fkey" FOREIGN KEY ("openedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_tables" ADD CONSTRAINT "session_tables_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "table_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_tables" ADD CONSTRAINT "session_tables_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "dining_tables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_tableSessionId_fkey" FOREIGN KEY ("tableSessionId") REFERENCES "table_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Enforce: a table cannot belong to two active sessions at once
CREATE UNIQUE INDEX "session_tables_one_active_per_table"
ON "session_tables" ("tableId")
WHERE "isActive" = true;

-- Phase 5 dual-print: customer order slip + kitchen ticket tracking

CREATE TYPE "PrintDocumentType" AS ENUM ('CUSTOMER_ORDER_SLIP', 'KITCHEN_TICKET');
CREATE TYPE "PrintJobStatus" AS ENUM ('READY', 'PRINTED', 'FAILED');

CREATE TABLE "print_jobs" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "type" "PrintDocumentType" NOT NULL,
    "status" "PrintJobStatus" NOT NULL DEFAULT 'READY',
    "documentKey" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "printCount" INTEGER NOT NULL DEFAULT 0,
    "lastPrintedAt" TIMESTAMPTZ,
    "lastError" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "print_jobs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "print_jobs_orderId_type_key" ON "print_jobs"("orderId", "type");
CREATE INDEX "print_jobs_type_createdAt_idx" ON "print_jobs"("type", "createdAt");

ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

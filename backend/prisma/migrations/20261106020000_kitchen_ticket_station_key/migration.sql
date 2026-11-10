-- Phase 5: idempotent kitchen tickets per order+station, preparation timestamps

ALTER TABLE "kitchen_tickets" ADD COLUMN IF NOT EXISTS "stationKey" TEXT NOT NULL DEFAULT 'UNASSIGNED';
ALTER TABLE "kitchen_tickets" ADD COLUMN IF NOT EXISTS "preparingAt" TIMESTAMPTZ;
ALTER TABLE "kitchen_tickets" ADD COLUMN IF NOT EXISTS "readyAt" TIMESTAMPTZ;
ALTER TABLE "kitchen_tickets" ADD COLUMN IF NOT EXISTS "servedAt" TIMESTAMPTZ;

UPDATE "kitchen_tickets"
SET "stationKey" = COALESCE("stationId"::text, 'UNASSIGNED')
WHERE "stationKey" = 'UNASSIGNED' AND "stationId" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "kitchen_tickets_orderId_stationKey_key"
  ON "kitchen_tickets"("orderId", "stationKey");

CREATE INDEX IF NOT EXISTS "kitchen_tickets_stationId_status_idx"
  ON "kitchen_tickets"("stationId", "status");

-- CreateEnum
CREATE TYPE "RefundType" AS ENUM ('PAYMENT_CORRECTION', 'SALES_RETURN', 'VOID_AFTER_PAYMENT');

-- AlterEnum
ALTER TYPE "PaymentStatus" ADD VALUE 'COMPLIMENTARY';
ALTER TYPE "PaymentStatus" ADD VALUE 'WRITTEN_OFF';

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "discountLocked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "settlementAt" TIMESTAMPTZ,
ADD COLUMN     "settlementById" UUID,
ADD COLUMN     "settlementReason" TEXT;

-- AlterTable
ALTER TABLE "payment_methods" ADD COLUMN     "taxRate" DECIMAL(5,2) NOT NULL DEFAULT 0;

-- AlterTable payments: additive financial fields (default 0 for any legacy rows)
ALTER TABLE "payments" ADD COLUMN     "amountTendered" DECIMAL(12,2),
ADD COLUMN     "changeReturned" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "preTaxAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "requestHash" TEXT,
ADD COLUMN     "taxAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "taxRateSnapshot" DECIMAL(5,2) NOT NULL DEFAULT 0;

-- Backfill preTax from legacy amount when needed
UPDATE "payments"
SET "preTaxAmount" = "amount"
WHERE "preTaxAmount" = 0 AND "amount" > 0 AND "taxAmount" = 0;

-- AlterTable refunds: add columns as nullable first, then tighten if empty
ALTER TABLE "refunds" ADD COLUMN     "orderId" UUID,
ADD COLUMN     "preTaxAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "processedById" UUID,
ADD COLUMN     "reference" TEXT,
ADD COLUMN     "requestHash" TEXT,
ADD COLUMN     "taxAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "type" "RefundType" NOT NULL DEFAULT 'PAYMENT_CORRECTION';

-- Backfill refund order/processor from payment when possible
UPDATE "refunds" r
SET
  "orderId" = p."orderId",
  "processedById" = r."authorizedById",
  "preTaxAmount" = r."amount"
FROM "payments" p
WHERE r."paymentId" = p."id" AND r."orderId" IS NULL;

-- Require orderId/processedById after backfill (dev DB has no refunds)
ALTER TABLE "refunds" ALTER COLUMN "orderId" SET NOT NULL;
ALTER TABLE "refunds" ALTER COLUMN "processedById" SET NOT NULL;
ALTER TABLE "refunds" ALTER COLUMN "type" DROP DEFAULT;

-- AlterTable
ALTER TABLE "restaurant_settings" ADD COLUMN     "taxDeliveryFee" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "taxServiceCharge" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "payments_reference_idx" ON "payments"("reference");

-- CreateIndex
CREATE INDEX "refunds_orderId_idx" ON "refunds"("orderId");

-- CreateIndex
CREATE INDEX "refunds_type_createdAt_idx" ON "refunds"("type", "createdAt");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_settlementById_fkey" FOREIGN KEY ("settlementById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_processedById_fkey" FOREIGN KEY ("processedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

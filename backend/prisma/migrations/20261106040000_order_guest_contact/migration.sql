-- Guest contact captured at POS checkout (no Customer account required).
ALTER TABLE "orders" ADD COLUMN "customerName" TEXT;
ALTER TABLE "orders" ADD COLUMN "customerPhone" TEXT;

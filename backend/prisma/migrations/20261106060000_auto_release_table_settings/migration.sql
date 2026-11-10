-- AlterTable
ALTER TABLE "restaurant_settings" ADD COLUMN "autoReleaseTableOnPayment" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "restaurant_settings" ADD COLUMN "useCleaningStatus" BOOLEAN NOT NULL DEFAULT false;

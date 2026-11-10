-- AlterTable
ALTER TABLE "kitchen_stations" ADD COLUMN     "description" TEXT;

-- AlterTable
ALTER TABLE "menu_categories" ADD COLUMN     "description" TEXT;

-- AlterTable
ALTER TABLE "modifier_groups" ADD COLUMN     "description" TEXT;

-- AlterTable
ALTER TABLE "modifiers" ADD COLUMN     "description" TEXT,
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "menu_categories_name_idx" ON "menu_categories"("name");

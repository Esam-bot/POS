-- Phase 6 — Inventory Management (additive)

-- Inventory categories
CREATE TABLE "inventory_categories" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "inventory_categories_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "inventory_categories_name_idx" ON "inventory_categories"("name");
CREATE INDEX "inventory_categories_isActive_idx" ON "inventory_categories"("isActive");

-- Default category for any pre-existing ingredients
INSERT INTO "inventory_categories" ("id", "name", "description", "isActive", "createdAt", "updatedAt")
VALUES (
  gen_random_uuid(),
  'General',
  'Default inventory category',
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);

-- Extend ingredients
ALTER TABLE "ingredients" ADD COLUMN "categoryId" UUID;
ALTER TABLE "ingredients" ADD COLUMN "supplierId" UUID;

UPDATE "ingredients"
SET "categoryId" = (SELECT "id" FROM "inventory_categories" WHERE "name" = 'General' LIMIT 1)
WHERE "categoryId" IS NULL;

ALTER TABLE "ingredients" ALTER COLUMN "categoryId" SET NOT NULL;

ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "inventory_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_supplierId_fkey"
  FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "ingredients_categoryId_idx" ON "ingredients"("categoryId");
CREATE INDEX "ingredients_name_idx" ON "ingredients"("name");

-- Stock before/after on movements
ALTER TABLE "inventory_transactions" ADD COLUMN "stockBefore" DECIMAL(14,4) NOT NULL DEFAULT 0;
ALTER TABLE "inventory_transactions" ADD COLUMN "stockAfter" DECIMAL(14,4) NOT NULL DEFAULT 0;

CREATE INDEX "inventory_transactions_type_createdAt_idx" ON "inventory_transactions"("type", "createdAt");

-- Modifier → ingredient mappings
CREATE TABLE "modifier_ingredients" (
    "id" UUID NOT NULL,
    "modifierId" UUID NOT NULL,
    "ingredientId" UUID NOT NULL,
    "quantity" DECIMAL(14,4) NOT NULL,

    CONSTRAINT "modifier_ingredients_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "modifier_ingredients_modifierId_ingredientId_key"
  ON "modifier_ingredients"("modifierId", "ingredientId");
CREATE INDEX "modifier_ingredients_modifierId_idx" ON "modifier_ingredients"("modifierId");

ALTER TABLE "modifier_ingredients" ADD CONSTRAINT "modifier_ingredients_modifierId_fkey"
  FOREIGN KEY ("modifierId") REFERENCES "modifiers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "modifier_ingredients" ADD CONSTRAINT "modifier_ingredients_ingredientId_fkey"
  FOREIGN KEY ("ingredientId") REFERENCES "ingredients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- One-time stock deduction ledger per order
CREATE TABLE "order_inventory_deductions" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "deductedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,

    CONSTRAINT "order_inventory_deductions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "order_inventory_deductions_orderId_key" ON "order_inventory_deductions"("orderId");

ALTER TABLE "order_inventory_deductions" ADD CONSTRAINT "order_inventory_deductions_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- One recipe per menu item + variant (NULLs allowed multiple times in PG; app enforces base uniqueness)
CREATE UNIQUE INDEX "recipes_menuItemId_variantId_key" ON "recipes"("menuItemId", "variantId");

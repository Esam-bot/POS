const { z } = require('zod');

const optionalBool = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .optional()
  .transform((v) => {
    if (v === undefined) return undefined;
    if (typeof v === 'boolean') return v;
    return v === 'true' || v === '1';
  });

const qty = z.coerce.number().positive('Quantity must be greater than zero');
const nonNeg = z.coerce.number().min(0, 'Must be zero or greater');

const paginationQuery = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  search: z.string().trim().optional(),
  isActive: optionalBool,
  categoryId: z.string().uuid().optional(),
  stockStatus: z.enum(['IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK']).optional(),
  ingredientId: z.string().uuid().optional(),
  type: z
    .enum(['RECEIVE', 'ADJUST', 'WASTE', 'CONSUME', 'REVERSE', 'RESERVE', 'RELEASE'])
    .optional(),
});

const categoryCreate = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional().nullable(),
  isActive: z.boolean().optional(),
});

const categoryUpdate = categoryCreate.partial();

const statusBody = z.object({
  isActive: z.boolean(),
});

const itemCreate = z.object({
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(500).optional().nullable(),
  categoryId: z.string().uuid(),
  unitId: z.string().uuid(),
  supplierId: z.string().uuid().optional().nullable(),
  currentStock: nonNeg.optional(),
  minStock: nonNeg.optional(),
  avgCost: nonNeg.optional(),
  isActive: z.boolean().optional(),
});

const itemUpdate = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  description: z.string().trim().max(500).optional().nullable(),
  categoryId: z.string().uuid().optional(),
  unitId: z.string().uuid().optional(),
  supplierId: z.string().uuid().optional().nullable(),
  minStock: nonNeg.optional(),
  avgCost: nonNeg.optional(),
  isActive: z.boolean().optional(),
});

const stockAdd = z.object({
  ingredientId: z.string().uuid(),
  quantity: qty,
  unitId: z.string().uuid().optional().nullable(),
  unitCost: nonNeg.optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
});

const supplierCreate = z.object({
  name: z.string().trim().min(1).max(160),
  contactPerson: z.string().trim().max(120).optional().nullable(),
  phone: z.string().trim().max(40).optional().nullable(),
  email: z.string().trim().email().optional().nullable().or(z.literal('')),
  address: z.string().trim().max(500).optional().nullable(),
  isActive: z.boolean().optional(),
});

const supplierUpdate = supplierCreate.partial();

const purchaseCreate = z.object({
  supplierId: z.string().uuid(),
  notes: z.string().trim().max(500).optional().nullable(),
  submit: z.boolean().optional(),
  items: z
    .array(
      z.object({
        ingredientId: z.string().uuid(),
        qtyOrdered: qty,
        unitCost: nonNeg,
      })
    )
    .min(1),
});

const purchaseUpdate = z.object({
  status: z.enum(['ORDERED', 'CANCELLED']).optional(),
  notes: z.string().trim().max(500).optional().nullable(),
});

const purchaseReceive = z.object({
  idempotencyKey: z.string().trim().min(4).max(120).optional().nullable(),
  items: z
    .array(
      z.object({
        purchaseOrderItemId: z.string().uuid(),
        qtyReceived: qty,
        unitId: z.string().uuid().optional().nullable(),
      })
    )
    .min(1),
});

const stockAdjust = z.object({
  ingredientId: z.string().uuid(),
  newStock: nonNeg,
  reason: z.string().trim().min(1).max(500),
});

const stockWaste = z.object({
  ingredientId: z.string().uuid(),
  quantity: qty,
  reason: z.string().trim().min(1).max(500),
});

const recipeItem = z.object({
  ingredientId: z.string().uuid(),
  quantity: qty,
});

const recipeUpsert = z.object({
  menuItemId: z.string().uuid(),
  variantId: z.string().uuid().optional().nullable(),
  name: z.string().trim().max(160).optional().nullable(),
  yieldQty: z.coerce.number().positive().optional(),
  isActive: z.boolean().optional(),
  items: z.array(recipeItem).min(1, 'Add at least one ingredient'),
});

const modifierIngredientUpsert = z.object({
  items: z.array(recipeItem),
});

module.exports = {
  paginationQuery,
  categoryCreate,
  categoryUpdate,
  statusBody,
  itemCreate,
  itemUpdate,
  stockAdd,
  stockAdjust,
  stockWaste,
  recipeUpsert,
  modifierIngredientUpsert,
  supplierCreate,
  supplierUpdate,
  purchaseCreate,
  purchaseUpdate,
  purchaseReceive,
};

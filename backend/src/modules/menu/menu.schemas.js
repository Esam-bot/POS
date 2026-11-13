const { z } = require('zod');

const money = z.coerce.number().min(0, 'Price must be non-negative');
const optionalBool = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .optional()
  .transform((v) => {
    if (v === undefined) return undefined;
    if (typeof v === 'boolean') return v;
    return v === 'true' || v === '1';
  });

const paginationQuery = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  search: z.string().trim().optional(),
  isActive: optionalBool,
});

const categoryCreate = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional().nullable(),
  imageUrl: z.string().trim().url().optional().nullable().or(z.literal('')),
  sortOrder: z.coerce.number().int().optional(),
  isActive: z.boolean().optional(),
});

const categoryUpdate = categoryCreate.partial();

const statusBody = z.object({
  isActive: z.boolean(),
});

const stationCreate = z.object({
  name: z.string().trim().min(1).max(120),
  code: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .regex(/^[A-Z0-9_]+$/i, 'Code must be alphanumeric')
    .transform((v) => v.toUpperCase()),
  description: z.string().trim().max(500).optional().nullable(),
  isActive: z.boolean().optional(),
});

const stationUpdate = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(500).optional().nullable(),
  isActive: z.boolean().optional(),
});

const itemCreate = z.object({
  categoryId: z.string().uuid(),
  kitchenStationId: z.string().uuid().optional().nullable(),
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).optional().nullable(),
  sku: z.string().trim().min(1).max(60),
  imageUrl: z.string().trim().optional().nullable(),
  basePrice: money,
  prepTimeMinutes: z.coerce.number().int().min(0).max(240).optional().default(5),
  isAvailable: z.boolean().optional(),
  isActive: z.boolean().optional(),
  trackInventory: z.boolean().optional(),
});

const itemUpdate = itemCreate.partial();

const availabilityBody = z.object({
  isAvailable: z.boolean(),
});

const archiveBody = z.object({
  archived: z.boolean(),
});

const variantCreate = z.object({
  name: z.string().trim().min(1).max(120),
  price: money,
  sku: z.string().trim().max(60).optional().nullable(),
  sortOrder: z.coerce.number().int().optional(),
  isActive: z.boolean().optional(),
});

const variantUpdate = variantCreate.partial();

const selectionType = z
  .enum(['SINGLE', 'MULTI', 'MULTIPLE'])
  .transform((v) => (v === 'MULTIPLE' ? 'MULTI' : v));

const modifierGroupCreate = z
  .object({
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(500).optional().nullable(),
    selectionType: selectionType.optional(),
    minSelect: z.coerce.number().int().min(0).optional(),
    maxSelect: z.coerce.number().int().min(0).optional(),
    isRequired: z.boolean().optional(),
    isActive: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    const type = data.selectionType || 'MULTI';
    const min = data.minSelect ?? 0;
    const max = data.maxSelect ?? 1;
    if (max < min) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'maxSelect cannot be less than minSelect', path: ['maxSelect'] });
    }
    if (type === 'SINGLE' && max > 1) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'SINGLE groups cannot have maxSelect greater than 1', path: ['maxSelect'] });
    }
    if (data.isRequired && min < 1) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Required groups must have minSelect of at least 1', path: ['minSelect'] });
    }
  });

const modifierGroupUpdate = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(500).optional().nullable(),
    selectionType: selectionType.optional(),
    minSelect: z.coerce.number().int().min(0).optional(),
    maxSelect: z.coerce.number().int().min(0).optional(),
    isRequired: z.boolean().optional(),
    isActive: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.minSelect !== undefined && data.maxSelect !== undefined && data.maxSelect < data.minSelect) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'maxSelect cannot be less than minSelect', path: ['maxSelect'] });
    }
    if (data.selectionType === 'SINGLE' && data.maxSelect !== undefined && data.maxSelect > 1) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'SINGLE groups cannot have maxSelect greater than 1', path: ['maxSelect'] });
    }
    if (data.isRequired === true && data.minSelect !== undefined && data.minSelect < 1) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Required groups must have minSelect of at least 1', path: ['minSelect'] });
    }
  });

const modifierCreate = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional().nullable(),
  priceDelta: money,
  sortOrder: z.coerce.number().int().optional(),
  isActive: z.boolean().optional(),
});

const modifierUpdate = modifierCreate.partial();

const assignGroupsBody = z.object({
  groups: z.array(
    z.object({
      modifierGroupId: z.string().uuid(),
      sortOrder: z.coerce.number().int().optional(),
    })
  ),
});

const itemListQuery = paginationQuery.extend({
  categoryId: z.string().uuid().optional(),
  kitchenStationId: z.string().uuid().optional(),
  isAvailable: optionalBool,
  archived: optionalBool,
  forPos: optionalBool,
});

module.exports = {
  paginationQuery,
  categoryCreate,
  categoryUpdate,
  statusBody,
  stationCreate,
  stationUpdate,
  itemCreate,
  itemUpdate,
  availabilityBody,
  archiveBody,
  variantCreate,
  variantUpdate,
  modifierGroupCreate,
  modifierGroupUpdate,
  modifierCreate,
  modifierUpdate,
  assignGroupsBody,
  itemListQuery,
};

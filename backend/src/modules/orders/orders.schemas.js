const { z } = require('zod');

const modifierSelection = z.object({
  modifierId: z.string().uuid(),
  quantity: z.coerce.number().int().positive().optional(),
});

const orderItemInput = z.object({
  menuItemId: z.string().uuid(),
  variantId: z.string().uuid().optional().nullable(),
  quantity: z.coerce.number().positive().max(999),
  specialInstructions: z.string().trim().max(500).optional().nullable(),
  modifiers: z.array(modifierSelection).optional().default([]),
});

const phoneString = z
  .string()
  .trim()
  .min(7, 'Phone number is required')
  .max(20, 'Phone number is too long')
  .regex(/^[0-9+\-\s()]+$/, 'Enter a valid phone number');

const createOrder = z.object({
  type: z.enum(['DINE_IN', 'TAKEAWAY', 'DELIVERY']),
  tableSessionId: z.string().uuid().optional().nullable(),
  diningTableId: z.string().uuid().optional().nullable(),
  customerId: z.string().uuid().optional().nullable(),
  customerName: z.string().trim().min(1, 'Customer name is required').max(120),
  customerPhone: phoneString,
  notes: z.string().trim().max(1000).optional().nullable(),
  deliveryFee: z.coerce.number().min(0).optional(),
  deliveryAddressSnapshot: z
    .object({
      name: z.string().optional(),
      phone: z.string().optional(),
      line1: z.string().optional(),
      city: z.string().optional(),
      notes: z.string().optional(),
    })
    .optional()
    .nullable(),
  items: z.array(orderItemInput).min(1),
});

const addItems = z.object({
  items: z.array(orderItemInput).min(1),
});

const transitionBody = z.object({
  status: z.enum([
    'PLACED',
    'CONFIRMED',
    'PREPARING',
    'READY',
    'SERVED',
    'OUT_FOR_DELIVERY',
    'DELIVERED',
    'COMPLETED',
    'CANCELLED',
  ]),
  reason: z.string().trim().max(500).optional().nullable(),
});

const cancelBody = z.object({
  reason: z.string().trim().min(3).max(500),
});

const splitBody = z.object({
  items: z
    .array(
      z.object({
        orderItemId: z.string().uuid(),
        quantity: z.coerce.number().positive(),
      })
    )
    .min(1),
});

module.exports = {
  createOrder,
  addItems,
  transitionBody,
  cancelBody,
  splitBody,
  orderItemInput,
};

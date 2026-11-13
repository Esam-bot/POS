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

const optionalPhoneString = z
  .string()
  .trim()
  .max(20, 'Phone number is too long')
  .regex(/^[0-9+\-\s()]*$/, 'Enter a valid phone number')
  .optional()
  .nullable();

const createOrder = z
  .object({
    type: z.enum(['DINE_IN', 'TAKEAWAY', 'DELIVERY']),
    tableSessionId: z.string().uuid().optional().nullable(),
    diningTableId: z.string().uuid().optional().nullable(),
    customerId: z.string().uuid().optional().nullable(),
    customerName: z.string().trim().min(1, 'Customer name is required').max(120),
    /** Required for DELIVERY; optional for TAKEAWAY; unused for DINE_IN. */
    customerPhone: optionalPhoneString,
    notes: z.string().trim().max(1000).optional().nullable(),
    deliveryFee: z.coerce.number().min(0).optional(),
    /** When true on DELIVERY, upsert the customer's default saved address. */
    saveDeliveryAddress: z.boolean().optional().default(false),
    deliveryAddressSnapshot: z
      .object({
        name: z.string().trim().max(120).optional(),
        phone: z.string().trim().max(20).optional(),
        line1: z.string().trim().max(500).optional(),
        city: z.string().trim().max(200).optional(),
        notes: z.string().trim().max(500).optional(),
      })
      .optional()
      .nullable(),
    items: z.array(orderItemInput).min(1),
  })
  .superRefine((data, ctx) => {
    const phone = String(data.customerPhone || '').trim();

    if (data.type === 'DELIVERY') {
      if (phone.length < 7) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['customerPhone'],
          message: 'Phone number is required',
        });
      } else if (!/^[0-9+\-\s()]+$/.test(phone)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['customerPhone'],
          message: 'Enter a valid phone number',
        });
      }

      const line1 = String(data.deliveryAddressSnapshot?.line1 || '').trim();
      const city = String(data.deliveryAddressSnapshot?.city || '').trim();
      if (!line1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['deliveryAddressSnapshot', 'line1'],
          message: 'Complete delivery address is required',
        });
      }
      if (!city) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['deliveryAddressSnapshot', 'city'],
          message: 'Nearby location / area is required',
        });
      }
      return;
    }

    // TAKEAWAY / DINE_IN: phone optional, but if provided must be valid
    if (phone && (phone.length < 7 || !/^[0-9+\-\s()]+$/.test(phone))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['customerPhone'],
        message: 'Enter a valid phone number',
      });
    }
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
  allowNegativeStock: z.boolean().optional(),
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

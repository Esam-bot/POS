const { z } = require('zod');

const paymentPortion = z.object({
  methodId: z.string().uuid(),
  preTaxAmount: z.coerce.number().positive(),
  amountTendered: z.coerce.number().min(0).optional().nullable(),
  reference: z.string().trim().max(120).optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
});

const createPayments = z.object({
  portions: z.array(paymentPortion).min(1),
  idempotencyKey: z.string().trim().min(8).max(120).optional(),
  allowNegativeStock: z.boolean().optional(),
});

const quoteBody = z.object({
  portions: z.array(paymentPortion).optional(),
});

const refundBody = z.object({
  amount: z.coerce.number().positive(),
  type: z.enum(['PAYMENT_CORRECTION', 'SALES_RETURN', 'VOID_AFTER_PAYMENT']),
  reason: z.string().trim().min(3).max(500),
  idempotencyKey: z.string().trim().min(8).max(120).optional(),
  reference: z.string().trim().max(120).optional().nullable(),
});

const settlementBody = z.object({
  status: z.enum(['COMPLIMENTARY', 'WRITTEN_OFF']),
  reason: z.string().trim().min(3).max(500),
});

const discountBody = z.object({
  type: z.enum(['FIXED', 'PERCENT']),
  value: z.coerce.number().positive(),
  reason: z.string().trim().max(500).optional().nullable(),
});

const methodUpdate = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  isActive: z.boolean().optional(),
  taxRate: z.coerce.number().min(0).max(100).optional(),
  sortOrder: z.coerce.number().int().optional(),
});

const methodCreate = z.object({
  code: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(/^[A-Z][A-Z0-9_]*$/, 'Code must be uppercase letters, numbers, underscores'),
  name: z.string().trim().min(1).max(80),
  taxRate: z.coerce.number().min(0).max(100).default(0),
  isCash: z.boolean().optional().default(false),
  isActive: z.boolean().optional().default(true),
  sortOrder: z.coerce.number().int().optional(),
});

const settingsUpdate = z.object({
  // Restaurant profile
  name: z.string().trim().min(1).max(160).optional(),
  address: z.string().trim().max(500).optional().nullable(),
  phone: z.string().trim().max(40).optional().nullable(),
  email: z
    .string()
    .trim()
    .email()
    .optional()
    .nullable()
    .or(z.literal('').transform(() => null)),
  // Billing / ops settings
  taxServiceCharge: z.boolean().optional(),
  taxDeliveryFee: z.boolean().optional(),
  allowPartialPayments: z.boolean().optional(),
  serviceChargeValue: z.coerce.number().min(0).optional(),
  serviceChargeType: z.enum(['PERCENT', 'FIXED']).optional(),
  deliveryFeeDefault: z.coerce.number().min(0).optional(),
  currencyCode: z
    .string()
    .trim()
    .min(3)
    .max(3)
    .transform((v) => v.toUpperCase())
    .optional(),
  timezone: z.string().trim().min(1).max(64).optional(),
  receiptFooter: z.string().trim().max(500).optional().nullable(),
  tableCleaningMinutes: z.coerce.number().int().min(1).max(60).optional(),
  autoReadyOnEstimate: z.boolean().optional(),
  autoReleaseTableOnPayment: z.boolean().optional(),
  useCleaningStatus: z.boolean().optional(),
});

module.exports = {
  createPayments,
  quoteBody,
  refundBody,
  settlementBody,
  discountBody,
  methodUpdate,
  methodCreate,
  settingsUpdate,
};

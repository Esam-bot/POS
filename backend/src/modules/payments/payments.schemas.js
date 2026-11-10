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

const settingsUpdate = z.object({
  taxServiceCharge: z.boolean().optional(),
  taxDeliveryFee: z.boolean().optional(),
  allowPartialPayments: z.boolean().optional(),
  autoReleaseTableOnPayment: z.boolean().optional(),
  useCleaningStatus: z.boolean().optional(),
  serviceChargeValue: z.coerce.number().min(0).optional(),
  serviceChargeType: z.enum(['PERCENT', 'FIXED']).optional(),
  deliveryFeeDefault: z.coerce.number().min(0).optional(),
  receiptFooter: z.string().trim().max(500).optional().nullable(),
});

module.exports = {
  createPayments,
  quoteBody,
  refundBody,
  settlementBody,
  discountBody,
  methodUpdate,
  settingsUpdate,
};

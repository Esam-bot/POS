const { z } = require('zod');

const dateString = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD');

const amount = z.coerce.number().positive('Amount must be greater than zero');

const paymentStatus = z.enum(['UNPAID', 'PAID']);
const frequency = z.enum(['MONTHLY', 'QUARTERLY', 'YEARLY']);
const recurringStatus = z.enum(['ACTIVE', 'PAUSED', 'INACTIVE']);

const listQuery = z
  .object({
    from: dateString.optional(),
    to: dateString.optional(),
    search: z.string().trim().optional(),
    categoryId: z.string().uuid().optional(),
    paymentStatus: paymentStatus.optional(),
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().max(200).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.from && val.to && val.from > val.to) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'From date must not be later than To date',
        path: ['from'],
      });
    }
  });

const financialQuery = z
  .object({
    from: dateString.optional(),
    to: dateString.optional(),
  })
  .superRefine((val, ctx) => {
    if (val.from && val.to && val.from > val.to) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'From date must not be later than To date',
        path: ['from'],
      });
    }
  });

const billingPeriodString = z
  .string()
  .trim()
  .regex(/^(\d{4}-\d{2}(-\d{2})?)$/, 'Billing period must be YYYY-MM or YYYY-MM-DD')
  .optional()
  .nullable();

const expenseCreate = z.object({
  title: z.string().trim().min(1).max(160),
  categoryId: z.string().uuid(),
  amount,
  methodId: z.string().uuid().optional().nullable(),
  expenseDate: dateString,
  billingPeriod: billingPeriodString,
  description: z.string().trim().max(1000).optional().nullable(),
  paymentStatus: paymentStatus.optional(),
});

const expenseUpdate = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  categoryId: z.string().uuid().optional(),
  amount: amount.optional(),
  methodId: z.string().uuid().optional().nullable(),
  expenseDate: dateString.optional(),
  billingPeriod: billingPeriodString,
  description: z.string().trim().max(1000).optional().nullable(),
  paymentStatus: paymentStatus.optional(),
});

const recurringListQuery = z.object({
  search: z.string().trim().optional(),
  categoryId: z.string().uuid().optional(),
  status: recurringStatus.optional(),
});

const recurringCreate = z
  .object({
    title: z.string().trim().min(1).max(160),
    categoryId: z.string().uuid(),
    amount,
    methodId: z.string().uuid().optional().nullable(),
    frequency,
    startDate: dateString,
    nextDueDate: dateString.optional(),
    endDate: dateString.optional().nullable(),
    description: z.string().trim().max(1000).optional().nullable(),
  })
  .superRefine((val, ctx) => {
    if (val.endDate && val.startDate && val.endDate < val.startDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'End date must not be earlier than start date',
        path: ['endDate'],
      });
    }
  });

const recurringUpdate = z
  .object({
    title: z.string().trim().min(1).max(160).optional(),
    categoryId: z.string().uuid().optional(),
    amount: amount.optional(),
    methodId: z.string().uuid().optional().nullable(),
    frequency: frequency.optional(),
    startDate: dateString.optional(),
    nextDueDate: dateString.optional(),
    endDate: dateString.optional().nullable(),
    description: z.string().trim().max(1000).optional().nullable(),
  })
  .superRefine((val, ctx) => {
    if (val.endDate && val.startDate && val.endDate < val.startDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'End date must not be earlier than start date',
        path: ['endDate'],
      });
    }
  });

const categoryCreate = z.object({
  name: z.string().trim().min(1).max(120),
});

const categoryUpdate = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  isActive: z.boolean().optional(),
});

module.exports = {
  listQuery,
  financialQuery,
  expenseCreate,
  expenseUpdate,
  recurringListQuery,
  recurringCreate,
  recurringUpdate,
  categoryCreate,
  categoryUpdate,
};

const { z } = require('zod');

const openSession = z.object({
  tableIds: z.array(z.string().uuid()).min(1).max(10),
  guestCount: z.coerce.number().int().positive().max(100).optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
});

const tablesBody = z.object({
  tableIds: z.array(z.string().uuid()).min(1),
});

const transferBody = z.object({
  fromTableId: z.string().uuid(),
  toTableId: z.string().uuid(),
});

module.exports = { openSession, tablesBody, transferBody };

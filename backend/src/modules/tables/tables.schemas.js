const { z } = require('zod');

const tableStatus = z.enum([
  'AVAILABLE',
  'OCCUPIED',
  'RESERVED',
  'CLEANING',
  'DISABLED',
  'INACTIVE',
]);

const createTable = z.object({
  number: z.string().trim().min(1).max(40),
  capacity: z.coerce.number().int().positive().max(100),
  section: z.string().trim().max(80).optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
  isActive: z.boolean().optional(),
});

const updateTable = createTable.partial();

const statusBody = z.object({
  status: tableStatus,
});

module.exports = { createTable, updateTable, statusBody, tableStatus };

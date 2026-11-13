/**
 * Optional development / demo catalog seed.
 * Adds sample payment methods, tables, expense categories, menu, and inventory.
 * Safe to run after core seed. Does not replace restaurant profile if already customized.
 *
 * Usage: npm run db:seed:demo
 */
const { seedCleanMenu } = require('./seedMenu');
const { seedInventoryDataset } = require('./seedInventory');

const DEMO_PAYMENT_METHODS = [
  { code: 'CARD', name: 'Debit/Credit Card', isCash: false, sortOrder: 2, taxRate: 8 },
  { code: 'BANK_TRANSFER', name: 'Bank Transfer', isCash: false, sortOrder: 3, taxRate: 8 },
  { code: 'EASYPAISA', name: 'Easypaisa', isCash: false, sortOrder: 4, taxRate: 8 },
  { code: 'JAZZCASH', name: 'JazzCash', isCash: false, sortOrder: 5, taxRate: 8 },
];

const DEMO_EXPENSE_CATEGORIES = [
  'Rent',
  'Salaries',
  'Electricity',
  'Gas',
  'Water',
  'Kitchen Supplies',
  'Cleaning Supplies',
  'Maintenance',
  'Marketing',
  'Internet',
  'Miscellaneous',
];

const DEMO_TABLES = [
  ...Array.from({ length: 7 }, (_, i) => ({
    number: `GF-T${i + 1}`,
    capacity: i < 2 ? 2 : i < 5 ? 4 : 6,
    section: 'Ground Floor',
  })),
  ...Array.from({ length: 8 }, (_, i) => ({
    number: `FF-T${i + 1}`,
    capacity: i < 3 ? 2 : i < 6 ? 4 : 6,
    section: 'First Floor',
  })),
];

async function seedDemo(prisma) {
  console.log('Seeding optional demo catalog...');

  const restaurant = await prisma.restaurant.findFirst({
    where: { isActive: true, deletedAt: null },
  });
  if (!restaurant) {
    throw new Error('No restaurant found. Run core seed first (npm run db:seed).');
  }

  for (const method of DEMO_PAYMENT_METHODS) {
    await prisma.paymentMethod.upsert({
      where: { code: method.code },
      update: {
        name: method.name,
        isCash: method.isCash,
        sortOrder: method.sortOrder,
        taxRate: method.taxRate,
        isActive: true,
        deletedAt: null,
      },
      create: method,
    });
  }

  for (const table of DEMO_TABLES) {
    const existing = await prisma.diningTable.findFirst({
      where: {
        restaurantId: restaurant.id,
        number: { equals: table.number, mode: 'insensitive' },
        deletedAt: null,
      },
    });
    if (existing) {
      await prisma.diningTable.update({
        where: { id: existing.id },
        data: {
          capacity: table.capacity,
          section: table.section,
          isActive: true,
        },
      });
    } else {
      await prisma.diningTable.create({
        data: {
          restaurantId: restaurant.id,
          number: table.number,
          capacity: table.capacity,
          section: table.section,
          status: 'AVAILABLE',
          isActive: true,
        },
      });
    }
  }

  for (const name of DEMO_EXPENSE_CATEGORIES) {
    await prisma.expenseCategory.upsert({
      where: { name },
      update: { isActive: true, deletedAt: null },
      create: { name },
    });
  }

  await seedCleanMenu(prisma);
  await seedInventoryDataset(prisma);

  console.log('Demo catalog seed complete.');
}

async function main() {
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  try {
    await seedDemo(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { seedDemo };

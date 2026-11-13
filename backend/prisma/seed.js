/**
 * Production / core bootstrap seed.
 * Creates auth, restaurant shell, Cash payment method, units, and kitchen stations.
 * Does NOT load demo menu, inventory, tables, or sample expense categories.
 *
 * Optional demo catalog: npm run db:seed:demo  (or SEED_DEMO=1 npm run db:seed)
 */
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

const PERMISSIONS = [
  { code: 'menu.view', description: 'View menu' },
  { code: 'menu.create', description: 'Create menu items' },
  { code: 'menu.update', description: 'Update menu items' },
  { code: 'menu.delete', description: 'Delete menu items' },
  { code: 'orders.view', description: 'View orders' },
  { code: 'orders.create', description: 'Create orders' },
  { code: 'orders.update', description: 'Update orders' },
  { code: 'orders.cancel', description: 'Cancel orders' },
  { code: 'orders.split', description: 'Split order items into another bill' },
  { code: 'kitchen.view', description: 'View kitchen tickets' },
  { code: 'kitchen.update', description: 'Update kitchen ticket status' },
  { code: 'kitchen.manage', description: 'Manage kitchen display settings and history' },
  { code: 'payments.create', description: 'Process payments' },
  { code: 'payments.refund', description: 'Issue refunds' },
  { code: 'payments.approve_refund', description: 'Approve sales returns and voids' },
  { code: 'payments.view', description: 'View payments' },
  { code: 'payments.manage_methods', description: 'Manage payment methods and tax rates' },
  { code: 'billing.view', description: 'View billing quotes and settlement' },
  { code: 'billing.discount', description: 'Apply order discounts' },
  { code: 'billing.complimentary', description: 'Mark orders complimentary' },
  { code: 'billing.write_off', description: 'Write off unpaid orders' },
  { code: 'inventory.view', description: 'View inventory' },
  { code: 'inventory.update', description: 'Update inventory' },
  { code: 'inventory.allow_negative', description: 'Allow sales that would leave ingredient stock negative' },
  { code: 'suppliers.manage', description: 'Manage suppliers' },
  { code: 'purchases.manage', description: 'Manage purchase orders' },
  { code: 'customers.view', description: 'View customers' },
  { code: 'customers.manage', description: 'Manage customers' },
  { code: 'employees.manage', description: 'Manage employees' },
  { code: 'shifts.manage', description: 'Manage cashier shifts' },
  { code: 'expenses.manage', description: 'Manage expenses' },
  { code: 'reports.view', description: 'View reports and dashboard' },
  { code: 'reports.financial', description: 'View financial reports' },
  { code: 'settings.manage', description: 'Manage restaurant settings' },
  { code: 'pos.access', description: 'Access POS terminal' },
  { code: 'tables.view', description: 'View dining tables' },
  { code: 'tables.manage', description: 'Manage dining tables' },
  { code: 'sessions.manage', description: 'Open and close table sessions' },
];

const ROLE_PERMISSIONS = {
  ADMIN: PERMISSIONS.map((p) => p.code),
  MANAGER: [
    'menu.view', 'menu.create', 'menu.update',
    'orders.view', 'orders.create', 'orders.update', 'orders.cancel', 'orders.split',
    'kitchen.view', 'kitchen.update', 'kitchen.manage',
    'payments.create', 'payments.refund', 'payments.approve_refund', 'payments.view', 'payments.manage_methods',
    'billing.view', 'billing.discount', 'billing.complimentary', 'billing.write_off',
    'inventory.view', 'inventory.update', 'inventory.allow_negative',
    'suppliers.manage', 'purchases.manage',
    'customers.view', 'customers.manage',
    'employees.manage', 'shifts.manage',
    'expenses.manage', 'reports.view', 'reports.financial', 'settings.manage', 'pos.access',
    'tables.view', 'tables.manage', 'sessions.manage',
  ],
  CASHIER: [
    'menu.view',
    'orders.view', 'orders.create', 'orders.update', 'orders.split',
    'payments.create', 'payments.view', 'payments.refund',
    'billing.view', 'billing.discount',
    'customers.view', 'customers.manage',
    'shifts.manage',
    'pos.access',
    'tables.view', 'sessions.manage',
  ],
  WAITER: [
    'menu.view',
    'orders.view', 'orders.create', 'orders.update',
    'kitchen.view',
    'customers.view',
    'pos.access',
    'tables.view', 'sessions.manage',
  ],
  CHEF: [
    'kitchen.view', 'kitchen.update', 'kitchen.manage',
    'orders.view',
    'menu.view',
  ],
  INVENTORY_MANAGER: [
    'inventory.view', 'inventory.update', 'inventory.allow_negative',
    'suppliers.manage', 'purchases.manage',
    'menu.view',
    'reports.view',
  ],
};

/** Core operational units — measurement system, not demo catalog */
const UNITS = [
  { code: 'KG', name: 'Kilograms (kg)', dimension: 'MASS', toBaseFactor: 1000 },
  { code: 'G', name: 'Grams (g)', dimension: 'MASS', toBaseFactor: 1 },
  { code: 'L', name: 'Litres (litre)', dimension: 'VOLUME', toBaseFactor: 1000 },
  { code: 'ML', name: 'Millilitres (ml)', dimension: 'VOLUME', toBaseFactor: 1 },
  { code: 'PCS', name: 'Pieces (piece)', dimension: 'COUNT', toBaseFactor: 1 },
  { code: 'PKT', name: 'Packets (packet)', dimension: 'COUNT', toBaseFactor: 1 },
  { code: 'BOX', name: 'Boxes (box)', dimension: 'COUNT', toBaseFactor: 1 },
];

/** Core kitchen stations — empty menu until admin adds items */
const STATIONS = [
  { code: 'GRILL', name: 'Grill' },
  { code: 'PIZZA', name: 'Pizza' },
  { code: 'FRYER', name: 'Fryer' },
  { code: 'DRINKS', name: 'Drinks' },
  { code: 'GENERAL', name: 'General kitchen' },
];

async function upsertPermission(p) {
  return prisma.permission.upsert({
    where: { code: p.code },
    update: { description: p.description },
    create: p,
  });
}

async function upsertRole(name, description) {
  return prisma.role.upsert({
    where: { name },
    update: { description },
    create: { name, description },
  });
}

async function seedCore() {
  console.log('Seeding core (auth, restaurant shell, units, stations)...');

  for (const p of PERMISSIONS) {
    await upsertPermission(p);
  }

  const allPermissions = await prisma.permission.findMany();
  const permissionByCode = Object.fromEntries(allPermissions.map((p) => [p.code, p]));

  for (const [roleName, codes] of Object.entries(ROLE_PERMISSIONS)) {
    const role = await upsertRole(roleName, `${roleName} role`);
    for (const code of codes) {
      const permission = permissionByCode[code];
      if (!permission) continue;
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: role.id,
            permissionId: permission.id,
          },
        },
        update: {},
        create: {
          roleId: role.id,
          permissionId: permission.id,
        },
      });
    }
  }

  const passwordHash = await bcrypt.hash('Admin@123', 10);
  const adminRole = await prisma.role.findUnique({ where: { name: 'ADMIN' } });

  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {
      passwordHash,
      name: 'System Admin',
      isActive: true,
      deletedAt: null,
    },
    create: {
      username: 'admin',
      email: 'admin@restaurant.local',
      passwordHash,
      name: 'System Admin',
      isActive: true,
    },
  });

  await prisma.userRole.upsert({
    where: {
      userId_roleId: {
        userId: admin.id,
        roleId: adminRole.id,
      },
    },
    update: {},
    create: {
      userId: admin.id,
      roleId: adminRole.id,
    },
  });

  let restaurant = await prisma.restaurant.findFirst({ where: { isActive: true } });
  if (!restaurant) {
    restaurant = await prisma.restaurant.create({
      data: {
        name: 'My Restaurant',
        address: null,
        phone: null,
        email: null,
        settings: {
          create: {
            taxRate: 0,
            serviceChargeType: 'PERCENT',
            serviceChargeValue: 0,
            deliveryFeeDefault: 0,
            currencyCode: 'PKR',
            timezone: 'Asia/Karachi',
            receiptFooter: null,
            allowPartialPayments: true,
            autoReleaseTableOnPayment: false,
            tableCleaningMinutes: 2,
          },
        },
      },
    });
  } else {
    await prisma.restaurantSettings.upsert({
      where: { restaurantId: restaurant.id },
      update: {},
      create: {
        restaurantId: restaurant.id,
        taxRate: 0,
        serviceChargeType: 'PERCENT',
        serviceChargeValue: 0,
        deliveryFeeDefault: 0,
        currencyCode: 'PKR',
        timezone: 'Asia/Karachi',
        receiptFooter: null,
        allowPartialPayments: true,
        autoReleaseTableOnPayment: false,
        tableCleaningMinutes: 2,
      },
    });
  }

  // Cash is required by billing (cannot be deleted); other methods via Settings or demo seed
  await prisma.paymentMethod.upsert({
    where: { code: 'CASH' },
    update: {
      name: 'Cash',
      isCash: true,
      sortOrder: 1,
      isActive: true,
      deletedAt: null,
    },
    create: {
      code: 'CASH',
      name: 'Cash',
      isCash: true,
      sortOrder: 1,
      taxRate: 0,
      isActive: true,
    },
  });

  for (const unit of UNITS) {
    await prisma.unit.upsert({
      where: { code: unit.code },
      update: {
        name: unit.name,
        dimension: unit.dimension,
        toBaseFactor: unit.toBaseFactor,
      },
      create: unit,
    });
  }

  for (const station of STATIONS) {
    await prisma.kitchenStation.upsert({
      where: { code: station.code },
      update: { name: station.name, isActive: true },
      create: station,
    });
  }

  console.log('Core seed complete.');
  console.log('Admin login → username: admin / password: Admin@123 (change after first login)');
  console.log('Optional demo catalog: npm run db:seed:demo');
  return restaurant;
}

async function main() {
  await seedCore();
  if (process.env.SEED_DEMO === '1') {
    const { seedDemo } = require('./seedDemo');
    await seedDemo(prisma);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

module.exports = { seedCore, PERMISSIONS, ROLE_PERMISSIONS };

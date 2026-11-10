const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const { seedCleanMenu } = require('./seedMenu');

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
  { code: 'tables.view', description: 'View tables' },
  { code: 'tables.manage', description: 'Manage tables' },
  { code: 'sessions.manage', description: 'Manage table sessions' },
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
];

const ROLE_PERMISSIONS = {
  ADMIN: PERMISSIONS.map((p) => p.code),
  MANAGER: [
    'menu.view', 'menu.create', 'menu.update',
    'orders.view', 'orders.create', 'orders.update', 'orders.cancel', 'orders.split',
    'tables.view', 'tables.manage', 'sessions.manage',
    'kitchen.view', 'kitchen.update', 'kitchen.manage',
    'payments.create', 'payments.refund', 'payments.approve_refund', 'payments.view', 'payments.manage_methods',
    'billing.view', 'billing.discount', 'billing.complimentary', 'billing.write_off',
    'inventory.view', 'inventory.update', 'inventory.allow_negative',
    'suppliers.manage', 'purchases.manage',
    'customers.view', 'customers.manage',
    'employees.manage', 'shifts.manage',
    'expenses.manage', 'reports.view', 'reports.financial', 'settings.manage', 'pos.access',
  ],
  CASHIER: [
    'menu.view',
    'orders.view', 'orders.create', 'orders.update', 'orders.split',
    'tables.view', 'sessions.manage',
    'payments.create', 'payments.view', 'payments.refund',
    'billing.view', 'billing.discount',
    'customers.view', 'customers.manage',
    'shifts.manage',
    'pos.access',
  ],
  WAITER: [
    'menu.view',
    'orders.view', 'orders.create', 'orders.update',
    'tables.view', 'tables.manage', 'sessions.manage',
    'kitchen.view',
    'customers.view',
    'pos.access',
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

const PAYMENT_METHODS = [
  { code: 'CASH', name: 'Cash', isCash: true, sortOrder: 1, taxRate: 14 },
  { code: 'CARD', name: 'Debit/Credit Card', isCash: false, sortOrder: 2, taxRate: 8 },
  { code: 'BANK_TRANSFER', name: 'Bank Transfer', isCash: false, sortOrder: 3, taxRate: 8 },
  { code: 'EASYPAISA', name: 'Easypaisa', isCash: false, sortOrder: 4, taxRate: 8 },
  { code: 'JAZZCASH', name: 'JazzCash', isCash: false, sortOrder: 5, taxRate: 8 },
];

const UNITS = [
  { code: 'KG', name: 'Kilograms (kg)' },
  { code: 'G', name: 'Grams (g)' },
  { code: 'L', name: 'Litres (litre)' },
  { code: 'ML', name: 'Millilitres (ml)' },
  { code: 'PCS', name: 'Pieces (piece)' },
  { code: 'PKT', name: 'Packets (packet)' },
  { code: 'BOX', name: 'Boxes (box)' },
];

const INVENTORY_CATEGORIES = [
  { name: 'Meat & Poultry', description: 'Meat and poultry ingredients' },
  { name: 'Vegetables', description: 'Fresh and prepared vegetables' },
  { name: 'Dairy Products', description: 'Milk, cheese and dairy' },
  { name: 'Beverages', description: 'Drink ingredients and bottles' },
  { name: 'Spices & Sauces', description: 'Spices, sauces and condiments' },
  { name: 'Packaging', description: 'Boxes, bags and packaging' },
];

const STATIONS = [
  { code: 'GRILL', name: 'Grill' },
  { code: 'PIZZA', name: 'Pizza' },
  { code: 'FRYER', name: 'Fryer' },
  { code: 'DRINKS', name: 'Drinks' },
  { code: 'GENERAL', name: 'General kitchen' },
];

const EXPENSE_CATEGORIES = [
  'Rent',
  'Electricity',
  'Gas',
  'Salaries',
  'Maintenance',
  'Cleaning',
  'Other expenses',
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

async function main() {
  console.log('Seeding database...');

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
        name: 'Demo Restaurant',
        address: '123 Main Street, Karachi',
        phone: '+92-300-0000000',
        email: 'info@demorestaurant.local',
        settings: {
          create: {
            taxRate: 5,
            serviceChargeType: 'PERCENT',
            serviceChargeValue: 0,
            deliveryFeeDefault: 100,
            currencyCode: 'PKR',
            timezone: 'Asia/Karachi',
            receiptFooter: 'Thank you for dining with us!',
            allowPartialPayments: true,
            autoReleaseTableOnPayment: true,
            useCleaningStatus: false,
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
        taxRate: 5,
        serviceChargeType: 'PERCENT',
        serviceChargeValue: 0,
        deliveryFeeDefault: 100,
        currencyCode: 'PKR',
        timezone: 'Asia/Karachi',
        receiptFooter: 'Thank you for dining with us!',
        allowPartialPayments: true,
        autoReleaseTableOnPayment: true,
        useCleaningStatus: false,
      },
    });
  }

  for (const method of PAYMENT_METHODS) {
    await prisma.paymentMethod.upsert({
      where: { code: method.code },
      update: {
        name: method.name,
        isCash: method.isCash,
        sortOrder: method.sortOrder,
        taxRate: method.taxRate,
        isActive: true,
      },
      create: method,
    });
  }

  for (const unit of UNITS) {
    await prisma.unit.upsert({
      where: { code: unit.code },
      update: { name: unit.name },
      create: unit,
    });
  }

  for (const cat of INVENTORY_CATEGORIES) {
    const existing = await prisma.inventoryCategory.findFirst({
      where: { name: { equals: cat.name, mode: 'insensitive' }, deletedAt: null },
    });
    if (existing) {
      await prisma.inventoryCategory.update({
        where: { id: existing.id },
        data: { description: cat.description, isActive: true },
      });
    } else {
      await prisma.inventoryCategory.create({
        data: { name: cat.name, description: cat.description, isActive: true },
      });
    }
  }

  for (const station of STATIONS) {
    await prisma.kitchenStation.upsert({
      where: { code: station.code },
      update: { name: station.name, isActive: true },
      create: station,
    });
  }

  // Clean restaurant menu (categories, products, variants, modifiers, local images).
  // Soft-archives timestamp/test leftovers; never hard-deletes historical order refs.
  await seedCleanMenu(prisma);

  for (const name of EXPENSE_CATEGORIES) {
    await prisma.expenseCategory.upsert({
      where: { name },
      update: { isActive: true },
      create: { name },
    });
  }

  const desiredTables = [
    ...Array.from({ length: 7 }, (_, i) => ({
      number: `GF-T${i + 1}`,
      capacity: 4,
      section: 'Ground Floor',
    })),
    ...Array.from({ length: 8 }, (_, i) => ({
      number: `FF-T${i + 1}`,
      capacity: 4,
      section: 'First Floor',
    })),
  ];
  for (const table of desiredTables) {
    const existing = await prisma.diningTable.findFirst({
      where: { restaurantId: restaurant.id, number: table.number, deletedAt: null },
    });
    if (existing) {
      await prisma.diningTable.update({
        where: { id: existing.id },
        data: { section: table.section, isActive: true },
      });
    } else {
      await prisma.diningTable.create({
        data: {
          restaurantId: restaurant.id,
          ...table,
          status: 'AVAILABLE',
          isActive: true,
        },
      });
    }
  }

  console.log('Seed complete.');
  console.log('Admin login → username: admin / password: Admin@123');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

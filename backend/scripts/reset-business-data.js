/**
 * Wipe all restaurant / POS business data while preserving login credentials.
 *
 * PRESERVED (authentication):
 *   User, Role, Permission, UserRole, RolePermission
 *
 * PRESERVED (application shell — required so Settings / Tables APIs do not 404):
 *   Restaurant (1 row, contact fields cleared to defaults)
 *   RestaurantSettings (reset to schema defaults)
 *
 * DELETED: all other Prisma models' rows, plus uploaded menu images.
 *
 * SAFETY:
 *   - Refuses non-local DATABASE_URL / unknown DB names unless ALLOW_DATA_RESET=1
 *     (allowed local names: restaurant_pos, pos_db)
 *   - Requires CONFIRM=YES
 *   - Writes a JSON backup under backups/ before deletion
 *   - Never runs migrate reset / drop database / drop tables
 *   - Never modifies password hashes or auth tables
 *
 * Usage:
 *   CONFIRM=YES npm run db:reset-data
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const AUTH_MODELS = ['user', 'role', 'permission', 'userRole', 'rolePermission'];

const SHELL_MODELS = ['restaurant', 'restaurantSettings'];

/** Deletion order: children before parents (respects FKs). */
const DELETE_ORDER = [
  'orderItemModifier',
  'orderDiscount',
  'orderStatusHistory',
  'kitchenTicketItem',
  'kitchenTicket',
  'printJob',
  'receipt',
  'refund',
  'payment',
  'orderInventoryDeduction',
  'orderItem',
  'order',
  'orderSequence',
  'sessionTable',
  'tableSession',
  'inventoryTransaction',
  'wastageRecord',
  'recipeItem',
  'recipe',
  'modifierIngredient',
  'purchaseOrderItem',
  'purchaseOrder',
  'ingredient',
  'inventoryCategory',
  'supplier',
  'expense',
  'expenseCategory',
  'menuItemModifierGroup',
  'menuVariant',
  'menuItem',
  'modifier',
  'modifierGroup',
  'menuCategory',
  'kitchenStation',
  'customerAddress',
  'customer',
  'diningTable',
  'employeeShift',
  'paymentMethod',
  'unit',
  'auditLog',
  'outboxEvent',
];

function assertDevDatabase() {
  const url = process.env.DATABASE_URL || '';
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('DATABASE_URL is missing or invalid — aborting');
  }
  const host = parsed.hostname;
  const db = decodeURIComponent(parsed.pathname.replace(/^\//, '').split('?')[0]);
  const local = host === '127.0.0.1' || host === 'localhost';
  const knownDevDb = db === 'restaurant_pos' || db === 'pos_db';

  if (process.env.ALLOW_DATA_RESET === '1') {
    console.log('ALLOW_DATA_RESET=1 — bypassing local DB name check');
    return { host, db, url };
  }
  if (!local || !knownDevDb) {
    throw new Error(
      `Refusing reset: host=${host} db=${db}. Expected local restaurant_pos or pos_db (or set ALLOW_DATA_RESET=1).`
    );
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing reset: NODE_ENV=production');
  }
  return { host, db, url };
}

function requireConfirmation() {
  if (process.env.CONFIRM !== 'YES') {
    throw new Error(
      'Refusing reset without confirmation. Re-run with CONFIRM=YES npm run db:reset-data'
    );
  }
}

async function snapshotAuth(prisma) {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      username: true,
      email: true,
      name: true,
      passwordHash: true,
      isActive: true,
      roles: { select: { role: { select: { name: true } } } },
    },
    orderBy: { username: 'asc' },
  });
  return users.map((u) => ({
    id: u.id,
    username: u.username,
    email: u.email,
    name: u.name,
    passwordHash: u.passwordHash,
    isActive: u.isActive,
    roles: u.roles.map((r) => r.role.name),
  }));
}

async function countAll(prisma) {
  const models = [...AUTH_MODELS, ...SHELL_MODELS, ...DELETE_ORDER];
  const counts = {};
  for (const m of models) {
    counts[m] = await prisma[m].count();
  }
  return counts;
}

async function writeBackup(prisma, target) {
  const backupDir = path.join(__dirname, '..', 'backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(backupDir, `restaurant_pos_pre_reset_${stamp}.json`);

  const payload = {
    createdAt: new Date().toISOString(),
    database: { host: target.host, db: target.db },
    note: 'Full-row JSON backup before business-data reset. Auth tables included for restore safety.',
    tables: {},
  };

  const models = [...AUTH_MODELS, ...SHELL_MODELS, ...DELETE_ORDER];
  for (const m of models) {
    payload.tables[m] = await prisma[m].findMany();
  }

  fs.writeFileSync(file, JSON.stringify(payload, null, 2));
  return file;
}

function clearUploadFiles() {
  const uploadRoot = path.resolve(
    __dirname,
    '..',
    process.env.UPLOAD_DIR || 'uploads'
  );
  if (!fs.existsSync(uploadRoot)) {
    return { cleared: 0, root: uploadRoot };
  }
  let cleared = 0;
  function walk(dir) {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      const st = fs.statSync(full);
      if (st.isDirectory()) walk(full);
      else {
        fs.unlinkSync(full);
        cleared += 1;
      }
    }
  }
  walk(uploadRoot);
  return { cleared, root: uploadRoot };
}

async function resetRestaurantShell(prisma) {
  const restaurant = await prisma.restaurant.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!restaurant) {
    await prisma.restaurant.create({
      data: {
        name: 'My Restaurant',
        address: null,
        phone: null,
        email: null,
        isActive: true,
        settings: {
          create: {
            taxRate: 0,
            serviceChargeType: 'PERCENT',
            serviceChargeValue: 0,
            deliveryFeeDefault: 0,
            taxServiceCharge: false,
            taxDeliveryFee: false,
            currencyCode: 'PKR',
            timezone: 'Asia/Karachi',
            receiptFooter: null,
            allowPartialPayments: true,
            autoReleaseTableOnPayment: false,
            useCleaningStatus: false,
            tableCleaningMinutes: 2,
          },
        },
      },
    });
    return { action: 'created' };
  }

  await prisma.restaurant.update({
    where: { id: restaurant.id },
    data: {
      name: 'My Restaurant',
      address: null,
      phone: null,
      email: null,
      isActive: true,
      deletedAt: null,
    },
  });

  await prisma.restaurantSettings.upsert({
    where: { restaurantId: restaurant.id },
    update: {
      taxRate: 0,
      serviceChargeType: 'PERCENT',
      serviceChargeValue: 0,
      deliveryFeeDefault: 0,
      taxServiceCharge: false,
      taxDeliveryFee: false,
      currencyCode: 'PKR',
      timezone: 'Asia/Karachi',
      receiptFooter: null,
      allowPartialPayments: true,
      autoReleaseTableOnPayment: false,
      useCleaningStatus: false,
      tableCleaningMinutes: 2,
    },
    create: {
      restaurantId: restaurant.id,
      taxRate: 0,
      serviceChargeType: 'PERCENT',
      serviceChargeValue: 0,
      deliveryFeeDefault: 0,
      currencyCode: 'PKR',
      timezone: 'Asia/Karachi',
      allowPartialPayments: true,
      autoReleaseTableOnPayment: false,
      tableCleaningMinutes: 2,
    },
  });

  return { action: 'reset', restaurantId: restaurant.id };
}

async function main() {
  requireConfirmation();
  const target = assertDevDatabase();
  console.log(`Target database: ${target.host} / ${target.db}`);

  const prisma = new PrismaClient();
  try {
    const authBefore = await snapshotAuth(prisma);
    console.log(`Auth users to preserve: ${authBefore.map((u) => u.username).join(', ')}`);

    const countsBefore = await countAll(prisma);
    console.log('Writing backup…');
    const backupFile = await writeBackup(prisma, target);
    console.log(`Backup written: ${backupFile}`);

    console.log('Deleting business data (transaction)…');
    const deleted = {};

    await prisma.$transaction(
      async (tx) => {
        // Break self-FK on dining tables before delete
        await tx.diningTable.updateMany({ data: { mergedIntoTableId: null } });

        for (const model of DELETE_ORDER) {
          const result = await tx[model].deleteMany({});
          deleted[model] = result.count;
        }
        // Auth + restaurant shell intentionally untouched here
      },
      { timeout: 120_000 }
    );

    const shell = await resetRestaurantShell(prisma);
    console.log(`Restaurant shell: ${shell.action}`);

    const uploads = clearUploadFiles();
    console.log(`Upload files removed: ${uploads.cleared} from ${uploads.root}`);

    const authAfter = await snapshotAuth(prisma);
    const countsAfter = await countAll(prisma);

    // Verify auth unchanged
    if (authBefore.length !== authAfter.length) {
      throw new Error('Auth user count changed — aborting post-check (investigate backup)');
    }
    for (let i = 0; i < authBefore.length; i += 1) {
      const a = authBefore[i];
      const b = authAfter.find((u) => u.id === a.id);
      if (!b) throw new Error(`User missing after reset: ${a.username}`);
      if (b.passwordHash !== a.passwordHash) {
        throw new Error(`Password hash changed for ${a.username}`);
      }
      if (b.username !== a.username || b.email !== a.email) {
        throw new Error(`User identity changed for ${a.username}`);
      }
    }

    const roleCount = await prisma.role.count();
    const permCount = await prisma.permission.count();
    const userRoleCount = await prisma.userRole.count();
    const rolePermCount = await prisma.rolePermission.count();

    console.log('\n=== Reset complete ===');
    console.log(JSON.stringify({ deleted, countsBefore, countsAfter }, null, 2));
    console.log(
      `Auth preserved: users=${authAfter.length} roles=${roleCount} permissions=${permCount} userRoles=${userRoleCount} rolePermissions=${rolePermCount}`
    );
    console.log(`Backup: ${backupFile}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});

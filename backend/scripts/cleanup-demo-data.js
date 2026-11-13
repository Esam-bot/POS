/**
 * Controlled cleanup of demo/test restaurant business data.
 * Preserves schema, migrations, auth, roles, permissions, restaurant settings,
 * units, payment methods, kitchen stations, and dining tables.
 *
 * SAFETY: refuses to run unless DATABASE_URL points at local 127.0.0.1/localhost
 * and database name restaurant_pos or pos_db (or ALLOW_DEMO_CLEANUP=1).
 *
 * Does NOT run prisma migrate reset / drop database.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { PrismaClient } = require('@prisma/client');
const { softArchiveNonCatalogMenu } = require('../prisma/seedMenu');
const { softArchiveNonCatalogInventory } = require('../prisma/seedInventory');

function assertDevDatabase() {
  const url = process.env.DATABASE_URL || '';
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('DATABASE_URL is missing or invalid — aborting cleanup');
  }
  const host = parsed.hostname;
  const db = decodeURIComponent(parsed.pathname.replace(/^\//, '').split('?')[0]);
  const local = host === '127.0.0.1' || host === 'localhost';
  const knownDevDb = db === 'restaurant_pos' || db === 'pos_db';
  if (process.env.ALLOW_DEMO_CLEANUP === '1') {
    console.log('ALLOW_DEMO_CLEANUP=1 — proceeding');
    return { host, db };
  }
  if (!local || !knownDevDb) {
    throw new Error(
      `Refusing cleanup: host=${host} db=${db}. Expected local restaurant_pos or pos_db (or set ALLOW_DEMO_CLEANUP=1).`
    );
  }
  return { host, db };
}

async function main() {
  const target = assertDevDatabase();
  console.log(`Cleaning demo data on ${target.host} / ${target.db} ...`);

  const prisma = new PrismaClient();
  try {
    // Purchase orders (no soft-delete) — remove demo purchasing history
    const poItemCount = await prisma.purchaseOrderItem.deleteMany({});
    const poCount = await prisma.purchaseOrder.deleteMany({});
    console.log(`  purchase_order_items deleted=${poItemCount.count}`);
    console.log(`  purchase_orders deleted=${poCount.count}`);

    const suppliers = await prisma.supplier.updateMany({
      where: { deletedAt: null },
      data: { deletedAt: new Date(), isActive: false },
    });
    console.log(`  suppliers soft-archived=${suppliers.count}`);

    // Inventory history for non-catalog / all current demo ingredients will be pruned after archive
    const archivedInv = await softArchiveNonCatalogInventory(prisma);
    console.log('  inventory archive:', archivedInv);

    // Clear inventory history (demo/test). Opening stock is applied by seed without txns.
    const txn = await prisma.inventoryTransaction.deleteMany({});
    const waste = await prisma.wastageRecord.deleteMany({});
    const deductions = await prisma.orderInventoryDeduction.deleteMany({});
    console.log(`  inventory_transactions deleted=${txn.count}`);
    console.log(`  wastage_records deleted=${waste.count}`);
    console.log(`  order_inventory_deductions deleted=${deductions.count}`);

    // Clear modifier→ingredient links (modifiers may be archived with menu cleanup)
    const modIng = await prisma.modifierIngredient.deleteMany({});
    console.log(`  modifier_ingredients deleted=${modIng.count}`);

    const archivedMenu = await softArchiveNonCatalogMenu(prisma);
    console.log('  menu archive:', archivedMenu);

    console.log('Demo cleanup complete. Run: npm run db:seed');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});

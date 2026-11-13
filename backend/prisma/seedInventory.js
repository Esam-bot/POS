/**
 * Idempotent inventory categories, ingredients, and recipes for the minimal restaurant dataset.
 * Opening stock is set to an absolute value (never incremented on re-seed).
 * No inventory transactions are created for opening stock.
 */

const INVENTORY_CATEGORIES = [
  { name: 'Meat', description: 'Meat ingredients' },
  { name: 'Bakery', description: 'Bakery ingredients' },
  { name: 'Dairy', description: 'Dairy ingredients' },
  { name: 'Sauces', description: 'Sauces and condiments' },
  { name: 'Vegetables', description: 'Vegetables and produce' },
  { name: 'Beverages', description: 'Beverage stock' },
];

const INGREDIENTS = [
  { sku: 'INV-BEEF', name: 'Beef', category: 'Meat', unit: 'G', openingStock: 5000, minStock: 1000, avgCost: 0.8 },
  { sku: 'INV-CHICKEN', name: 'Chicken', category: 'Meat', unit: 'G', openingStock: 5000, minStock: 1000, avgCost: 0.6 },
  { sku: 'INV-BUN', name: 'Burger Bun', category: 'Bakery', unit: 'PCS', openingStock: 50, minStock: 10, avgCost: 25 },
  { sku: 'INV-DOUGH', name: 'Pizza Dough', category: 'Bakery', unit: 'PCS', openingStock: 20, minStock: 5, avgCost: 40 },
  { sku: 'INV-CHEESE', name: 'Cheese', category: 'Dairy', unit: 'G', openingStock: 2000, minStock: 500, avgCost: 1.2 },
  { sku: 'INV-MAYO', name: 'Mayonnaise', category: 'Sauces', unit: 'ML', openingStock: 2000, minStock: 500, avgCost: 0.3 },
  { sku: 'INV-LETTUCE', name: 'Lettuce', category: 'Vegetables', unit: 'G', openingStock: 1000, minStock: 200, avgCost: 0.2 },
  { sku: 'INV-TOMATO', name: 'Tomato', category: 'Vegetables', unit: 'G', openingStock: 1000, minStock: 200, avgCost: 0.25 },
  { sku: 'INV-FRIES', name: 'French Fries', category: 'Vegetables', unit: 'G', openingStock: 3000, minStock: 500, avgCost: 0.15 },
  { sku: 'INV-COLD-DRINK', name: 'Cold Drink Bottle', category: 'Beverages', unit: 'PCS', openingStock: 50, minStock: 10, avgCost: 80 },
];

const KEEP_INGREDIENT_SKUS = new Set(INGREDIENTS.map((i) => i.sku));
const KEEP_INV_CATEGORY_NAMES = new Set(INVENTORY_CATEGORIES.map((c) => c.name.toLowerCase()));

/** menu product name → recipe lines { ingredientName, quantity } */
const RECIPES = {
  'Classic Beef Burger': [
    { ingredient: 'Beef', quantity: 150 },
    { ingredient: 'Burger Bun', quantity: 1 },
    { ingredient: 'Cheese', quantity: 20 },
    { ingredient: 'Mayonnaise', quantity: 20 },
    { ingredient: 'Lettuce', quantity: 15 },
    { ingredient: 'Tomato', quantity: 20 },
  ],
  'Chicken Burger': [
    { ingredient: 'Chicken', quantity: 150 },
    { ingredient: 'Burger Bun', quantity: 1 },
    { ingredient: 'Cheese', quantity: 20 },
    { ingredient: 'Mayonnaise', quantity: 20 },
    { ingredient: 'Lettuce', quantity: 15 },
  ],
  'Margherita Pizza': [
    { ingredient: 'Pizza Dough', quantity: 1 },
    { ingredient: 'Cheese', quantity: 150 },
    { ingredient: 'Tomato', quantity: 100 },
  ],
  'Chicken Sandwich': [
    { ingredient: 'Chicken', quantity: 100 },
    { ingredient: 'Burger Bun', quantity: 1 },
    { ingredient: 'Mayonnaise', quantity: 15 },
    { ingredient: 'Lettuce', quantity: 10 },
  ],
  'French Fries': [{ ingredient: 'French Fries', quantity: 150 }],
};

async function upsertInventoryCategory(prisma, cat) {
  const existing = await prisma.inventoryCategory.findFirst({
    where: { name: { equals: cat.name, mode: 'insensitive' }, deletedAt: null },
  });
  if (existing) {
    return prisma.inventoryCategory.update({
      where: { id: existing.id },
      data: { name: cat.name, description: cat.description, isActive: true },
    });
  }
  return prisma.inventoryCategory.create({
    data: { name: cat.name, description: cat.description, isActive: true },
  });
}

async function softArchiveNonCatalogInventory(prisma) {
  const now = new Date();

  const cats = await prisma.inventoryCategory.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true },
  });
  const dropCats = cats.filter((c) => !KEEP_INV_CATEGORY_NAMES.has(c.name.toLowerCase())).map((c) => c.id);
  const categoriesArchived = dropCats.length
    ? (
        await prisma.inventoryCategory.updateMany({
          where: { id: { in: dropCats } },
          data: { deletedAt: now, isActive: false },
        })
      ).count
    : 0;

  const ings = await prisma.ingredient.findMany({
    where: { deletedAt: null },
    select: { id: true, sku: true },
  });
  const dropIngs = ings.filter((i) => !KEEP_INGREDIENT_SKUS.has(i.sku)).map((i) => i.id);
  const ingredientsArchived = dropIngs.length
    ? (
        await prisma.ingredient.updateMany({
          where: { id: { in: dropIngs } },
          data: { deletedAt: now, isActive: false },
        })
      ).count
    : 0;

  // Soft-archive recipes for archived or non-catalog menu items
  const keepItems = await prisma.menuItem.findMany({
    where: { deletedAt: null, name: { in: Object.keys(RECIPES) } },
    select: { id: true },
  });
  const keepIds = new Set(keepItems.map((i) => i.id));
  const recipes = await prisma.recipe.findMany({
    where: { deletedAt: null },
    select: { id: true, menuItemId: true },
  });
  const dropRecipes = recipes.filter((r) => !keepIds.has(r.menuItemId)).map((r) => r.id);
  const recipesArchived = dropRecipes.length
    ? (
        await prisma.recipe.updateMany({
          where: { id: { in: dropRecipes } },
          data: { deletedAt: now, isActive: false },
        })
      ).count
    : 0;

  return { categoriesArchived, ingredientsArchived, recipesArchived };
}

async function upsertIngredient(prisma, def, categoryId, unitId) {
  let row = await prisma.ingredient.findFirst({ where: { sku: def.sku } });
  const data = {
    name: def.name,
    sku: def.sku,
    categoryId,
    unitId,
    currentStock: def.openingStock,
    minStock: def.minStock,
    avgCost: def.avgCost,
    reservedStock: 0,
    lowStockNotifiedAt: null,
    isActive: true,
    deletedAt: null,
  };

  if (row) {
    // Also claim an active row with the same name but different sku
    const byName = await prisma.ingredient.findFirst({
      where: {
        name: { equals: def.name, mode: 'insensitive' },
        deletedAt: null,
        NOT: { id: row.id },
      },
    });
    if (byName) {
      await prisma.ingredient.update({
        where: { id: byName.id },
        data: { deletedAt: new Date(), isActive: false, sku: `${byName.sku}-old-${Date.now()}` },
      });
    }
    row = await prisma.ingredient.update({ where: { id: row.id }, data });
  } else {
    const byName = await prisma.ingredient.findFirst({
      where: { name: { equals: def.name, mode: 'insensitive' }, deletedAt: null },
    });
    if (byName) {
      row = await prisma.ingredient.update({
        where: { id: byName.id },
        data: { ...data, sku: def.sku },
      });
    } else {
      row = await prisma.ingredient.create({ data });
    }
  }
  return row;
}

async function upsertRecipe(prisma, menuItemId, name, lines, ingredientByName) {
  let recipe = await prisma.recipe.findFirst({
    where: { menuItemId, variantId: null, deletedAt: null },
  });
  if (!recipe) {
    recipe = await prisma.recipe.findFirst({
      where: { menuItemId, variantId: null },
    });
  }

  if (recipe) {
    recipe = await prisma.recipe.update({
      where: { id: recipe.id },
      data: { name, yieldQty: 1, isActive: true, deletedAt: null },
    });
  } else {
    recipe = await prisma.recipe.create({
      data: { menuItemId, variantId: null, name, yieldQty: 1, isActive: true },
    });
  }

  await prisma.recipeItem.deleteMany({ where: { recipeId: recipe.id } });
  for (const line of lines) {
    const ing = ingredientByName[line.ingredient.toLowerCase()];
    if (!ing) throw new Error(`Recipe ingredient missing: ${line.ingredient}`);
    await prisma.recipeItem.create({
      data: {
        recipeId: recipe.id,
        ingredientId: ing.id,
        quantity: line.quantity,
      },
    });
  }
  return recipe;
}

async function seedInventoryDataset(prisma) {
  console.log('Seeding inventory categories...');
  const categoryByName = {};
  for (const cat of INVENTORY_CATEGORIES) {
    categoryByName[cat.name] = await upsertInventoryCategory(prisma, cat);
  }

  const units = await prisma.unit.findMany();
  const unitByCode = Object.fromEntries(units.map((u) => [u.code.toUpperCase(), u]));

  console.log('Seeding ingredients (absolute opening stock, no transactions)...');
  const ingredientByName = {};
  for (const def of INGREDIENTS) {
    const cat = categoryByName[def.category];
    const unit = unitByCode[def.unit.toUpperCase()];
    if (!cat || !unit) throw new Error(`Missing category/unit for ${def.name}`);
    const row = await upsertIngredient(prisma, def, cat.id, unit.id);
    ingredientByName[def.name.toLowerCase()] = row;
    console.log(`  ingredient ok: ${def.name} (${def.openingStock} ${def.unit})`);
  }

  console.log('Seeding recipes...');
  for (const [productName, lines] of Object.entries(RECIPES)) {
    const menuItem = await prisma.menuItem.findFirst({
      where: { name: { equals: productName, mode: 'insensitive' }, deletedAt: null },
    });
    if (!menuItem) {
      console.warn(`  skip recipe — menu item not found: ${productName}`);
      continue;
    }
    await upsertRecipe(prisma, menuItem.id, `${productName} recipe`, lines, ingredientByName);
    if (!menuItem.trackInventory) {
      await prisma.menuItem.update({
        where: { id: menuItem.id },
        data: { trackInventory: true },
      });
    }
    console.log(`  recipe ok: ${productName} (${lines.length} lines)`);
  }

  // Cold Drink explicitly has no recipe / no inventory tracking
  await prisma.menuItem.updateMany({
    where: { name: { equals: 'Cold Drink', mode: 'insensitive' }, deletedAt: null },
    data: { trackInventory: false },
  });

  console.log('Archiving inventory outside the minimal catalog...');
  const archived = await softArchiveNonCatalogInventory(prisma);
  console.log(
    `  archived extras categories=${archived.categoriesArchived}, ingredients=${archived.ingredientsArchived}, recipes=${archived.recipesArchived}`
  );

  return {
    categoryCount: INVENTORY_CATEGORIES.length,
    ingredientCount: INGREDIENTS.length,
    recipeCount: Object.keys(RECIPES).length,
    archived,
  };
}

module.exports = {
  INVENTORY_CATEGORIES,
  INGREDIENTS,
  RECIPES,
  seedInventoryDataset,
  softArchiveNonCatalogInventory,
};

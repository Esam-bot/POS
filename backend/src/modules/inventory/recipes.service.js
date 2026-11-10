const prisma = require('../../config/db');
const AppError = require('../../utils/AppError');
const { parsePagination, paginatedResult } = require('../../utils/pagination');
const { serializeDecimals } = require('../../utils/decimal');

function presentRecipe(recipe) {
  return {
    id: recipe.id,
    menuItemId: recipe.menuItemId,
    menuItemName: recipe.menuItem?.name || null,
    variantId: recipe.variantId,
    variantName: recipe.variant?.name || null,
    name: recipe.name,
    yieldQty: recipe.yieldQty,
    isActive: recipe.isActive,
    items: (recipe.items || []).map((i) => ({
      id: i.id,
      ingredientId: i.ingredientId,
      ingredientName: i.ingredient?.name || null,
      unitName: i.ingredient?.unit?.name || null,
      quantity: i.quantity,
    })),
    updatedAt: recipe.updatedAt,
  };
}

async function listRecipes(query) {
  const { page, limit, skip } = parsePagination(query);
  const where = { deletedAt: null };
  if (query.isActive !== undefined) {
    where.isActive = query.isActive === true || query.isActive === 'true';
  }
  if (query.search) {
    where.menuItem = { name: { contains: query.search, mode: 'insensitive' } };
  }

  const [total, rows] = await Promise.all([
    prisma.recipe.count({ where }),
    prisma.recipe.findMany({
      where,
      skip,
      take: limit,
      orderBy: { updatedAt: 'desc' },
      include: {
        menuItem: { select: { id: true, name: true } },
        variant: { select: { id: true, name: true } },
        items: {
          include: { ingredient: { include: { unit: true } } },
          orderBy: { ingredient: { name: 'asc' } },
        },
      },
    }),
  ]);

  return paginatedResult(
    rows.map((r) => serializeDecimals(presentRecipe(r))),
    total,
    page,
    limit
  );
}

async function getRecipe(id) {
  const recipe = await prisma.recipe.findFirst({
    where: { id, deletedAt: null },
    include: {
      menuItem: { select: { id: true, name: true, trackInventory: true } },
      variant: { select: { id: true, name: true } },
      items: {
        include: { ingredient: { include: { unit: true } } },
        orderBy: { ingredient: { name: 'asc' } },
      },
    },
  });
  if (!recipe) throw new AppError('Recipe not found', 404);
  return serializeDecimals(presentRecipe(recipe));
}

async function upsertRecipe(data, userId) {
  const menuItem = await prisma.menuItem.findFirst({
    where: { id: data.menuItemId, deletedAt: null },
  });
  if (!menuItem) throw new AppError('Menu product not found', 404);

  if (data.variantId) {
    const variant = await prisma.menuVariant.findFirst({
      where: { id: data.variantId, menuItemId: data.menuItemId, deletedAt: null },
    });
    if (!variant) throw new AppError('Variant does not belong to this menu product', 422);
  }

  const ingredientIds = data.items.map((i) => i.ingredientId);
  if (new Set(ingredientIds).size !== ingredientIds.length) {
    throw new AppError('Duplicate ingredients in recipe', 422);
  }
  const ingredients = await prisma.ingredient.findMany({
    where: { id: { in: ingredientIds }, deletedAt: null, isActive: true },
  });
  if (ingredients.length !== ingredientIds.length) {
    throw new AppError('One or more ingredients are missing or inactive', 422);
  }

  const existing = await prisma.recipe.findFirst({
    where: {
      menuItemId: data.menuItemId,
      variantId: data.variantId || null,
      deletedAt: null,
    },
  });

  const recipe = await prisma.$transaction(async (tx) => {
    let row;
    if (existing) {
      await tx.recipeItem.deleteMany({ where: { recipeId: existing.id } });
      row = await tx.recipe.update({
        where: { id: existing.id },
        data: {
          name: data.name || existing.name || `${menuItem.name} recipe`,
          yieldQty: data.yieldQty ?? 1,
          isActive: data.isActive ?? true,
          items: {
            create: data.items.map((i) => ({
              ingredientId: i.ingredientId,
              quantity: i.quantity,
            })),
          },
        },
        include: {
          menuItem: { select: { id: true, name: true } },
          variant: { select: { id: true, name: true } },
          items: { include: { ingredient: { include: { unit: true } } } },
        },
      });
    } else {
      row = await tx.recipe.create({
        data: {
          menuItemId: data.menuItemId,
          variantId: data.variantId || null,
          name: data.name || `${menuItem.name} recipe`,
          yieldQty: data.yieldQty ?? 1,
          isActive: data.isActive ?? true,
          items: {
            create: data.items.map((i) => ({
              ingredientId: i.ingredientId,
              quantity: i.quantity,
            })),
          },
        },
        include: {
          menuItem: { select: { id: true, name: true } },
          variant: { select: { id: true, name: true } },
          items: { include: { ingredient: { include: { unit: true } } } },
        },
      });
    }

    if (!menuItem.trackInventory) {
      await tx.menuItem.update({
        where: { id: menuItem.id },
        data: { trackInventory: true },
      });
    }

    await tx.auditLog.create({
      data: {
        actorId: userId,
        action: existing ? 'RECIPE_UPDATE' : 'RECIPE_CREATE',
        entityType: 'Recipe',
        entityId: row.id,
        after: { menuItemId: data.menuItemId, itemCount: data.items.length },
      },
    });

    return row;
  });

  return serializeDecimals(presentRecipe(recipe));
}

async function deactivateRecipe(id, userId) {
  const existing = await prisma.recipe.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw new AppError('Recipe not found', 404);
  const row = await prisma.recipe.update({
    where: { id },
    data: { isActive: false },
    include: {
      menuItem: { select: { id: true, name: true } },
      variant: { select: { id: true, name: true } },
      items: { include: { ingredient: { include: { unit: true } } } },
    },
  });
  await prisma.auditLog.create({
    data: {
      actorId: userId,
      action: 'RECIPE_DEACTIVATE',
      entityType: 'Recipe',
      entityId: id,
    },
  });
  return serializeDecimals(presentRecipe(row));
}

async function getModifierIngredients(modifierId) {
  const modifier = await prisma.modifier.findFirst({
    where: { id: modifierId, deletedAt: null },
    include: { group: { select: { name: true } } },
  });
  if (!modifier) throw new AppError('Customization not found', 404);

  const rows = await prisma.modifierIngredient.findMany({
    where: { modifierId },
    include: { ingredient: { include: { unit: true } } },
    orderBy: { ingredient: { name: 'asc' } },
  });

  return serializeDecimals({
    modifierId: modifier.id,
    modifierName: modifier.name,
    groupName: modifier.group?.name || null,
    items: rows.map((r) => ({
      id: r.id,
      ingredientId: r.ingredientId,
      ingredientName: r.ingredient?.name,
      unitName: r.ingredient?.unit?.name,
      quantity: r.quantity,
    })),
  });
}

async function upsertModifierIngredients(modifierId, body, userId) {
  const modifier = await prisma.modifier.findFirst({
    where: { id: modifierId, deletedAt: null },
  });
  if (!modifier) throw new AppError('Customization not found', 404);

  const items = body.items || [];
  const ingredientIds = items.map((i) => i.ingredientId);
  if (new Set(ingredientIds).size !== ingredientIds.length) {
    throw new AppError('Duplicate ingredients', 422);
  }
  if (ingredientIds.length) {
    const found = await prisma.ingredient.findMany({
      where: { id: { in: ingredientIds }, deletedAt: null, isActive: true },
    });
    if (found.length !== ingredientIds.length) {
      throw new AppError('One or more ingredients are missing or inactive', 422);
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.modifierIngredient.deleteMany({ where: { modifierId } });
    if (items.length) {
      await tx.modifierIngredient.createMany({
        data: items.map((i) => ({
          modifierId,
          ingredientId: i.ingredientId,
          quantity: i.quantity,
        })),
      });
    }
    await tx.auditLog.create({
      data: {
        actorId: userId,
        action: 'MODIFIER_INGREDIENTS_UPDATE',
        entityType: 'Modifier',
        entityId: modifierId,
        after: { itemCount: items.length },
      },
    });
  });

  return getModifierIngredients(modifierId);
}

async function listMenuProductsForRecipes() {
  const items = await prisma.menuItem.findMany({
    where: { deletedAt: null, isActive: true },
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      trackInventory: true,
      variants: {
        where: { deletedAt: null, isActive: true },
        orderBy: { sortOrder: 'asc' },
        select: { id: true, name: true },
      },
    },
  });
  return items;
}

module.exports = {
  listRecipes,
  getRecipe,
  upsertRecipe,
  deactivateRecipe,
  getModifierIngredients,
  upsertModifierIngredients,
  listMenuProductsForRecipes,
  presentRecipe,
};

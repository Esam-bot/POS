const prisma = require('../../config/db');
const AppError = require('../../utils/AppError');
const { parsePagination, paginatedResult } = require('../../utils/pagination');
const { toDecimal, serializeDecimals } = require('../../utils/decimal');

function validateGroupRules({ selectionType, minSelect, maxSelect, isRequired }) {
  if (maxSelect < minSelect) {
    throw new AppError('maxSelect cannot be less than minSelect', 400);
  }
  if (selectionType === 'SINGLE' && maxSelect > 1) {
    throw new AppError('SINGLE groups cannot have maxSelect greater than 1', 400);
  }
  if (isRequired && minSelect < 1) {
    throw new AppError('Required groups must have minSelect of at least 1', 400);
  }
}

async function listModifierGroups(query) {
  const { page, limit, skip } = parsePagination(query);
  const where = { deletedAt: null };
  if (query.search) {
    where.OR = [
      { name: { contains: query.search, mode: 'insensitive' } },
      { description: { contains: query.search, mode: 'insensitive' } },
    ];
  }
  if (query.isActive !== undefined) {
    where.isActive = query.isActive === true || query.isActive === 'true';
  }

  const [total, rows] = await Promise.all([
    prisma.modifierGroup.count({ where }),
    prisma.modifierGroup.findMany({
      where,
      skip,
      take: limit,
      orderBy: { name: 'asc' },
      include: {
        modifiers: {
          where: { deletedAt: null },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        },
        _count: { select: { menuItems: true } },
      },
    }),
  ]);

  const items = rows.map((row) =>
    serializeDecimals({
      ...row,
      itemCount: row._count.menuItems,
      _count: undefined,
    })
  );
  return paginatedResult(items, total, page, limit);
}

async function getModifierGroup(id) {
  const group = await prisma.modifierGroup.findFirst({
    where: { id, deletedAt: null },
    include: {
      modifiers: {
        where: { deletedAt: null },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      },
    },
  });
  if (!group) throw new AppError('Modifier group not found', 404);
  return serializeDecimals(group);
}

async function createModifierGroup(data) {
  const selectionType = data.selectionType || 'MULTI';
  const minSelect = data.minSelect ?? (data.isRequired ? 1 : 0);
  const maxSelect = data.maxSelect ?? (selectionType === 'SINGLE' ? 1 : Math.max(minSelect, 1));
  const isRequired = data.isRequired ?? false;
  validateGroupRules({ selectionType, minSelect, maxSelect, isRequired });

  const group = await prisma.modifierGroup.create({
    data: {
      name: data.name,
      description: data.description || null,
      selectionType,
      minSelect,
      maxSelect,
      isRequired,
      isActive: data.isActive ?? true,
    },
    include: { modifiers: true },
  });
  return serializeDecimals(group);
}

async function updateModifierGroup(id, data) {
  const existing = await prisma.modifierGroup.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw new AppError('Modifier group not found', 404);

  const selectionType = data.selectionType ?? existing.selectionType;
  const minSelect = data.minSelect ?? existing.minSelect;
  const maxSelect = data.maxSelect ?? existing.maxSelect;
  const isRequired = data.isRequired ?? existing.isRequired;
  validateGroupRules({ selectionType, minSelect, maxSelect, isRequired });

  const group = await prisma.modifierGroup.update({
    where: { id },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.description !== undefined ? { description: data.description } : {}),
      selectionType,
      minSelect,
      maxSelect,
      isRequired,
      ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
    },
    include: {
      modifiers: {
        where: { deletedAt: null },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      },
    },
  });
  return serializeDecimals(group);
}

async function createModifier(groupId, data) {
  const group = await prisma.modifierGroup.findFirst({ where: { id: groupId, deletedAt: null } });
  if (!group) throw new AppError('Modifier group not found', 404);

  const modifier = await prisma.modifier.create({
    data: {
      groupId,
      name: data.name,
      description: data.description || null,
      priceDelta: toDecimal(data.priceDelta ?? 0),
      sortOrder: data.sortOrder ?? 0,
      isActive: data.isActive ?? true,
    },
  });
  return serializeDecimals(modifier);
}

async function updateModifier(modifierId, data) {
  const existing = await prisma.modifier.findFirst({ where: { id: modifierId, deletedAt: null } });
  if (!existing) throw new AppError('Modifier not found', 404);

  const modifier = await prisma.modifier.update({
    where: { id: modifierId },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.description !== undefined ? { description: data.description } : {}),
      ...(data.priceDelta !== undefined ? { priceDelta: toDecimal(data.priceDelta) } : {}),
      ...(data.sortOrder !== undefined ? { sortOrder: data.sortOrder } : {}),
      ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
    },
  });
  return serializeDecimals(modifier);
}

async function setModifierStatus(modifierId, isActive) {
  return updateModifier(modifierId, { isActive });
}

async function getItemModifierGroups(menuItemId) {
  const item = await prisma.menuItem.findFirst({ where: { id: menuItemId } });
  if (!item) throw new AppError('Menu item not found', 404);

  const links = await prisma.menuItemModifierGroup.findMany({
    where: { menuItemId },
    orderBy: { sortOrder: 'asc' },
    include: {
      modifierGroup: {
        include: {
          modifiers: {
            where: { deletedAt: null },
            orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
          },
        },
      },
    },
  });

  return serializeDecimals(
    links.map((link) => ({
      sortOrder: link.sortOrder,
      ...link.modifierGroup,
    }))
  );
}

async function setItemModifierGroups(menuItemId, groups) {
  const item = await prisma.menuItem.findFirst({ where: { id: menuItemId, deletedAt: null } });
  if (!item) throw new AppError('Menu item not found', 404);

  const ids = groups.map((g) => g.modifierGroupId);
  if (new Set(ids).size !== ids.length) {
    throw new AppError('Duplicate modifier groups in assignment', 400);
  }

  if (ids.length) {
    const found = await prisma.modifierGroup.findMany({
      where: { id: { in: ids }, deletedAt: null },
    });
    if (found.length !== ids.length) {
      throw new AppError('One or more modifier groups were not found', 404);
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.menuItemModifierGroup.deleteMany({ where: { menuItemId } });
    if (groups.length) {
      await tx.menuItemModifierGroup.createMany({
        data: groups.map((g, index) => ({
          menuItemId,
          modifierGroupId: g.modifierGroupId,
          sortOrder: g.sortOrder ?? index,
        })),
      });
    }
  });

  return getItemModifierGroups(menuItemId);
}

module.exports = {
  listModifierGroups,
  getModifierGroup,
  createModifierGroup,
  updateModifierGroup,
  createModifier,
  updateModifier,
  setModifierStatus,
  getItemModifierGroups,
  setItemModifierGroups,
};

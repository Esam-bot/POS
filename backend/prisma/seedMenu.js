const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const {
  CATEGORIES,
  MODIFIER_GROUPS,
  IMAGES,
  PRODUCTS,
  KEEP_MENU_SKUS,
  KEEP_MENU_NAMES,
  KEEP_CATEGORY_NAMES,
} = require('./menuCatalog');

const UPLOAD_DIR = path.join(__dirname, '..', process.env.UPLOAD_DIR || 'uploads', 'menu');

function isTestName(name) {
  return /\s\d{10,}$/.test(name) || /^(Custom|Test|Inv|KDS|P3|P4|Print|PrintPay)\b/i.test(name)
    || /Cat for station/i.test(name)
    || /Temp Station/i.test(name)
    || /Extras \d+/i.test(name)
    || /Toppings \d+/i.test(name);
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const client = url.startsWith('https') ? https : http;
    const req = client.get(
      url,
      {
        headers: {
          'User-Agent': 'restaurant-pos-seed/1.0',
          Accept: 'image/*',
        },
        timeout: 30000,
      },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          file.close();
          fs.unlink(dest, () => {});
          downloadFile(res.headers.location, dest).then(resolve).catch(reject);
          return;
        }
        if (res.statusCode !== 200) {
          file.close();
          fs.unlink(dest, () => {});
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          return;
        }
        res.pipe(file);
        file.on('finish', () => file.close(() => resolve(dest)));
      }
    );
    req.on('error', (err) => {
      file.close();
      fs.unlink(dest, () => {});
      reject(err);
    });
    req.on('timeout', () => {
      req.destroy();
      file.close();
      fs.unlink(dest, () => {});
      reject(new Error(`Timeout downloading ${url}`));
    });
  });
}

async function ensureMenuImages() {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const urls = {};

  for (const [key, photoId] of Object.entries(IMAGES)) {
    const filename = `${key}.jpg`;
    const dest = path.join(UPLOAD_DIR, filename);
    const publicUrl = `/uploads/menu/${filename}`;

    if (fs.existsSync(dest) && fs.statSync(dest).size > 1000) {
      urls[key] = publicUrl;
      continue;
    }

    const remote = `https://images.unsplash.com/photo-${photoId}?auto=format&fit=crop&w=800&h=800&q=80`;
    try {
      await downloadFile(remote, dest);
      if (!fs.existsSync(dest) || fs.statSync(dest).size < 1000) {
        throw new Error('Downloaded file too small');
      }
      console.log(`  image ok: ${filename}`);
      urls[key] = publicUrl;
    } catch (err) {
      console.warn(`  image failed (${key}): ${err.message}`);
      urls[key] = null;
    }
  }

  return urls;
}

async function softArchiveTestMenuData(prisma) {
  const now = new Date();

  const cats = await prisma.menuCategory.updateMany({
    where: {
      deletedAt: null,
      OR: [
        { name: { contains: '179' } },
        { name: { startsWith: 'Cat for station' } },
        { name: { startsWith: 'Inv Menu' } },
        { name: { startsWith: 'P3 Cat' } },
        { name: { startsWith: 'P4 Cat' } },
        { name: { startsWith: 'KDS Cat' } },
        { name: { startsWith: 'Print' } },
      ],
    },
    data: { deletedAt: now, isActive: false },
  });

  const items = await prisma.menuItem.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, sku: true },
  });
  const testItemIds = items.filter((i) => isTestName(i.name) || isTestName(i.sku || '')).map((i) => i.id);
  const itemResult = testItemIds.length
    ? await prisma.menuItem.updateMany({
        where: { id: { in: testItemIds } },
        data: { deletedAt: now, isActive: false, isAvailable: false },
      })
    : { count: 0 };

  const groups = await prisma.modifierGroup.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true },
  });
  const testGroupIds = groups.filter((g) => isTestName(g.name)).map((g) => g.id);
  const groupResult = testGroupIds.length
    ? await prisma.modifierGroup.updateMany({
        where: { id: { in: testGroupIds } },
        data: { deletedAt: now, isActive: false },
      })
    : { count: 0 };

  return {
    categories: cats.count,
    items: itemResult.count,
    modifierGroups: groupResult.count,
  };
}

/** Soft-archive menu rows that are not part of the minimal seed catalog. */
async function softArchiveNonCatalogMenu(prisma) {
  const now = new Date();
  const items = await prisma.menuItem.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, sku: true },
  });
  const dropItemIds = items
    .filter((i) => !KEEP_MENU_SKUS.has(i.sku) && !KEEP_MENU_NAMES.has(i.name.toLowerCase()))
    .map((i) => i.id);
  const itemsArchived = dropItemIds.length
    ? (
        await prisma.menuItem.updateMany({
          where: { id: { in: dropItemIds } },
          data: { deletedAt: now, isActive: false, isAvailable: false, trackInventory: false },
        })
      ).count
    : 0;

  const cats = await prisma.menuCategory.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true },
  });
  const dropCatIds = cats
    .filter((c) => !KEEP_CATEGORY_NAMES.has(c.name.toLowerCase()))
    .map((c) => c.id);
  const categoriesArchived = dropCatIds.length
    ? (
        await prisma.menuCategory.updateMany({
          where: { id: { in: dropCatIds } },
          data: { deletedAt: now, isActive: false },
        })
      ).count
    : 0;

  const groups = await prisma.modifierGroup.findMany({
    where: { deletedAt: null },
    select: { id: true },
  });
  const modifierGroupsArchived = groups.length
    ? (
        await prisma.modifierGroup.updateMany({
          where: { id: { in: groups.map((g) => g.id) } },
          data: { deletedAt: now, isActive: false },
        })
      ).count
    : 0;

  return { itemsArchived, categoriesArchived, modifierGroupsArchived };
}

async function upsertModifierGroup(prisma, def) {
  let group = await prisma.modifierGroup.findFirst({
    where: { name: def.name, deletedAt: null },
  });
  if (!group) {
    group = await prisma.modifierGroup.create({
      data: {
        name: def.name,
        selectionType: def.selectionType,
        minSelect: def.minSelect,
        maxSelect: def.maxSelect,
        isRequired: def.isRequired,
        isActive: true,
      },
    });
  } else {
    group = await prisma.modifierGroup.update({
      where: { id: group.id },
      data: {
        selectionType: def.selectionType,
        minSelect: def.minSelect,
        maxSelect: def.maxSelect,
        isRequired: def.isRequired,
        isActive: true,
      },
    });
  }

  for (const mod of def.modifiers) {
    const existing = await prisma.modifier.findFirst({
      where: { groupId: group.id, name: mod.name, deletedAt: null },
    });
    if (existing) {
      await prisma.modifier.update({
        where: { id: existing.id },
        data: {
          priceDelta: mod.priceDelta,
          sortOrder: mod.sortOrder,
          isActive: true,
        },
      });
    } else {
      await prisma.modifier.create({
        data: {
          groupId: group.id,
          name: mod.name,
          priceDelta: mod.priceDelta,
          sortOrder: mod.sortOrder,
          isActive: true,
        },
      });
    }
  }

  return group;
}

async function findOrCreateCategory(prisma, cat) {
  let existing = await prisma.menuCategory.findFirst({
    where: { name: { equals: cat.name, mode: 'insensitive' }, deletedAt: null },
  });
  if (existing) {
    return prisma.menuCategory.update({
      where: { id: existing.id },
      data: {
        name: cat.name,
        description: cat.description,
        sortOrder: cat.sortOrder,
        isActive: true,
      },
    });
  }
  return prisma.menuCategory.create({
    data: {
      name: cat.name,
      description: cat.description,
      sortOrder: cat.sortOrder,
      isActive: true,
    },
  });
}

async function findExistingProduct(prisma, product) {
  const bySku = await prisma.menuItem.findFirst({ where: { sku: product.sku } });
  if (bySku) return bySku;

  // Reuse well-known real products that may still have test SKUs
  return prisma.menuItem.findFirst({
    where: {
      name: { equals: product.name, mode: 'insensitive' },
      deletedAt: null,
      NOT: { name: { contains: '179' } },
    },
  });
}

async function syncVariants(prisma, menuItemId, variants) {
  const existing = await prisma.menuVariant.findMany({
    where: { menuItemId, deletedAt: null },
  });

  const keepNames = new Set(variants.map((v) => v.name.toLowerCase()));
  for (const row of existing) {
    if (!keepNames.has(row.name.toLowerCase())) {
      await prisma.menuVariant.update({
        where: { id: row.id },
        data: { deletedAt: new Date(), isActive: false },
      });
    }
  }

  for (const variant of variants) {
    const match = existing.find((v) => v.name.toLowerCase() === variant.name.toLowerCase() && !v.deletedAt);
    if (match) {
      await prisma.menuVariant.update({
        where: { id: match.id },
        data: {
          price: variant.price,
          sortOrder: variant.sortOrder,
          isActive: true,
          deletedAt: null,
        },
      });
    } else {
      await prisma.menuVariant.create({
        data: {
          menuItemId,
          name: variant.name,
          price: variant.price,
          sortOrder: variant.sortOrder,
          isActive: true,
        },
      });
    }
  }
}

async function syncItemModifierGroups(prisma, menuItemId, groupIds) {
  await prisma.menuItemModifierGroup.deleteMany({ where: { menuItemId } });
  for (let i = 0; i < groupIds.length; i += 1) {
    await prisma.menuItemModifierGroup.create({
      data: {
        menuItemId,
        modifierGroupId: groupIds[i],
        sortOrder: i + 1,
      },
    });
  }
}

/**
 * Idempotent clean menu seed:
 * - soft-archives test/demo menu leftovers
 * - ensures categories, products, variants, modifiers, local images
 */
async function seedCleanMenu(prisma, options = {}) {
  const { skipImageDownload = false } = options;

  console.log('Cleaning test/demo menu leftovers (soft-archive only)...');
  const cleaned = await softArchiveTestMenuData(prisma);
  console.log(
    `  archived categories=${cleaned.categories}, items=${cleaned.items}, modifierGroups=${cleaned.modifierGroups}`
  );

  console.log('Ensuring menu images...');
  const imageUrls = skipImageDownload
    ? Object.fromEntries(
        Object.keys(IMAGES).map((key) => {
          const dest = path.join(UPLOAD_DIR, `${key}.jpg`);
          if (fs.existsSync(dest) && fs.statSync(dest).size > 1000) {
            return [key, `/uploads/menu/${key}.jpg`];
          }
          return [key, null];
        })
      )
    : await ensureMenuImages();

  const stations = await prisma.kitchenStation.findMany({ where: { deletedAt: null } });
  const stationByCode = Object.fromEntries(stations.map((s) => [s.code, s]));

  console.log('Upserting categories...');
  const categoryByName = {};
  for (const cat of CATEGORIES) {
    categoryByName[cat.name] = await findOrCreateCategory(prisma, cat);
  }

  console.log('Upserting modifier groups...');
  const groupByKey = {};
  for (const [key, def] of Object.entries(MODIFIER_GROUPS)) {
    groupByKey[key] = await upsertModifierGroup(prisma, def);
  }

  console.log('Upserting products...');
  for (const product of PRODUCTS) {
    const category = categoryByName[product.category];
    const station = stationByCode[product.station] || null;
    const imageUrl = imageUrls[product.imageKey] || imageUrls.fallback || null;

    let item = await findExistingProduct(prisma, product);
    const data = {
      name: product.name,
      description: product.description,
      sku: product.sku,
      categoryId: category.id,
      kitchenStationId: station?.id || null,
      basePrice: product.basePrice,
      prepTimeMinutes: product.prepTimeMinutes ?? 5,
      trackInventory: Boolean(product.trackInventory),
      imageUrl,
      isActive: true,
      isAvailable: true,
      deletedAt: null,
    };

    if (item) {
      // Avoid unique sku collision when renaming a different item onto this sku
      const skuOwner = await prisma.menuItem.findFirst({ where: { sku: product.sku } });
      if (skuOwner && skuOwner.id !== item.id) {
        await prisma.menuItem.update({
          where: { id: skuOwner.id },
          data: { sku: `${skuOwner.sku}-old-${Date.now()}` },
        });
      }
      item = await prisma.menuItem.update({ where: { id: item.id }, data });
    } else {
      item = await prisma.menuItem.create({ data });
    }

    await syncVariants(prisma, item.id, product.variants || []);
    const groupIds = (product.modifierGroupKeys || [])
      .map((k) => groupByKey[k]?.id)
      .filter(Boolean);
    await syncItemModifierGroups(prisma, item.id, groupIds);
    console.log(`  product ok: ${product.name}`);
  }

  console.log('Archiving menu rows outside the minimal catalog...');
  const archived = await softArchiveNonCatalogMenu(prisma);
  console.log(
    `  archived extras items=${archived.itemsArchived}, categories=${archived.categoriesArchived}, modifierGroups=${archived.modifierGroupsArchived}`
  );

  return {
    cleaned,
    archived,
    productCount: PRODUCTS.length,
    imageCount: Object.values(imageUrls).filter(Boolean).length,
  };
}

module.exports = {
  seedCleanMenu,
  softArchiveTestMenuData,
  softArchiveNonCatalogMenu,
  ensureMenuImages,
  isTestName,
};

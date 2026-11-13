/**
 * Minimal starter restaurant menu used by seed.
 * Business data lives in PostgreSQL after seed — this file is seed-only.
 */

const CATEGORIES = [
  { name: 'Burgers', sortOrder: 1, description: 'Burgers' },
  { name: 'Pizza', sortOrder: 2, description: 'Pizza' },
  { name: 'Sandwiches', sortOrder: 3, description: 'Sandwiches' },
  { name: 'Drinks', sortOrder: 4, description: 'Drinks' },
  { name: 'Sides', sortOrder: 5, description: 'Sides' },
];

/** Keep modifier catalog empty for the minimal dataset. */
const MODIFIER_GROUPS = {};

/** Optional local images (seed skips download when files are missing). */
const IMAGES = {
  'classic-beef-burger': '1568901346375-23c9450c58cd',
  'chicken-burger': '1606755962773-d324e0a13086',
  'margherita-pizza': '1574071318508-1cdbab80d002',
  'chicken-sandwich': '1551782450-a2132b4ba21d',
  'french-fries': '1571091718767-18b5b1457add',
  'cold-drink': '1629203851122-3726ecdf080e',
  fallback: '1414235077428-338989a2e8c0',
};

const PRODUCTS = [
  {
    sku: 'BRG-CLASSIC-BEEF',
    name: 'Classic Beef Burger',
    category: 'Burgers',
    station: 'GRILL',
    basePrice: 850,
    prepTimeMinutes: 12,
    trackInventory: true,
    description: 'Beef patty with bun, cheese, mayo, lettuce and tomato',
    imageKey: 'classic-beef-burger',
    variants: [],
    modifierGroupKeys: [],
  },
  {
    sku: 'BRG-CHICKEN',
    name: 'Chicken Burger',
    category: 'Burgers',
    station: 'GRILL',
    basePrice: 750,
    prepTimeMinutes: 12,
    trackInventory: true,
    description: 'Chicken patty with bun, cheese, mayo and lettuce',
    imageKey: 'chicken-burger',
    variants: [],
    modifierGroupKeys: [],
  },
  {
    sku: 'PZA-MARGHERITA',
    name: 'Margherita Pizza',
    category: 'Pizza',
    station: 'PIZZA',
    basePrice: 1200,
    prepTimeMinutes: 18,
    trackInventory: true,
    description: 'Pizza dough with cheese and tomato',
    imageKey: 'margherita-pizza',
    variants: [],
    modifierGroupKeys: [],
  },
  {
    sku: 'SND-CHICKEN',
    name: 'Chicken Sandwich',
    category: 'Sandwiches',
    station: 'GRILL',
    basePrice: 650,
    prepTimeMinutes: 10,
    trackInventory: true,
    description: 'Chicken sandwich with mayo and lettuce',
    imageKey: 'chicken-sandwich',
    variants: [],
    modifierGroupKeys: [],
  },
  {
    sku: 'SID-FRIES',
    name: 'French Fries',
    category: 'Sides',
    station: 'FRYER',
    basePrice: 300,
    prepTimeMinutes: 8,
    trackInventory: true,
    description: 'Crispy french fries',
    imageKey: 'french-fries',
    variants: [],
    modifierGroupKeys: [],
  },
  {
    sku: 'DRK-COLD',
    name: 'Cold Drink',
    category: 'Drinks',
    station: 'DRINKS',
    basePrice: 150,
    prepTimeMinutes: 2,
    trackInventory: false,
    description: 'Chilled bottled soft drink',
    imageKey: 'cold-drink',
    variants: [],
    modifierGroupKeys: [],
  },
];

const KEEP_MENU_SKUS = new Set(PRODUCTS.map((p) => p.sku));
const KEEP_MENU_NAMES = new Set(PRODUCTS.map((p) => p.name.toLowerCase()));
const KEEP_CATEGORY_NAMES = new Set(CATEGORIES.map((c) => c.name.toLowerCase()));

module.exports = {
  CATEGORIES,
  MODIFIER_GROUPS,
  IMAGES,
  PRODUCTS,
  KEEP_MENU_SKUS,
  KEEP_MENU_NAMES,
  KEEP_CATEGORY_NAMES,
};

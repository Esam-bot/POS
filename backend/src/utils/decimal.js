const { Prisma } = require('@prisma/client');

function toDecimal(value) {
  return new Prisma.Decimal(value);
}

function moneyString(value) {
  if (value === null || value === undefined) return null;
  return new Prisma.Decimal(value).toFixed(2);
}

function serializeDecimals(obj) {
  if (obj === null || obj === undefined) return obj;
  if (obj instanceof Prisma.Decimal) return moneyString(obj);
  if (Array.isArray(obj)) return obj.map(serializeDecimals);
  if (typeof obj === 'object' && obj.constructor === Object) {
    const out = {};
    for (const [key, val] of Object.entries(obj)) {
      if (val instanceof Date) {
        out[key] = val.toISOString();
      } else if (val instanceof Prisma.Decimal) {
        out[key] = key.toLowerCase().includes('stock') || key === 'quantity'
          ? val.toString()
          : moneyString(val);
      } else if (Array.isArray(val) || (val && typeof val === 'object' && val.constructor === Object)) {
        out[key] = serializeDecimals(val);
      } else {
        out[key] = val;
      }
    }
    return out;
  }
  return obj;
}

module.exports = { toDecimal, moneyString, serializeDecimals };

const { Prisma } = require('@prisma/client');

function D(value) {
  return new Prisma.Decimal(value || 0);
}

/** Round to nearest whole PKR using banker's-independent half-up. */
function roundPkr(value) {
  return D(value).toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP);
}

function money2(value) {
  return D(value).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

function hashPayload(payload) {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

module.exports = { D, roundPkr, money2, hashPayload };

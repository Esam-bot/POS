const { Prisma } = require('@prisma/client');
const AppError = require('../../utils/AppError');

function D(v) {
  return new Prisma.Decimal(v);
}

/**
 * Convert qty from one unit to another. Both units must share the same dimension.
 * Stock is always stored in the ingredient's own unit.
 */
function convertQuantity(quantity, fromUnit, toUnit) {
  if (!fromUnit || !toUnit) throw new AppError('Unit is required for conversion', 400);
  if (fromUnit.id === toUnit.id) return D(quantity);

  if (fromUnit.dimension !== toUnit.dimension) {
    throw new AppError(
      `Cannot convert ${fromUnit.code} (${fromUnit.dimension}) to ${toUnit.code} (${toUnit.dimension})`,
      400
    );
  }

  const fromFactor = D(fromUnit.toBaseFactor || 1);
  const toFactor = D(toUnit.toBaseFactor || 1);
  if (toFactor.lte(0) || fromFactor.lte(0)) {
    throw new AppError('Invalid unit conversion factor', 500);
  }

  // qty_in_to = qty_in_from * fromFactor / toFactor
  return D(quantity).mul(fromFactor).div(toFactor);
}

function toIngredientUnit(quantity, inputUnit, ingredientUnit) {
  return convertQuantity(quantity, inputUnit, ingredientUnit);
}

module.exports = { convertQuantity, toIngredientUnit, D };

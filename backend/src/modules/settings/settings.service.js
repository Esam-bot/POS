const prisma = require('../../config/db');
const AppError = require('../../utils/AppError');
const { serializeDecimals } = require('../../utils/decimal');
const { D } = require('../../utils/moneyMath');

async function getRestaurantSettings() {
  const restaurant = await prisma.restaurant.findFirst({
    where: { isActive: true, deletedAt: null },
    include: { settings: true },
  });
  if (!restaurant) throw new AppError('Restaurant not found', 404);
  return serializeDecimals(restaurant);
}

async function updateSettings(data, userId) {
  const restaurant = await prisma.restaurant.findFirst({
    where: { isActive: true, deletedAt: null },
    include: { settings: true },
  });
  if (!restaurant?.settings) throw new AppError('Restaurant settings not found', 404);

  const before = { ...restaurant.settings };
  const updated = await prisma.restaurantSettings.update({
    where: { id: restaurant.settings.id },
    data: {
      ...(data.taxServiceCharge !== undefined ? { taxServiceCharge: data.taxServiceCharge } : {}),
      ...(data.taxDeliveryFee !== undefined ? { taxDeliveryFee: data.taxDeliveryFee } : {}),
      ...(data.allowPartialPayments !== undefined
        ? { allowPartialPayments: data.allowPartialPayments }
        : {}),
      ...(data.autoReleaseTableOnPayment !== undefined
        ? { autoReleaseTableOnPayment: data.autoReleaseTableOnPayment }
        : {}),
      ...(data.useCleaningStatus !== undefined
        ? { useCleaningStatus: data.useCleaningStatus }
        : {}),
      ...(data.serviceChargeValue !== undefined
        ? { serviceChargeValue: D(data.serviceChargeValue) }
        : {}),
      ...(data.serviceChargeType !== undefined ? { serviceChargeType: data.serviceChargeType } : {}),
      ...(data.deliveryFeeDefault !== undefined
        ? { deliveryFeeDefault: D(data.deliveryFeeDefault) }
        : {}),
      ...(data.receiptFooter !== undefined ? { receiptFooter: data.receiptFooter } : {}),
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId: userId,
      action: 'SETTINGS_UPDATE',
      entityType: 'RestaurantSettings',
      entityId: updated.id,
      before: {
        taxServiceCharge: before.taxServiceCharge,
        taxDeliveryFee: before.taxDeliveryFee,
        autoReleaseTableOnPayment: before.autoReleaseTableOnPayment,
        useCleaningStatus: before.useCleaningStatus,
      },
      after: {
        taxServiceCharge: updated.taxServiceCharge,
        taxDeliveryFee: updated.taxDeliveryFee,
        autoReleaseTableOnPayment: updated.autoReleaseTableOnPayment,
        useCleaningStatus: updated.useCleaningStatus,
      },
    },
  });

  return serializeDecimals(updated);
}

async function listPaymentMethods() {
  const methods = await prisma.paymentMethod.findMany({
    where: { deletedAt: null },
    orderBy: { sortOrder: 'asc' },
  });
  return serializeDecimals(methods);
}

async function updatePaymentMethod(id, data, userId) {
  const existing = await prisma.paymentMethod.findFirst({
    where: { id, deletedAt: null },
  });
  if (!existing) throw new AppError('Payment method not found', 404);

  const updated = await prisma.paymentMethod.update({
    where: { id },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      ...(data.taxRate !== undefined ? { taxRate: D(data.taxRate) } : {}),
      ...(data.sortOrder !== undefined ? { sortOrder: data.sortOrder } : {}),
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId: userId,
      action: 'PAYMENT_METHOD_UPDATE',
      entityType: 'PaymentMethod',
      entityId: id,
      before: {
        name: existing.name,
        isActive: existing.isActive,
        taxRate: String(existing.taxRate),
      },
      after: {
        name: updated.name,
        isActive: updated.isActive,
        taxRate: String(updated.taxRate),
        ...(data.taxRate !== undefined
          ? {
              warning:
                'Future transactions will use the new tax rate; historical payments are unchanged',
            }
          : {}),
      },
    },
  });

  return serializeDecimals(updated);
}

module.exports = {
  getRestaurantSettings,
  updateSettings,
  listPaymentMethods,
  updatePaymentMethod,
};

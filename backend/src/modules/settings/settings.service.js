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

/** Public branding for login / unauthenticated shells — no secrets. */
async function getPublicBranding() {
  const restaurant = await prisma.restaurant.findFirst({
    where: { isActive: true, deletedAt: null },
    include: { settings: { select: { currencyCode: true, timezone: true } } },
  });
  if (!restaurant) {
    return {
      name: 'Restaurant',
      currencyCode: 'PKR',
      timezone: 'Asia/Karachi',
    };
  }
  return {
    name: restaurant.name,
    currencyCode: restaurant.settings?.currencyCode || 'PKR',
    timezone: restaurant.settings?.timezone || 'Asia/Karachi',
  };
}

async function updateSettings(data, userId) {
  const restaurant = await prisma.restaurant.findFirst({
    where: { isActive: true, deletedAt: null },
    include: { settings: true },
  });
  if (!restaurant?.settings) throw new AppError('Restaurant settings not found', 404);

  const before = {
    name: restaurant.name,
    address: restaurant.address,
    phone: restaurant.phone,
    email: restaurant.email,
    ...restaurant.settings,
  };

  const profileData = {};
  if (data.name !== undefined) profileData.name = data.name;
  if (data.address !== undefined) profileData.address = data.address || null;
  if (data.phone !== undefined) profileData.phone = data.phone || null;
  if (data.email !== undefined) profileData.email = data.email || null;

  const settingsData = {};
  if (data.taxServiceCharge !== undefined) settingsData.taxServiceCharge = data.taxServiceCharge;
  if (data.taxDeliveryFee !== undefined) settingsData.taxDeliveryFee = data.taxDeliveryFee;
  if (data.allowPartialPayments !== undefined) {
    settingsData.allowPartialPayments = data.allowPartialPayments;
  }
  if (data.serviceChargeValue !== undefined) {
    settingsData.serviceChargeValue = D(data.serviceChargeValue);
  }
  if (data.serviceChargeType !== undefined) {
    settingsData.serviceChargeType = data.serviceChargeType;
  }
  if (data.deliveryFeeDefault !== undefined) {
    settingsData.deliveryFeeDefault = D(data.deliveryFeeDefault);
  }
  if (data.currencyCode !== undefined) settingsData.currencyCode = data.currencyCode;
  if (data.timezone !== undefined) settingsData.timezone = data.timezone;
  if (data.receiptFooter !== undefined) settingsData.receiptFooter = data.receiptFooter || null;
  if (data.tableCleaningMinutes !== undefined) {
    settingsData.tableCleaningMinutes = data.tableCleaningMinutes;
  }
  if (data.autoReadyOnEstimate !== undefined) {
    settingsData.autoReadyOnEstimate = data.autoReadyOnEstimate;
  }
  if (data.autoReleaseTableOnPayment !== undefined) {
    settingsData.autoReleaseTableOnPayment = data.autoReleaseTableOnPayment;
  }
  if (data.useCleaningStatus !== undefined) {
    settingsData.useCleaningStatus = data.useCleaningStatus;
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (Object.keys(profileData).length) {
      await tx.restaurant.update({
        where: { id: restaurant.id },
        data: profileData,
      });
    }
    if (Object.keys(settingsData).length) {
      await tx.restaurantSettings.update({
        where: { id: restaurant.settings.id },
        data: settingsData,
      });
    }
    return tx.restaurant.findUnique({
      where: { id: restaurant.id },
      include: { settings: true },
    });
  });

  await prisma.auditLog.create({
    data: {
      actorId: userId,
      action: 'SETTINGS_UPDATE',
      entityType: 'RestaurantSettings',
      entityId: restaurant.settings.id,
      before: {
        name: before.name,
        deliveryFeeDefault: String(before.deliveryFeeDefault),
        currencyCode: before.currencyCode,
      },
      after: {
        name: updated.name,
        deliveryFeeDefault: String(updated.settings.deliveryFeeDefault),
        currencyCode: updated.settings.currencyCode,
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

async function createPaymentMethod(data, userId) {
  const code = String(data.code || '')
    .trim()
    .toUpperCase();
  if (!code) throw new AppError('Payment method code is required', 400);

  const existing = await prisma.paymentMethod.findFirst({
    where: { code, deletedAt: null },
  });
  if (existing) throw new AppError('A payment method with this code already exists', 409);

  const archived = await prisma.paymentMethod.findFirst({ where: { code } });
  let created;
  if (archived?.deletedAt) {
    created = await prisma.paymentMethod.update({
      where: { id: archived.id },
      data: {
        name: data.name.trim(),
        taxRate: D(data.taxRate ?? 0),
        isCash: Boolean(data.isCash),
        isActive: data.isActive !== false,
        sortOrder: data.sortOrder ?? archived.sortOrder ?? 99,
        deletedAt: null,
      },
    });
  } else if (archived) {
    throw new AppError('A payment method with this code already exists', 409);
  } else {
    const maxSort = await prisma.paymentMethod.aggregate({
      where: { deletedAt: null },
      _max: { sortOrder: true },
    });
    created = await prisma.paymentMethod.create({
      data: {
        code,
        name: data.name.trim(),
        taxRate: D(data.taxRate ?? 0),
        isCash: Boolean(data.isCash),
        isActive: data.isActive !== false,
        sortOrder: data.sortOrder ?? (maxSort._max.sortOrder || 0) + 1,
      },
    });
  }

  await prisma.auditLog.create({
    data: {
      actorId: userId,
      action: 'PAYMENT_METHOD_CREATE',
      entityType: 'PaymentMethod',
      entityId: created.id,
      after: {
        code: created.code,
        name: created.name,
        taxRate: String(created.taxRate),
        isCash: created.isCash,
      },
    },
  });

  return serializeDecimals(created);
}

async function softDeletePaymentMethod(id, userId) {
  const existing = await prisma.paymentMethod.findFirst({
    where: { id, deletedAt: null },
  });
  if (!existing) throw new AppError('Payment method not found', 404);

  if (existing.code === 'CASH') {
    throw new AppError('The Cash payment method cannot be deleted', 409);
  }

  const paymentCount = await prisma.payment.count({ where: { methodId: id } });
  const updated = await prisma.paymentMethod.update({
    where: { id },
    data: {
      deletedAt: new Date(),
      isActive: false,
      code: `${existing.code}__deleted_${Date.now()}`,
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId: userId,
      action: 'PAYMENT_METHOD_DELETE',
      entityType: 'PaymentMethod',
      entityId: id,
      before: {
        code: existing.code,
        name: existing.name,
        paymentCount,
      },
      after: { deleted: true, code: updated.code },
    },
  });

  return {
    deleted: true,
    id,
    code: existing.code,
    name: existing.name,
    hadPayments: paymentCount > 0,
  };
}

module.exports = {
  getRestaurantSettings,
  getPublicBranding,
  updateSettings,
  listPaymentMethods,
  updatePaymentMethod,
  createPaymentMethod,
  softDeletePaymentMethod,
};

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const prisma = require('../../config/db');
const env = require('../../config/env');
const AppError = require('../../utils/AppError');

function mapUser(user) {
  const roles = user.roles.map((ur) => ur.role.name);
  const permissions = [
    ...new Set(
      user.roles.flatMap((ur) =>
        ur.role.permissions.map((rp) => rp.permission.code)
      )
    ),
  ];

  return {
    id: user.id,
    username: user.username,
    name: user.name,
    email: user.email,
    phone: user.phone,
    roles,
    permissions,
  };
}

async function findActiveUserByUsername(username) {
  return prisma.user.findFirst({
    where: {
      username: { equals: username, mode: 'insensitive' },
      deletedAt: null,
    },
    include: {
      roles: {
        include: {
          role: {
            include: {
              permissions: {
                include: { permission: true },
              },
            },
          },
        },
      },
    },
  });
}

async function login(username, password) {
  const user = await findActiveUserByUsername(username);

  if (!user || !user.isActive) {
    throw new AppError('Invalid username or password', 401);
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    throw new AppError('Invalid username or password', 401);
  }

  const mapped = mapUser(user);
  const token = jwt.sign(
    { sub: user.id, username: user.username, roles: mapped.roles },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn }
  );

  await prisma.auditLog.create({
    data: {
      actorId: user.id,
      action: 'AUTH_LOGIN',
      entityType: 'User',
      entityId: user.id,
    },
  });

  return { token, user: mapped };
}

async function getMe(userId) {
  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null, isActive: true },
    include: {
      roles: {
        include: {
          role: {
            include: {
              permissions: {
                include: { permission: true },
              },
            },
          },
        },
      },
    },
  });

  if (!user) {
    throw new AppError('User not found or inactive', 401);
  }

  return mapUser(user);
}

async function logout(userId) {
  if (userId) {
    await prisma.auditLog.create({
      data: {
        actorId: userId,
        action: 'AUTH_LOGOUT',
        entityType: 'User',
        entityId: userId,
      },
    });
  }
  return true;
}

module.exports = { login, getMe, logout, mapUser };

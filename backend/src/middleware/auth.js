const jwt = require('jsonwebtoken');
const env = require('../config/env');
const prisma = require('../config/db');
const AppError = require('../utils/AppError');

async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw new AppError('Authentication required', 401);
    }

    const token = header.slice(7);
    let payload;
    try {
      payload = jwt.verify(token, env.jwtSecret);
    } catch {
      throw new AppError('Invalid or expired token', 401);
    }

    const user = await prisma.user.findFirst({
      where: { id: payload.sub, deletedAt: null, isActive: true },
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

    const roles = user.roles.map((ur) => ur.role.name);
    const permissions = [
      ...new Set(
        user.roles.flatMap((ur) =>
          ur.role.permissions.map((rp) => rp.permission.code)
        )
      ),
    ];

    req.user = {
      id: user.id,
      username: user.username,
      name: user.name,
      email: user.email,
      roles,
      permissions,
    };

    next();
  } catch (err) {
    next(err);
  }
}

function authorize(...requiredPermissions) {
  return (req, res, next) => {
    try {
      if (!req.user) {
        throw new AppError('Authentication required', 401);
      }

      if (req.user.roles.includes('ADMIN')) {
        return next();
      }

      if (requiredPermissions.length === 0) {
        return next();
      }

      const hasAll = requiredPermissions.every((p) =>
        req.user.permissions.includes(p)
      );

      if (!hasAll) {
        throw new AppError('Insufficient permissions', 403);
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}

function authorizeAny(...requiredPermissions) {
  return (req, res, next) => {
    try {
      if (!req.user) {
        throw new AppError('Authentication required', 401);
      }

      if (req.user.roles.includes('ADMIN')) {
        return next();
      }

      const hasAny = requiredPermissions.some((p) =>
        req.user.permissions.includes(p)
      );

      if (!hasAny) {
        throw new AppError('Insufficient permissions', 403);
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { authenticate, authorize, authorizeAny };

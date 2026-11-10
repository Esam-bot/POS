const { ZodError } = require('zod');
const { Prisma } = require('@prisma/client');
const { fail } = require('../utils/apiResponse');
const env = require('../config/env');

function notFoundHandler(req, res) {
  return fail(res, `Route not found: ${req.method} ${req.originalUrl}`, [], 404);
}

function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  if (err instanceof ZodError) {
    const errors = err.errors.map((e) => ({
      path: e.path.join('.'),
      message: e.message,
    }));
    return fail(res, 'Validation failed', errors, 422);
  }

  if (err.name === 'AppError' || err.isOperational) {
    return fail(res, err.message, err.errors || [], err.statusCode || 400);
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      return fail(res, 'A record with this value already exists', [{ code: err.code }], 409);
    }
    if (err.code === 'P2025') {
      return fail(res, 'Record not found', [{ code: err.code }], 404);
    }
  }

  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    return fail(res, 'Invalid or expired token', [], 401);
  }

  if (!env.isProd) {
    // eslint-disable-next-line no-console
    console.error(err);
  }

  return fail(res, 'Internal server error', [], 500);
}

module.exports = { notFoundHandler, errorHandler };

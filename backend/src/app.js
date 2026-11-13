const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const env = require('./config/env');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

const authRoutes = require('./modules/auth/auth.routes');
const dashboardRoutes = require('./modules/dashboard/dashboard.routes');
const menuRoutes = require('./modules/menu/menu.routes');
const tablesRoutes = require('./modules/tables/tables.routes');
const sessionsRoutes = require('./modules/sessions/sessions.routes');
const ordersRoutes = require('./modules/orders/orders.routes');
const paymentsRoutes = require('./modules/payments/payments.routes');
const settingsRoutes = require('./modules/settings/settings.routes');
const reportsRoutes = require('./modules/reports/reports.routes');
const printRoutes = require('./modules/printing/print.routes');
const inventoryRoutes = require('./modules/inventory/inventory.routes');
const customersRoutes = require('./modules/customers/customers.routes');
const kitchenRoutes = require('./modules/kitchen/kitchen.routes');
const expensesRoutes = require('./modules/expenses/expenses.routes');

const app = express();

app.set('trust proxy', 1);

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(
  cors({
    origin: env.corsOrigin,
    credentials: true,
  })
);
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

if (!env.isTest) {
  app.use(morgan(env.isProd ? 'combined' : 'dev'));
}

if (!env.isTest) {
  app.use(
    '/api',
    rateLimit({
      windowMs: env.rateLimitWindowMs,
      max: env.isProd ? env.rateLimitMax : Math.max(env.rateLimitMax, 5000),
      standardHeaders: true,
      legacyHeaders: false,
      skip: (req) => req.path === '/health' || req.originalUrl === '/api/health',
      message: {
        success: false,
        message: 'Too many requests, please try again later',
        errors: [],
      },
    })
  );
}

app.use('/uploads', express.static(path.join(__dirname, '..', env.uploadDir)));

app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'OK',
    data: { status: 'healthy', timestamp: new Date().toISOString() },
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/menu', menuRoutes);
app.use('/api/tables', tablesRoutes);
app.use('/api/table-sessions', sessionsRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api', paymentsRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/expenses', expensesRoutes);
app.use('/api/orders/:id/print', printRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/customers', customersRoutes);
app.use('/api/kitchen', kitchenRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;

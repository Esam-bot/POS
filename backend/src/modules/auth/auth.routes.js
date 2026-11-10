const express = require('express');
const controller = require('./auth.controller');
const validate = require('../../middleware/validate');
const { authenticate } = require('../../middleware/auth');
const { loginSchema } = require('./auth.schemas');

const router = express.Router();

router.post('/login', validate(loginSchema), controller.login);
router.get('/me', authenticate, controller.me);
router.post('/logout', authenticate, controller.logout);

module.exports = router;

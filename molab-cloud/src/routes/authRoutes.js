const express = require('express');
const { authLimiter } = require('../middleware/rateLimit');
const ctrl = require('../controllers/authController');

const router = express.Router();

router.post('/register', authLimiter, ctrl.registerHospital);
router.get('/verify-email', ctrl.verifyEmail);
router.post('/resend-verification', authLimiter, ctrl.resendVerification);
router.post('/login', authLimiter, ctrl.loginHospital);
router.post('/logout', ctrl.logoutHospital);
router.get('/me', ctrl.me);

module.exports = router;

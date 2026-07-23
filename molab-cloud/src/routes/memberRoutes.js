const express = require('express');
const { authLimiter } = require('../middleware/rateLimit');
const { requireMemberAuth } = require('../middleware/auth');
const ctrl = require('../controllers/memberController');

const router = express.Router();

router.post('/login', authLimiter, ctrl.loginMember);
router.post('/logout', ctrl.logoutMember);
router.get('/me', ctrl.me);
router.post('/contact-admin', requireMemberAuth, ctrl.contactAdmin);

module.exports = router;

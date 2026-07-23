const express = require('express');
const { requireMemberAuth } = require('../middleware/auth');
const ctrl = require('../controllers/agreementController');

const router = express.Router();
router.get('/text', ctrl.getAgreementText);
router.post('/accept', requireMemberAuth, ctrl.acceptAgreement);

module.exports = router;

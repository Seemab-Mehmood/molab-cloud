const express = require('express');
const { requireMemberAuth } = require('../middleware/auth');
const ctrl = require('../controllers/teamController');

const router = express.Router();
router.get('/', requireMemberAuth, ctrl.myTeam);

module.exports = router;

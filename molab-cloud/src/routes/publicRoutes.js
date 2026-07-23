const express = require('express');
const ctrl = require('../controllers/publicController');

const router = express.Router();
router.get('/stats', ctrl.publicStats);
router.get('/models', ctrl.modelRegistry);

module.exports = router;

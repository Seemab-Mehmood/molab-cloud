const express = require('express');
const { requireAdminAuth } = require('../middleware/auth');
const { adminLoginLimiter } = require('../middleware/rateLimit');
const ctrl = require('../controllers/adminController');

const router = express.Router();

// Login is rate-limited but not behind requireAdminAuth (that's what it grants).
router.post('/login', adminLoginLimiter, ctrl.loginAdmin);

router.use(requireAdminAuth);
router.post('/logout', ctrl.logoutAdmin);
router.get('/overview', ctrl.overview);
router.get('/hospitals', ctrl.listHospitals);
router.patch('/hospitals/:id/status', ctrl.setHospitalStatus);
router.get('/patients', ctrl.listAllPatients);
router.get('/audit-log', ctrl.auditLog);

module.exports = router;

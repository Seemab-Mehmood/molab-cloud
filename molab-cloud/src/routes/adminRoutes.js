const express = require('express');
const multer = require('multer');
const { requireAdminAuth } = require('../middleware/auth');
const { adminLoginLimiter } = require('../middleware/rateLimit');
const ctrl = require('../controllers/adminController');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const ok = /\.(xlsx|xls|csv)$/i.test(file.originalname);
    cb(ok ? null : new Error('Only .xlsx, .xls, or .csv files are accepted.'), ok);
  },
});

// Login is rate-limited but not behind requireAdminAuth (that's what it grants).
router.post('/login', adminLoginLimiter, ctrl.loginAdmin);

router.use(requireAdminAuth);
router.post('/logout', ctrl.logoutAdmin);
router.get('/overview', ctrl.overview);

router.get('/roster', ctrl.listRoster);
router.get('/roster/imports', ctrl.listRosterImports);
router.post('/roster/upload', upload.single('file'), (err, req, res, next) => {
  if (err) return res.status(400).json({ error: err.message });
  next();
}, ctrl.uploadRoster);
router.post('/roster/:id/renew', ctrl.renewMembership);
router.patch('/roster/:id/status', ctrl.setMemberStatus);
router.post('/roster/:id/email', ctrl.emailMember);
router.post('/broadcast', ctrl.broadcastEmail);

router.get('/hospitals', ctrl.listHospitals);
router.get('/patients', ctrl.listAllPatients);
router.get('/patients/:id', ctrl.getPatientDetail);
router.get('/audit-log', ctrl.auditLog);

module.exports = router;

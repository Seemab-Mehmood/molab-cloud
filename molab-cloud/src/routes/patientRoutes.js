const express = require('express');
const { requireMemberAuth, requireActiveMembership, requireAgreement } = require('../middleware/auth');
const ctrl = require('../controllers/patientController');

const router = express.Router();
router.use(requireMemberAuth);
router.use(requireActiveMembership); // expired/blocked members can't view or touch patient data or simulations

router.get('/', ctrl.listPatients);
router.get('/:id', ctrl.getPatient);
router.post('/', requireAgreement, ctrl.createPatient);
router.put('/:id/dataset', requireAgreement, ctrl.updatePatientDataset);
router.post('/:id/simulate', requireAgreement, ctrl.simulatePatient);

module.exports = router;

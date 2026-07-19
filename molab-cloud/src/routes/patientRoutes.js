const express = require('express');
const { requireHospitalAuth, requireApprovedHospital } = require('../middleware/auth');
const ctrl = require('../controllers/patientController');

const router = express.Router();
router.use(requireHospitalAuth);

router.get('/', ctrl.listPatients);
router.get('/:id', ctrl.getPatient);
router.post('/', requireApprovedHospital, ctrl.createPatient);
router.put('/:id/dataset', requireApprovedHospital, ctrl.updatePatientDataset);
router.post('/:id/simulate', requireApprovedHospital, ctrl.simulatePatient);

module.exports = router;

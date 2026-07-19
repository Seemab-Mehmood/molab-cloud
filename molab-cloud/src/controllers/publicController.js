const db = require('../db');
const { modelRegistryPublicInfo } = require('../services/modelEngine');

function publicStats(req, res) {
  const approvedHospitals = db.prepare("SELECT COUNT(*) AS c FROM hospitals WHERE status = 'approved'").get().c;
  const supervisedPatients = db.prepare(`
    SELECT COUNT(*) AS c FROM patients p
    JOIN hospitals h ON h.id = p.hospital_id
    WHERE h.status = 'approved'
  `).get().c;
  res.json({
    hospitalsRegistered: approvedHospitals,
    patientsUnderSupervision: supervisedPatients,
    modelsInRegistry: modelRegistryPublicInfo().length,
  });
}

function modelRegistry(req, res) {
  res.json({ models: modelRegistryPublicInfo() });
}

module.exports = { publicStats, modelRegistry };

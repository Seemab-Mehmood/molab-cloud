const db = require('../db');
const { modelRegistryPublicInfo } = require('../services/modelEngine');

function publicStats(req, res) {
  const activeMembers = db.prepare("SELECT COUNT(*) AS c FROM members WHERE status = 'active'").get().c;
  const hospitals = db.prepare(`
    SELECT COUNT(DISTINCT h.id) AS c FROM hospitals h
    JOIN members m ON m.hospital_id = h.id AND m.status = 'active'
  `).get().c;
  const supervisedPatients = db.prepare(`
    SELECT COUNT(*) AS c FROM patients p
    JOIN members m ON m.id = p.member_id
    WHERE m.status = 'active'
  `).get().c;
  res.json({
    activeMembers,
    hospitalsRepresented: hospitals,
    patientsUnderSupervision: supervisedPatients,
    modelsInRegistry: modelRegistryPublicInfo().length,
  });
}

function modelRegistry(req, res) {
  res.json({ models: modelRegistryPublicInfo() });
}

module.exports = { publicStats, modelRegistry };

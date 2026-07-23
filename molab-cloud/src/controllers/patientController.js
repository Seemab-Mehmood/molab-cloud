const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { runAllModels } = require('../services/modelEngine');
const { logAudit } = require('./sharedAudit');

function parsePatient(row) {
  return {
    id: row.id,
    memberId: row.member_id,
    code: row.code,
    age: row.age,
    sex: row.sex,
    type: row.cancer_type,
    stage: row.stage,
    tx: row.treatment_status,
    dataset: JSON.parse(row.dataset),
    results: row.results ? JSON.parse(row.results) : null,
    simCount: row.sim_count,
    registeredAt: row.registered_at,
    updatedAt: row.updated_at,
  };
}

function listPatients(req, res) {
  const rows = db.prepare('SELECT * FROM patients WHERE member_id = ? ORDER BY registered_at DESC').all(req.member.id);
  res.json({ patients: rows.map(parsePatient) });
}

function getPatient(req, res) {
  const row = db.prepare('SELECT * FROM patients WHERE id = ? AND member_id = ?').get(req.params.id, req.member.id);
  if (!row) return res.status(404).json({ error: 'Patient not found.' });
  res.json({ patient: parsePatient(row) });
}

function validateDataset(dataset) {
  if (!Array.isArray(dataset) || dataset.length < 2) return 'At least two tumor measurements are required.';
  for (const pt of dataset) {
    if (typeof pt.t !== 'number' || typeof pt.v !== 'number' || pt.t < 0 || pt.v < 0) {
      return 'Each measurement needs a non-negative numeric t (day) and V (volume).';
    }
  }
  return null;
}

function createPatient(req, res) {
  const { code, age, sex, type, stage, tx, dataset } = req.body || {};
  if (!code || !String(code).trim()) return res.status(400).json({ error: 'Patient code is required.' });

  const err = validateDataset(dataset);
  if (err) return res.status(400).json({ error: err });

  const exists = db.prepare('SELECT id FROM patients WHERE member_id = ? AND code = ?').get(req.member.id, code.trim());
  if (exists) return res.status(409).json({ error: 'You already have a patient with that code.' });

  const id = 'p_' + uuidv4();
  const now = new Date().toISOString();
  const sortedDataset = [...dataset].sort((a, b) => a.t - b.t);

  db.prepare(`INSERT INTO patients
    (id, member_id, hospital_id, code, age, sex, cancer_type, stage, treatment_status, dataset, results, sim_count, registered_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,NULL,0,?,?)`)
    .run(id, req.member.id, req.member.hospital_id, code.trim(), age || null, sex || null, type || null, stage || null, tx || null, JSON.stringify(sortedDataset), now, now);

  logAudit('member', req.member.id, 'patient.created', code.trim());
  const row = db.prepare('SELECT * FROM patients WHERE id = ?').get(id);
  res.status(201).json({ patient: parsePatient(row) });
}

function updatePatientDataset(req, res) {
  const { dataset } = req.body || {};
  const err = validateDataset(dataset);
  if (err) return res.status(400).json({ error: err });

  const row = db.prepare('SELECT * FROM patients WHERE id = ? AND member_id = ?').get(req.params.id, req.member.id);
  if (!row) return res.status(404).json({ error: 'Patient not found.' });

  const sortedDataset = [...dataset].sort((a, b) => a.t - b.t);
  db.prepare('UPDATE patients SET dataset = ?, updated_at = ? WHERE id = ?')
    .run(JSON.stringify(sortedDataset), new Date().toISOString(), row.id);

  const updated = db.prepare('SELECT * FROM patients WHERE id = ?').get(row.id);
  res.json({ patient: parsePatient(updated) });
}

function simulatePatient(req, res) {
  const row = db.prepare('SELECT * FROM patients WHERE id = ? AND member_id = ?').get(req.params.id, req.member.id);
  if (!row) return res.status(404).json({ error: 'Patient not found.' });

  const dataset = JSON.parse(row.dataset);
  let results;
  try {
    results = runAllModels(dataset);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }

  db.prepare('UPDATE patients SET results = ?, sim_count = sim_count + 1, updated_at = ? WHERE id = ?')
    .run(JSON.stringify(results), new Date().toISOString(), row.id);

  logAudit('member', req.member.id, 'patient.simulated', `${row.code} -> ${results.risk}`);
  const updated = db.prepare('SELECT * FROM patients WHERE id = ?').get(row.id);
  res.json({ patient: parsePatient(updated) });
}

module.exports = { listPatients, getPatient, createPatient, updatePatientDataset, simulatePatient, parsePatient };

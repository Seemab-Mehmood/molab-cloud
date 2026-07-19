const bcrypt = require('bcryptjs');
const db = require('../db');
const { signSessionToken } = require('../services/tokenService');
const { sendApprovalEmail } = require('../services/emailService');
const { logAudit } = require('./authController');
const { config } = require('../config/env');

const COOKIE_NAME = 'molab_session';
const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: config.nodeEnv === 'production',
  maxAge: 12 * 60 * 60 * 1000, // shorter-lived than hospital sessions
  path: '/',
};

async function loginAdmin(req, res) {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });

  const admin = db.prepare('SELECT * FROM admins WHERE email = ?').get(String(email).toLowerCase());
  if (!admin) return res.status(401).json({ error: 'Incorrect email or password.' });

  const ok = await bcrypt.compare(password, admin.password_hash);
  if (!ok) return res.status(401).json({ error: 'Incorrect email or password.' });

  const token = signSessionToken({ role: 'admin', adminId: admin.id });
  res.cookie(COOKIE_NAME, token, cookieOptions);
  logAudit('admin', admin.id, 'admin.login', null);
  res.json({ admin: { id: admin.id, email: admin.email } });
}

function logoutAdmin(req, res) {
  res.clearCookie(COOKIE_NAME, { path: '/' });
  res.json({ message: 'Logged out.' });
}

function overview(req, res) {
  const total = db.prepare('SELECT COUNT(*) AS c FROM hospitals').get().c;
  const approved = db.prepare("SELECT COUNT(*) AS c FROM hospitals WHERE status = 'approved'").get().c;
  const pending = db.prepare("SELECT COUNT(*) AS c FROM hospitals WHERE status = 'pending'").get().c;
  const suspended = db.prepare("SELECT COUNT(*) AS c FROM hospitals WHERE status = 'suspended'").get().c;
  const totalPatients = db.prepare('SELECT COUNT(*) AS c FROM patients').get().c;
  const totalSims = db.prepare('SELECT COALESCE(SUM(sim_count),0) AS c FROM patients').get().c;
  res.json({ total, approved, pending, suspended, totalPatients, totalSims });
}

function listHospitals(req, res) {
  const rows = db.prepare(`
    SELECT h.*, (SELECT COUNT(*) FROM patients p WHERE p.hospital_id = h.id) AS patient_count
    FROM hospitals h ORDER BY h.created_at DESC
  `).all();
  res.json({
    hospitals: rows.map((h) => ({
      id: h.id, name: h.name, city: h.city, country: h.country, type: h.type,
      repName: h.rep_name, repEmail: h.rep_email, repPhone: h.rep_phone,
      status: h.status, emailVerified: !!h.email_verified,
      patientCount: h.patient_count, createdAt: h.created_at,
    })),
  });
}

async function setHospitalStatus(req, res) {
  const { status } = req.body || {};
  if (!['pending', 'approved', 'suspended'].includes(status)) {
    return res.status(400).json({ error: 'Status must be pending, approved, or suspended.' });
  }
  const hospital = db.prepare('SELECT * FROM hospitals WHERE id = ?').get(req.params.id);
  if (!hospital) return res.status(404).json({ error: 'Hospital not found.' });

  db.prepare('UPDATE hospitals SET status = ?, updated_at = ? WHERE id = ?').run(status, new Date().toISOString(), hospital.id);
  logAudit('admin', req.admin.id, 'hospital.status_changed', `${hospital.name} -> ${status}`);

  if (status === 'approved' && hospital.status !== 'approved') {
    await sendApprovalEmail(hospital.rep_email, hospital.name).catch((e) => console.error('[email] approval notice failed:', e.message));
  }
  res.json({ message: 'Status updated.' });
}

function listAllPatients(req, res) {
  const rows = db.prepare(`
    SELECT p.*, h.name AS hospital_name, h.city AS hospital_city, h.country AS hospital_country
    FROM patients p JOIN hospitals h ON h.id = p.hospital_id
    ORDER BY p.registered_at DESC
  `).all();
  res.json({
    patients: rows.map((p) => ({
      id: p.id, code: p.code, hospitalName: p.hospital_name, hospitalCity: p.hospital_city, hospitalCountry: p.hospital_country,
      type: p.cancer_type, stage: p.stage, registeredAt: p.registered_at,
      risk: p.results ? JSON.parse(p.results).risk : null, simCount: p.sim_count,
    })),
  });
}

function auditLog(req, res) {
  const rows = db.prepare('SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 200').all();
  res.json({ entries: rows });
}

module.exports = { loginAdmin, logoutAdmin, overview, listHospitals, setHospitalStatus, listAllPatients, auditLog };

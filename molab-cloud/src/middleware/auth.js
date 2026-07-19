const db = require('../db');
const { verifySessionToken } = require('../services/tokenService');
const { config } = require('../config/env');

/** Reads the session JWT from an httpOnly cookie and attaches req.session. */
function readSession(req, res, next) {
  const token = req.cookies && req.cookies.molab_session;
  req.session = token ? verifySessionToken(token) : null;
  next();
}

/** Requires a logged-in hospital representative; attaches req.hospital. */
function requireHospitalAuth(req, res, next) {
  if (!req.session || req.session.role !== 'hospital') {
    return res.status(401).json({ error: 'Not authenticated. Please log in.' });
  }
  const hospital = db.prepare('SELECT * FROM hospitals WHERE id = ?').get(req.session.hospitalId);
  if (!hospital) return res.status(401).json({ error: 'Account no longer exists.' });
  req.hospital = hospital;
  next();
}

/** Requires the hospital to be admin-approved (blocks patient writes otherwise). */
function requireApprovedHospital(req, res, next) {
  if (req.hospital.status !== 'approved') {
    return res.status(403).json({ error: 'Your hospital must be approved by an administrator before this action is available.' });
  }
  next();
}

/**
 * Requires a logged-in admin AND, if configured, a matching x-admin-key header.
 * This is the actual security boundary for the admin panel — the secret URL
 * path is defense-in-depth, not a substitute for this check.
 */
function requireAdminAuth(req, res, next) {
  if (config.adminAccessKey) {
    const providedKey = req.get('x-admin-key');
    if (providedKey !== config.adminAccessKey) {
      return res.status(404).end(); // 404, not 401 — do not reveal the route exists
    }
  }
  if (!req.session || req.session.role !== 'admin') {
    return res.status(401).json({ error: 'Not authenticated.' });
  }
  const admin = db.prepare('SELECT * FROM admins WHERE id = ?').get(req.session.adminId);
  if (!admin) return res.status(401).json({ error: 'Account no longer exists.' });
  req.admin = admin;
  next();
}

module.exports = { readSession, requireHospitalAuth, requireApprovedHospital, requireAdminAuth };

const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { config } = require('../config/env');
const { signSessionToken, generateOpaqueToken, hoursFromNowISO } = require('../services/tokenService');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../services/emailService');

const COOKIE_NAME = 'molab_session';
const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: config.nodeEnv === 'production',
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: '/',
};

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ---------------------------------------------------------------- register
async function registerHospital(req, res) {
  const { name, city, country, type, repName, repRole, repEmail, repPhone, password } = req.body || {};

  if (!name || !city || !country || !repName || !repEmail || !password) {
    return res.status(400).json({ error: 'Hospital name, city, country, representative name, email, and password are required.' });
  }
  if (!isValidEmail(repEmail)) return res.status(400).json({ error: 'Enter a valid email address.' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });

  const existing = db.prepare('SELECT id FROM hospitals WHERE rep_email = ?').get(repEmail.toLowerCase());
  if (existing) return res.status(409).json({ error: 'An account already exists with that representative email.' });

  const id = 'h_' + uuidv4();
  const passwordHash = await bcrypt.hash(password, 12);
  const now = new Date().toISOString();

  db.prepare(`INSERT INTO hospitals
    (id, name, city, country, type, rep_name, rep_role, rep_email, rep_phone, password_hash, email_verified, status, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,0,'pending',?,?)`)
    .run(id, name, city, country, type || 'Not specified', repName, repRole || null, repEmail.toLowerCase(), repPhone || null, passwordHash, now, now);

  const token = generateOpaqueToken();
  db.prepare('INSERT INTO email_verification_tokens (token, hospital_id, expires_at, created_at) VALUES (?,?,?,?)')
    .run(token, id, hoursFromNowISO(config.verificationTokenTtlHours), now);

  const verifyUrl = `${config.appBaseUrl}/api/auth/verify-email?token=${token}`;
  const mailResult = await sendVerificationEmail(repEmail, name, verifyUrl);

  logAudit('hospital', id, 'hospital.registered', `${name} (${city}, ${country})`);

  res.status(201).json({
    message: 'Registration received. Check your email to verify your account before logging in.',
    emailDelivery: mailResult.mode, // 'smtp' or 'logged' — useful for local/dev testing
  });
}

// ------------------------------------------------------------- verify email
function verifyEmail(req, res) {
  const { token } = req.query;
  if (!token) return res.status(400).send('Missing verification token.');

  const row = db.prepare('SELECT * FROM email_verification_tokens WHERE token = ?').get(token);
  if (!row) return res.redirect(`${config.appBaseUrl}/verify.html?status=invalid`);
  if (new Date(row.expires_at) < new Date()) return res.redirect(`${config.appBaseUrl}/verify.html?status=expired`);

  db.prepare('UPDATE hospitals SET email_verified = 1, updated_at = ? WHERE id = ?').run(new Date().toISOString(), row.hospital_id);
  db.prepare('DELETE FROM email_verification_tokens WHERE token = ?').run(token);
  logAudit('hospital', row.hospital_id, 'hospital.email_verified', null);

  res.redirect(`${config.appBaseUrl}/verify.html?status=success`);
}

async function resendVerification(req, res) {
  const { repEmail } = req.body || {};
  if (!repEmail) return res.status(400).json({ error: 'Email is required.' });
  const hospital = db.prepare('SELECT * FROM hospitals WHERE rep_email = ?').get(repEmail.toLowerCase());
  // Do not reveal whether the account exists.
  if (!hospital || hospital.email_verified) {
    return res.json({ message: 'If an unverified account exists with that email, a new verification link has been sent.' });
  }
  const token = generateOpaqueToken();
  db.prepare('INSERT INTO email_verification_tokens (token, hospital_id, expires_at, created_at) VALUES (?,?,?,?)')
    .run(token, hospital.id, hoursFromNowISO(config.verificationTokenTtlHours), new Date().toISOString());
  const verifyUrl = `${config.appBaseUrl}/api/auth/verify-email?token=${token}`;
  await sendVerificationEmail(hospital.rep_email, hospital.name, verifyUrl);
  res.json({ message: 'If an unverified account exists with that email, a new verification link has been sent.' });
}

// ------------------------------------------------------------------- login
async function loginHospital(req, res) {
  const { repEmail, password } = req.body || {};
  if (!repEmail || !password) return res.status(400).json({ error: 'Email and password are required.' });

  const hospital = db.prepare('SELECT * FROM hospitals WHERE rep_email = ?').get(repEmail.toLowerCase());
  if (!hospital) return res.status(401).json({ error: 'Incorrect email or password.' });

  const ok = await bcrypt.compare(password, hospital.password_hash);
  if (!ok) return res.status(401).json({ error: 'Incorrect email or password.' });

  if (!hospital.email_verified) {
    return res.status(403).json({ error: 'Please verify your email before logging in.', code: 'EMAIL_NOT_VERIFIED' });
  }

  const token = signSessionToken({ role: 'hospital', hospitalId: hospital.id });
  res.cookie(COOKIE_NAME, token, cookieOptions);
  logAudit('hospital', hospital.id, 'hospital.login', null);

  res.json({
    hospital: publicHospitalView(hospital),
  });
}

function logoutHospital(req, res) {
  res.clearCookie(COOKIE_NAME, { path: '/' });
  res.json({ message: 'Logged out.' });
}

function me(req, res) {
  if (!req.session) return res.json({ session: null });
  if (req.session.role === 'hospital') {
    const hospital = db.prepare('SELECT * FROM hospitals WHERE id = ?').get(req.session.hospitalId);
    if (!hospital) return res.json({ session: null });
    return res.json({ session: { role: 'hospital', hospital: publicHospitalView(hospital) } });
  }
  return res.json({ session: null });
}

// ------------------------------------------------------------- helpers
function publicHospitalView(h) {
  return {
    id: h.id, name: h.name, city: h.city, country: h.country, type: h.type,
    repName: h.rep_name, repRole: h.rep_role, repEmail: h.rep_email, repPhone: h.rep_phone,
    status: h.status, emailVerified: !!h.email_verified, createdAt: h.created_at,
  };
}
function logAudit(actorType, actorId, action, detail) {
  db.prepare('INSERT INTO audit_log (id, actor_type, actor_id, action, detail, created_at) VALUES (?,?,?,?,?,?)')
    .run('a_' + require('uuid').v4(), actorType, actorId, action, detail, new Date().toISOString());
}

module.exports = { registerHospital, verifyEmail, resendVerification, loginHospital, logoutHospital, me, publicHospitalView, logAudit, COOKIE_NAME };

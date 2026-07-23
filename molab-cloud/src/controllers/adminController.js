const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { config } = require('../config/env');
const { signSessionToken } = require('../services/tokenService');
const { sendFeedbackEmail } = require('../services/emailService');
const { parseRosterBuffer } = require('../services/excelRoster');
const { computeMembershipLock } = require('../middleware/auth');
const { logAudit } = require('./sharedAudit');
const { parsePatient } = require('./patientController');

const COOKIE_NAME = 'molab_session';
const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: config.nodeEnv === 'production',
  maxAge: 12 * 60 * 60 * 1000,
  path: '/',
};

function addDaysISO(days) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

// ------------------------------------------------------------------- login
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

// ---------------------------------------------------------------- overview
function overview(req, res) {
  const totalMembers = db.prepare('SELECT COUNT(*) AS c FROM members').get().c;
  const suspendedMembers = db.prepare("SELECT COUNT(*) AS c FROM members WHERE status = 'suspended'").get().c;
  const nowIso = new Date().toISOString();
  const expiredMembers = db.prepare("SELECT COUNT(*) AS c FROM members WHERE status = 'active' AND membership_expires_at < ?").get(nowIso).c;
  const activeMembers = totalMembers - suspendedMembers - expiredMembers;
  const totalHospitals = db.prepare('SELECT COUNT(*) AS c FROM hospitals').get().c;
  const totalPatients = db.prepare('SELECT COUNT(*) AS c FROM patients').get().c;
  const totalSims = db.prepare('SELECT COALESCE(SUM(sim_count),0) AS c FROM patients').get().c;
  const totalPosts = db.prepare('SELECT COUNT(*) AS c FROM community_posts').get().c;
  res.json({ totalMembers, activeMembers, expiredMembers, suspendedMembers, totalHospitals, totalPatients, totalSims, totalPosts });
}

// ------------------------------------------------------------ roster: read
function listRoster(req, res) {
  const rows = db.prepare(`
    SELECT m.*, h.name AS hospital_name, h.country AS hospital_country,
      (SELECT COUNT(*) FROM patients p WHERE p.member_id = m.id) AS patient_count
    FROM members m JOIN hospitals h ON h.id = m.hospital_id
    ORDER BY m.created_at DESC
  `).all();
  res.json({
    members: rows.map((m) => {
      const lock = computeMembershipLock(m);
      return {
        id: m.id, molabId: m.molab_id, fullName: m.full_name, email: m.email,
        hospitalName: m.hospital_name, hospitalCountry: m.hospital_country, tier: m.tier,
        status: m.status, blockedReason: m.blocked_reason,
        membershipStartedAt: m.membership_started_at, membershipExpiresAt: m.membership_expires_at,
        isLocked: lock.locked, lockReason: lock.reason,
        agreementAccepted: !!m.agreement_accepted,
        patientCount: m.patient_count, createdAt: m.created_at,
      };
    }),
  });
}

function listRosterImports(req, res) {
  const rows = db.prepare('SELECT * FROM roster_imports ORDER BY created_at DESC LIMIT 20').all();
  res.json({ imports: rows.map((r) => ({ ...r, errors: r.errors ? JSON.parse(r.errors) : [] })) });
}

// ----------------------------------------------------------- roster: write
async function uploadRoster(req, res) {
  if (!req.file) return res.status(400).json({ error: 'Attach an .xlsx or .csv file under the "file" field.' });

  let parsed;
  try {
    parsed = parseRosterBuffer(req.file.buffer);
  } catch (e) {
    return res.status(400).json({ error: 'Could not read that file. Make sure it is a valid .xlsx or .csv export.' });
  }

  let created = 0, updated = 0, skipped = 0;
  const warnings = [...parsed.warnings];

  const upsertHospital = db.transaction((name, country) => {
    const existing = db.prepare('SELECT id FROM hospitals WHERE name = ? AND country = ?').get(name, country);
    if (existing) return existing.id;
    const id = 'h_' + uuidv4();
    db.prepare('INSERT INTO hospitals (id, name, country, created_at) VALUES (?,?,?,?)').run(id, name, country, new Date().toISOString());
    return id;
  });

  for (const row of parsed.rows) {
    const hospitalId = upsertHospital(row.hospital, row.country);
    const now = new Date().toISOString();

    const byMolabId = db.prepare('SELECT * FROM members WHERE molab_id = ?').get(row.molabId);
    const byEmail = db.prepare('SELECT * FROM members WHERE email = ?').get(row.email);

    if (byMolabId && byEmail && byMolabId.id !== byEmail.id) {
      warnings.push(`Row for "${row.fullName}": MOLAB ID and email belong to two different existing accounts — skipped.`);
      skipped++;
      continue;
    }

    const existing = byMolabId || byEmail;
    if (existing) {
      // Membership clock, status, and agreement are left untouched on update —
      // re-uploading a refreshed roster should not silently reset anyone's access.
      db.prepare(`UPDATE members SET full_name=?, email=?, hospital_id=?, country=?, tier=?, updated_at=? WHERE id=?`)
        .run(row.fullName, row.email, hospitalId, row.country, row.tier, now, existing.id);
      updated++;
    } else {
      const id = 'm_' + uuidv4();
      db.prepare(`INSERT INTO members
        (id, molab_id, full_name, email, hospital_id, country, tier, status, agreement_accepted,
         membership_started_at, membership_expires_at, created_at, updated_at)
        VALUES (?,?,?,?,?,?,?,'active',0,?,?,?,?)`)
        .run(id, row.molabId, row.fullName, row.email, hospitalId, row.country, row.tier, now, addDaysISO(config.membershipDurationDays), now, now);
      created++;
    }
  }

  const importRecord = {
    id: 'ri_' + uuidv4(), admin_id: req.admin.id, filename: req.file.originalname,
    rows_total: parsed.rows.length + parsed.warnings.length, rows_created: created, rows_updated: updated,
    rows_skipped: skipped, errors: JSON.stringify(warnings), created_at: new Date().toISOString(),
  };
  db.prepare(`INSERT INTO roster_imports (id, admin_id, filename, rows_total, rows_created, rows_updated, rows_skipped, errors, created_at)
    VALUES (@id,@admin_id,@filename,@rows_total,@rows_created,@rows_updated,@rows_skipped,@errors,@created_at)`).run(importRecord);

  logAudit('admin', req.admin.id, 'roster.imported', `${req.file.originalname}: +${created} created, ${updated} updated, ${skipped} skipped`);

  res.json({ created, updated, skipped, warnings });
}

function setMemberStatus(req, res) {
  const { status, reason } = req.body || {};
  if (!['active', 'suspended'].includes(status)) return res.status(400).json({ error: 'Status must be active or suspended.' });
  const member = db.prepare('SELECT * FROM members WHERE id = ?').get(req.params.id);
  if (!member) return res.status(404).json({ error: 'Member not found.' });

  db.prepare('UPDATE members SET status = ?, blocked_reason = ?, updated_at = ? WHERE id = ?')
    .run(status, status === 'suspended' ? (reason || 'No reason provided.') : null, new Date().toISOString(), member.id);
  logAudit('admin', req.admin.id, 'member.status_changed', `${member.full_name} -> ${status}${reason ? ' ('+reason+')' : ''}`);
  res.json({ message: 'Status updated.' });
}

function renewMembership(req, res) {
  const member = db.prepare('SELECT * FROM members WHERE id = ?').get(req.params.id);
  if (!member) return res.status(404).json({ error: 'Member not found.' });

  const now = new Date().toISOString();
  const expires = addDaysISO(config.membershipDurationDays);
  db.prepare('UPDATE members SET membership_started_at = ?, membership_expires_at = ?, updated_at = ? WHERE id = ?')
    .run(now, expires, now, member.id);
  logAudit('admin', req.admin.id, 'member.membership_renewed', `${member.full_name} -> expires ${expires}`);
  res.json({ message: 'Membership renewed for another term.', membershipExpiresAt: expires });
}

// ------------------------------------------------------------------ email
async function emailMember(req, res) {
  const { subject, message } = req.body || {};
  if (!subject || !message) return res.status(400).json({ error: 'Subject and message are required.' });
  const member = db.prepare('SELECT * FROM members WHERE id = ?').get(req.params.id);
  if (!member) return res.status(404).json({ error: 'Member not found.' });
  const result = await sendFeedbackEmail(member.email, subject, message);
  logAudit('admin', req.admin.id, 'member.emailed', `${member.email}: ${subject}`);
  res.json({ message: 'Email sent.', emailDelivery: result.mode });
}

async function broadcastEmail(req, res) {
  const { subject, message, hospitalId } = req.body || {};
  if (!subject || !message) return res.status(400).json({ error: 'Subject and message are required.' });
  const members = hospitalId
    ? db.prepare("SELECT * FROM members WHERE hospital_id = ?").all(hospitalId)
    : db.prepare("SELECT * FROM members").all();

  let sent = 0;
  for (const m of members) {
    try { await sendFeedbackEmail(m.email, subject, message); sent++; }
    catch (e) { /* continue sending to the rest */ }
  }
  logAudit('admin', req.admin.id, 'broadcast.sent', `${subject} -> ${sent} member(s)`);
  res.json({ message: `Sent to ${sent} of ${members.length} member(s).` });
}

// ---------------------------------------------------------------- patients
function listAllPatients(req, res) {
  const rows = db.prepare(`
    SELECT p.*, m.full_name AS member_name, m.molab_id, h.name AS hospital_name, h.country AS hospital_country
    FROM patients p JOIN members m ON m.id = p.member_id JOIN hospitals h ON h.id = p.hospital_id
    ORDER BY p.registered_at DESC
  `).all();
  res.json({
    patients: rows.map((p) => ({
      id: p.id, code: p.code, memberName: p.member_name, molabId: p.molab_id,
      hospitalName: p.hospital_name, hospitalCountry: p.hospital_country,
      type: p.cancer_type, stage: p.stage, registeredAt: p.registered_at,
      risk: p.results ? JSON.parse(p.results).risk : null, simCount: p.sim_count,
    })),
  });
}

function getPatientDetail(req, res) {
  const row = db.prepare(`
    SELECT p.*, m.full_name AS member_name, m.molab_id, h.name AS hospital_name, h.country AS hospital_country
    FROM patients p JOIN members m ON m.id = p.member_id JOIN hospitals h ON h.id = p.hospital_id
    WHERE p.id = ?
  `).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Patient not found.' });
  const patient = parsePatient(row);
  res.json({ patient: { ...patient, memberName: row.member_name, molabId: row.molab_id, hospitalName: row.hospital_name, hospitalCountry: row.hospital_country } });
}

function auditLog(req, res) {
  const rows = db.prepare('SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 300').all();
  res.json({ entries: rows });
}

function listHospitals(req, res) {
  const rows = db.prepare(`
    SELECT h.*, (SELECT COUNT(*) FROM members m WHERE m.hospital_id = h.id) AS member_count
    FROM hospitals h ORDER BY h.name ASC
  `).all();
  res.json({ hospitals: rows });
}

module.exports = {
  loginAdmin, logoutAdmin, overview,
  listRoster, listRosterImports, uploadRoster, setMemberStatus, renewMembership,
  emailMember, broadcastEmail,
  listAllPatients, getPatientDetail, auditLog, listHospitals,
};

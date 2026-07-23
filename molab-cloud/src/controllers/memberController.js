const db = require('../db');
const { config } = require('../config/env');
const { signSessionToken } = require('../services/tokenService');
const { sendContactAdminEmail } = require('../services/emailService');
const { computeMembershipLock } = require('../middleware/auth');
const { logAudit } = require('./sharedAudit');

const COOKIE_NAME = 'molab_session';
const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: config.nodeEnv === 'production',
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: '/',
};

function daysBetween(fromDate, toDate) {
  return Math.ceil((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24));
}

function publicMemberView(m) {
  const hospital = db.prepare('SELECT * FROM hospitals WHERE id = ?').get(m.hospital_id);
  const lock = computeMembershipLock(m);
  const expiresAt = new Date(m.membership_expires_at);
  return {
    id: m.id, molabId: m.molab_id, fullName: m.full_name, email: m.email,
    hospital: hospital ? { id: hospital.id, name: hospital.name, country: hospital.country } : null,
    country: m.country, tier: m.tier, status: m.status,
    agreementAccepted: !!m.agreement_accepted, agreementAcceptedAt: m.agreement_accepted_at,
    membershipStartedAt: m.membership_started_at,
    membershipExpiresAt: m.membership_expires_at,
    daysRemaining: Math.max(0, daysBetween(new Date(), expiresAt)),
    isLocked: lock.locked, lockReason: lock.reason, blockedReason: lock.blockedReason,
    createdAt: m.created_at,
  };
}

// ------------------------------------------------------------------- login
// Login is name + MOLAB Membership ID only — no password. MOLAB IDs are
// distributed to members directly by the MOLAB Team, not self-chosen.
// Login always succeeds for a matching name+ID pair regardless of whether
// the membership is currently locked (expired/suspended) — the member can
// still log in to see their status and use Contact Admin; activity routes
// enforce the lock separately (see requireActiveMembership).
async function loginMember(req, res) {
  const { fullName, molabId } = req.body || {};
  if (!fullName || !molabId) {
    return res.status(400).json({ error: 'Full name and MOLAB Membership ID are required.' });
  }

  const member = db.prepare('SELECT * FROM members WHERE molab_id = ?').get(String(molabId).trim());
  if (!member) return res.status(401).json({ error: 'No account found for that name and MOLAB Membership ID.' });

  const nameMatches = member.full_name.trim().toLowerCase() === String(fullName).trim().toLowerCase();
  if (!nameMatches) return res.status(401).json({ error: 'No account found for that name and MOLAB Membership ID.' });

  const token = signSessionToken({ role: 'member', memberId: member.id });
  res.cookie(COOKIE_NAME, token, cookieOptions);
  logAudit('member', member.id, 'member.login', null);
  res.json({ member: publicMemberView(member) });
}

function logoutMember(req, res) {
  res.clearCookie(COOKIE_NAME, { path: '/' });
  res.json({ message: 'Logged out.' });
}

function me(req, res) {
  if (!req.session || req.session.role !== 'member') return res.json({ session: null });
  const member = db.prepare('SELECT * FROM members WHERE id = ?').get(req.session.memberId);
  if (!member) return res.json({ session: null });
  res.json({ session: { role: 'member', member: publicMemberView(member) } });
}

// --------------------------------------------------------------- contact
// Always available, even to locked members — this is precisely how they're
// expected to resolve an expired/blocked membership.
async function contactAdmin(req, res) {
  const { subject, message } = req.body || {};
  if (!subject || !subject.trim() || !message || !message.trim()) {
    return res.status(400).json({ error: 'Subject and message are required.' });
  }
  const result = await sendContactAdminEmail({
    adminEmail: config.adminContactEmail,
    memberName: req.member.full_name,
    molabId: req.member.molab_id,
    memberEmail: req.member.email,
    subject: subject.trim().slice(0, 200),
    message: message.trim().slice(0, 5000),
  });
  logAudit('member', req.member.id, 'member.contacted_admin', subject.trim().slice(0, 80));
  res.json({ message: 'Your message has been sent to the MOLAB Team.', emailDelivery: result.mode });
}

module.exports = { loginMember, logoutMember, me, contactAdmin, publicMemberView };

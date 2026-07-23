const db = require('../db');
const { verifySessionToken } = require('../services/tokenService');
const { config } = require('../config/env');

/** Reads the session JWT from an httpOnly cookie and attaches req.session. */
function readSession(req, res, next) {
  const token = req.cookies && req.cookies.molab_session;
  req.session = token ? verifySessionToken(token) : null;
  next();
}

/**
 * Computes whether a member's activity access is locked, and why.
 * Locked = admin-suspended OR their 12-month membership window has passed.
 * Both produce the same experience for the member (login still works;
 * activities are blocked) per MOLAB policy.
 */
function computeMembershipLock(member) {
  if (member.status === 'suspended') {
    return { locked: true, reason: 'suspended', blockedReason: member.blocked_reason || null };
  }
  const expiresAt = member.membership_expires_at ? new Date(member.membership_expires_at) : null;
  if (expiresAt && expiresAt.getTime() < Date.now()) {
    return { locked: true, reason: 'expired', blockedReason: null };
  }
  return { locked: false, reason: null, blockedReason: null };
}

/** Requires a logged-in member; attaches req.member. Login always works even if locked. */
function requireMemberAuth(req, res, next) {
  if (!req.session || req.session.role !== 'member') {
    return res.status(401).json({ error: 'Not authenticated. Please log in.' });
  }
  const member = db.prepare('SELECT * FROM members WHERE id = ?').get(req.session.memberId);
  if (!member) return res.status(401).json({ error: 'Account no longer exists.' });
  req.member = member;
  next();
}

/** Requires the member's membership to currently be active (not expired/blocked). */
function requireActiveMembership(req, res, next) {
  const lock = computeMembershipLock(req.member);
  if (lock.locked) {
    return res.status(403).json({
      error: 'Your access to vMOLAB Learn has expired. Please check your membership status with MOLAB admin.',
      code: 'MEMBERSHIP_LOCKED',
      reason: lock.reason,
    });
  }
  next();
}

/** Requires the member to have accepted the research data-use agreement. */
function requireAgreement(req, res, next) {
  if (!req.member.agreement_accepted) {
    return res.status(403).json({ error: 'You must accept the data-use agreement before registering patients.', code: 'AGREEMENT_REQUIRED' });
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

module.exports = { readSession, requireMemberAuth, requireActiveMembership, requireAgreement, requireAdminAuth, computeMembershipLock };

const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { config } = require('../config/env');

/**
 * One-time bootstrap: if ADMIN_SEED_EMAIL / ADMIN_SEED_PASSWORD are set in
 * .env and no admin with that email exists yet, create it. This runs once
 * per email — if you later change the admin's password via
 * `npm run create-admin`, that change persists even though these env vars
 * remain set (this function only acts when the account doesn't exist yet).
 */
async function seedAdminIfConfigured() {
  if (!config.adminSeedEmail || !config.adminSeedPassword) return;

  const email = config.adminSeedEmail.toLowerCase();
  const existing = db.prepare('SELECT id FROM admins WHERE email = ?').get(email);
  if (existing) return;

  if (config.adminSeedPassword.length < 8) {
    console.warn(`[admin-seed] ADMIN_SEED_PASSWORD is shorter than 8 characters — skipping auto-seed for safety.`);
    return;
  }

  const passwordHash = await bcrypt.hash(config.adminSeedPassword, 12);
  db.prepare('INSERT INTO admins (id, email, password_hash, created_at) VALUES (?,?,?,?)')
    .run('adm_' + uuidv4(), email, passwordHash, new Date().toISOString());

  console.log(`[admin-seed] Created initial admin account for ${email}.`);
  console.log('[admin-seed] Consider removing ADMIN_SEED_PASSWORD from .env once you have confirmed this login works.');
}

module.exports = { seedAdminIfConfigured };

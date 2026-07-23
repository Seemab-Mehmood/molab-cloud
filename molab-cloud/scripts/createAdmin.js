/**
 * Developer-only CLI to create (or reset) an admin account.
 * There is no public admin signup endpoint on purpose — this script is
 * the only way to provision an admin, and it must be run on the server
 * itself (e.g. `npm run create-admin`), never exposed over HTTP.
 *
 * Usage:
 *   npm run create-admin -- admin@yourorg.com "a-strong-password"
 */
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const readline = require('readline');
const db = require('../src/db');

function prompt(question, hidden = false) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => { rl.close(); resolve(answer); });
  });
}

async function main() {
  const argEmail = process.argv[2];
  const argPassword = process.argv[3];

  const email = (argEmail || await prompt('Admin email: ')).trim().toLowerCase();
  const password = argPassword || await prompt('Admin password (min 10 chars): ');

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error('Invalid email.'); process.exit(1);
  }
  if (!password || password.length < 10) {
    console.error('Password must be at least 10 characters.'); process.exit(1);
  }

  const existing = db.prepare('SELECT id FROM admins WHERE email = ?').get(email);
  const passwordHash = await bcrypt.hash(password, 12);

  if (existing) {
    db.prepare('UPDATE admins SET password_hash = ? WHERE id = ?').run(passwordHash, existing.id);
    console.log(`Updated password for existing admin: ${email}`);
  } else {
    db.prepare('INSERT INTO admins (id, email, password_hash, created_at) VALUES (?,?,?,?)')
      .run('adm_' + uuidv4(), email, passwordHash, new Date().toISOString());
    console.log(`Created admin account: ${email}`);
  }
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });

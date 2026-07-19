// Running this file initializes/upgrades the SQLite schema (schema.sql uses
// CREATE TABLE IF NOT EXISTS, so this is safe to re-run at any time, e.g.
// as a release-time step before starting the server).
const db = require('../src/db');
console.log('Schema is up to date at', db.name);
process.exit(0);

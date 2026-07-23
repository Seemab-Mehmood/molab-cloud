const { v4: uuidv4 } = require('uuid');
const db = require('../db');

function logAudit(actorType, actorId, action, detail) {
  db.prepare('INSERT INTO audit_log (id, actor_type, actor_id, action, detail, created_at) VALUES (?,?,?,?,?,?)')
    .run('a_' + uuidv4(), actorType, actorId, action, detail || null, new Date().toISOString());
}

module.exports = { logAudit };

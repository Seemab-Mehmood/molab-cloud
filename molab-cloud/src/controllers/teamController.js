const db = require('../db');

function myTeam(req, res) {
  const rows = db.prepare(`
    SELECT id, molab_id, full_name, email, tier, status, created_at
    FROM members WHERE hospital_id = ? ORDER BY full_name ASC
  `).all(req.member.hospital_id);

  const hospital = db.prepare('SELECT * FROM hospitals WHERE id = ?').get(req.member.hospital_id);

  res.json({
    hospital: hospital ? { id: hospital.id, name: hospital.name, country: hospital.country } : null,
    members: rows.map((m) => ({
      id: m.id, molabId: m.molab_id, fullName: m.full_name, email: m.email,
      tier: m.tier, status: m.status, isYou: m.id === req.member.id, createdAt: m.created_at,
    })),
  });
}

module.exports = { myTeam };

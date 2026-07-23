-- MOLAB Cloud database schema (SQLite)
-- Membership model: accounts exist ONLY via admin roster import.
-- Login is name + MOLAB Membership ID — no password, no email activation.
-- Every membership runs on a 12-month clock from the day the account is
-- created; admin can also manually block a member at any time (policy
-- violations / community complaints) with the same effect as expiry.

CREATE TABLE IF NOT EXISTS hospitals (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  country TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(name, country)
);

CREATE TABLE IF NOT EXISTS members (
  id TEXT PRIMARY KEY,
  molab_id TEXT NOT NULL UNIQUE,          -- MOLAB membership ID (from roster)
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  hospital_id TEXT NOT NULL,
  country TEXT NOT NULL,
  tier TEXT NOT NULL DEFAULT 'Member',     -- membership tier, e.g. Clinician / Researcher / Student
  status TEXT NOT NULL DEFAULT 'active',   -- active | suspended (admin-blocked)
  blocked_reason TEXT,                     -- set when status = suspended
  membership_started_at TEXT NOT NULL,
  membership_expires_at TEXT NOT NULL,     -- 12 months from membership_started_at
  agreement_accepted INTEGER NOT NULL DEFAULT 0,
  agreement_accepted_at TEXT,
  agreement_signature_name TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (hospital_id) REFERENCES hospitals(id)
);

CREATE TABLE IF NOT EXISTS roster_imports (
  id TEXT PRIMARY KEY,
  admin_id TEXT,
  filename TEXT,
  rows_total INTEGER NOT NULL DEFAULT 0,
  rows_created INTEGER NOT NULL DEFAULT 0,
  rows_updated INTEGER NOT NULL DEFAULT 0,
  rows_skipped INTEGER NOT NULL DEFAULT 0,
  errors TEXT,                              -- JSON array of row-level warnings
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS patients (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  hospital_id TEXT NOT NULL,                -- denormalized for admin oversight
  code TEXT NOT NULL,
  age TEXT,
  sex TEXT,
  cancer_type TEXT,
  stage TEXT,
  treatment_status TEXT,
  dataset TEXT NOT NULL,                    -- JSON array of {t, v}
  results TEXT,                             -- JSON of last simulation result
  sim_count INTEGER NOT NULL DEFAULT 0,
  registered_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
  FOREIGN KEY (hospital_id) REFERENCES hospitals(id),
  UNIQUE(member_id, code)
);

CREATE TABLE IF NOT EXISTS admins (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  actor_type TEXT NOT NULL,                 -- member | admin | system
  actor_id TEXT,
  action TEXT NOT NULL,
  detail TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS community_posts (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS community_comments (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (post_id) REFERENCES community_posts(id) ON DELETE CASCADE,
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS community_reactions (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'like',
  created_at TEXT NOT NULL,
  UNIQUE(post_id, member_id, type),
  FOREIGN KEY (post_id) REFERENCES community_posts(id) ON DELETE CASCADE,
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_patients_member ON patients(member_id);
CREATE INDEX IF NOT EXISTS idx_members_hospital ON members(hospital_id);
CREATE INDEX IF NOT EXISTS idx_members_status ON members(status);
CREATE INDEX IF NOT EXISTS idx_members_expires ON members(membership_expires_at);
CREATE INDEX IF NOT EXISTS idx_comments_post ON community_comments(post_id);
CREATE INDEX IF NOT EXISTS idx_reactions_post ON community_reactions(post_id);

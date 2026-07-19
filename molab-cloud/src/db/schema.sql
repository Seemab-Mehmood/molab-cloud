-- MOLAB Cloud database schema (SQLite)

CREATE TABLE IF NOT EXISTS hospitals (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  city TEXT NOT NULL,
  country TEXT NOT NULL,
  type TEXT NOT NULL,
  rep_name TEXT NOT NULL,
  rep_role TEXT,
  rep_email TEXT NOT NULL UNIQUE,
  rep_phone TEXT,
  password_hash TEXT NOT NULL,
  email_verified INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',      -- pending | approved | suspended
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS email_verification_tokens (
  token TEXT PRIMARY KEY,
  hospital_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (hospital_id) REFERENCES hospitals(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  token TEXT PRIMARY KEY,
  hospital_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (hospital_id) REFERENCES hospitals(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS patients (
  id TEXT PRIMARY KEY,
  hospital_id TEXT NOT NULL,
  code TEXT NOT NULL,
  age TEXT,
  sex TEXT,
  cancer_type TEXT,
  stage TEXT,
  treatment_status TEXT,
  dataset TEXT NOT NULL,          -- JSON array of {t, v}
  results TEXT,                   -- JSON of last simulation result, nullable
  sim_count INTEGER NOT NULL DEFAULT 0,
  registered_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (hospital_id) REFERENCES hospitals(id) ON DELETE CASCADE,
  UNIQUE(hospital_id, code)
);

CREATE TABLE IF NOT EXISTS admins (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  actor_type TEXT NOT NULL,        -- hospital | admin | system
  actor_id TEXT,
  action TEXT NOT NULL,
  detail TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_patients_hospital ON patients(hospital_id);
CREATE INDEX IF NOT EXISTS idx_hospitals_status ON hospitals(status);

-- Rapha HNaaS — Care Navigator Agent (MVP) schema
-- PostgreSQL. Mirrors the PRD §4.5 data models plus auth + routing/escalation tables.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- Patients (PRD: Patient). Note: PHI fields are marked; in production these
-- columns would be encrypted at rest (pgcrypto / KMS-backed). Kept plaintext
-- here for a runnable MVP, but the column comments document the requirement.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS patients (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT        NOT NULL,                 -- PHI: encrypt at rest
  email           TEXT        NOT NULL UNIQUE,          -- PHI: encrypt at rest
  password_hash   TEXT        NOT NULL,
  date_of_birth   DATE,                                 -- PHI: encrypt at rest
  diagnosis       TEXT[]      NOT NULL DEFAULT '{}',    -- e.g. {fibromyalgia,POTS}
  insurance_info  JSONB       NOT NULL DEFAULT '{}'::jsonb, -- PHI: encrypt at rest
  care_goals      TEXT,
  consent_flags   JSONB       NOT NULL DEFAULT '{}'::jsonb,
  onboarding_step INTEGER     NOT NULL DEFAULT 0,       -- save-and-resume
  onboarding_done BOOLEAN     NOT NULL DEFAULT FALSE,
  role            TEXT        NOT NULL DEFAULT 'patient', -- patient | staff | employer
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Navigator sessions (PRD: NavigatorSession)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS navigator_sessions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id        UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  messages          JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{role,content,ts,agent_id}]
  data_tags         JSONB NOT NULL DEFAULT '{}'::jsonb,  -- zero-party structured data
  escalation_status TEXT  NOT NULL DEFAULT 'none',       -- none|pending|active|resolved
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at         TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sessions_patient ON navigator_sessions(patient_id);

-- ---------------------------------------------------------------------------
-- Routing events (PRD §8.2 RoutingEvent) — one row per specialist handoff
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS routing_events (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id     UUID NOT NULL REFERENCES navigator_sessions(id) ON DELETE CASCADE,
  patient_id     UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  need_type      TEXT NOT NULL,
  routed_to      TEXT NOT NULL,
  reason         TEXT,
  outcome        TEXT NOT NULL DEFAULT 'engaged',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_routing_session ON routing_events(session_id);

-- ---------------------------------------------------------------------------
-- Escalation packets (PRD §8.2 EscalationPacket + Feature 5)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS escalation_packets (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id         UUID NOT NULL REFERENCES navigator_sessions(id) ON DELETE CASCADE,
  patient_id         UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  profile_summary    TEXT NOT NULL,
  transcript         JSONB NOT NULL DEFAULT '[]'::jsonb,
  identified_need    TEXT NOT NULL,
  urgency            TEXT NOT NULL DEFAULT 'normal',   -- normal | urgent | crisis
  recommended_action TEXT NOT NULL,
  status             TEXT NOT NULL DEFAULT 'pending',  -- pending|active|resolved
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_escalation_patient ON escalation_packets(patient_id);

-- ---------------------------------------------------------------------------
-- HIPAA-style audit log (PRD §4.3 HIPAA_AUDIT_LOG_ENABLED, §7)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_log (
  id          BIGSERIAL PRIMARY KEY,
  actor_id    UUID,
  actor_role  TEXT,
  action      TEXT NOT NULL,
  resource    TEXT,
  resource_id TEXT,
  ip          TEXT,
  meta        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);

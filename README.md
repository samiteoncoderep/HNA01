# Rapha HNaaS — Care Navigator Agent (MVP)

A runnable, deployable implementation of the **HNaaS Care Navigator Agent** from the Rapha Digital Health PRD. It is the patient-facing AI navigator for people with complex chronic conditions, starting with fibromyalgia (FM): condition-intelligent dialogue, structured onboarding, specialist routing, longitudinal context, and human escalation — backed by PostgreSQL and a simple JWT auth layer.

This is a **single deployable service** (Node/Express + TypeScript API serving a static web UI) so you can push it to GitHub and host it on Railway or any VM today. It runs **with no LLM API key** — the Care Navigator uses a deterministic, rule-based engine (the "logIQ"). The interface is structured so a real LLM (Anthropic Claude, per the PRD) can be dropped in later without changing callers.

---

## What's implemented (mapped to the PRD)

| PRD item | Status |
|---|---|
| Feature 1 — Condition-Intelligent Onboarding (one question/screen, save & resume) | ✅ |
| Feature 2 — Condition-Intelligent Dialogue (FM knowledge base, out-of-scope flagging, clarifying questions) | ✅ |
| Feature 2/5 — Crisis detection → immediate escalation + 988 resources | ✅ |
| Feature 3 — Specialist Agent Routing (full PRD routing matrix) | ✅ |
| Feature 4 — Longitudinal Patient Context (returning-patient greeting, persistent profile) | ✅ |
| Feature 5 — Human Escalation with structured context packet | ✅ |
| Zero-party data capture (structured `data_tags` per session) | ✅ |
| Basic employer reporting (aggregate, de-identified) | ✅ |
| Data models — Patient, NavigatorSession, RoutingEvent, EscalationPacket | ✅ |
| REST API — sessions, messages, escalate, profile, employer reports | ✅ |
| HIPAA-style audit logging | ✅ |
| Auth (simple JWT — email/password, MFA-ready surface) | ✅ |

**Deliberately deferred** (PRD "Out of Scope / Future Phases"): real LLM/RAG over pgvector, Auth0/MFA, React Native mobile, EHR integration, voice. The code is laid out so these slot in without a rewrite.

> ⚠️ **Not production-PHI-ready as-is.** PHI columns are documented for at-rest encryption but stored plaintext in this MVP. Do not load real patient data until encryption, a signed BAA, and a security review are in place. See `HIPAA_COMPLIANCE.md`.

---

## Tech stack

- **API:** Node.js + Express, TypeScript (strict)
- **Database:** PostgreSQL (`pg`)
- **Auth:** JWT (`jsonwebtoken`) + bcrypt password hashing
- **Frontend:** single static HTML/CSS/JS app (no build step), accessibility-first for cognitive-fatigue users
- **Tests:** Vitest
- **Deploy:** Dockerfile + `railway.json` + `Procfile`

---

## Quick start (local)

**Prerequisites:** Node 20+ and a PostgreSQL database.

```bash
# 1. Install
npm install            # builds automatically via postinstall

# 2. Configure
cp .env.example .env
#   set DATABASE_URL and JWT_SECRET in .env

# 3. Create tables + demo accounts
npm run migrate
npm run seed

# 4. Run
npm start              # production build
# or
npm run dev            # hot-reload dev server
```

Open **http://localhost:3000**.

**Demo logins** (from `npm run seed`):
- Patient: `demo@rapha.health` / `demo1234`
- Staff (escalation queue): `nurse@rapha.health` / `staff1234`

> If your Postgres needs SSL (most managed providers do), set `PGSSL=true`.

---

## Deploy to Railway

1. Push this repo to GitHub.
2. In Railway: **New Project → Deploy from GitHub repo**.
3. **Add a PostgreSQL plugin** — Railway injects `DATABASE_URL` automatically.
4. Add environment variables in the service settings:
   - `JWT_SECRET` — a long random string:
     `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
   - `NODE_ENV=production`
   - `HIPAA_AUDIT_LOG_ENABLED=true`
5. Deploy. The container runs migrations automatically on boot (`node dist/db/migrate.js && node dist/server.js`), and Railway health-checks `/health`.
6. (Optional, once) seed demo data from the Railway shell: `npm run seed`.

The included `Dockerfile` is the build path Railway uses (`railway.json` → `DOCKERFILE`). The `Procfile` covers Heroku-style platforms.

## Deploy to a plain VM

```bash
git clone <your-repo> && cd rapha-hnaas
npm install
# create .env with DATABASE_URL + JWT_SECRET
npm run migrate && npm run seed
npm start            # put behind nginx/caddy + a process manager (pm2/systemd)
```

---

## REST API

All patient/staff endpoints require `Authorization: Bearer <jwt>`.

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/register` | Create a patient account → returns JWT |
| POST | `/api/auth/login` | Log in → returns JWT |
| GET | `/api/auth/me` | Current patient profile |
| GET | `/api/onboarding` | Onboarding flow + resume point |
| POST | `/api/onboarding/answer` | Submit one answer (save & resume) |
| POST | `/api/sessions` | Start a Care Navigator session |
| GET | `/api/sessions/:id` | Session history + context |
| POST | `/api/sessions/:id/messages` | Send message → agent reply (routing/escalation applied) |
| POST | `/api/sessions/:id/escalate` | Human escalation + context packet |
| POST | `/api/sessions/route/preview` | Preview the routing decision for a message |
| GET | `/api/patients/:id/profile` | Patient profile (patient or staff) |
| PUT | `/api/patients/:id/profile` | Update profile / preferences |
| GET | `/api/staff/escalations` | Staff escalation queue (sorted by urgency) |
| GET | `/api/employer/:id/reports` | Aggregate, de-identified utilization report |
| GET | `/health` | Liveness probe |

---

## The Care Navigator engine ("logIQ")

`src/agent/navigator.ts` applies, in priority order:

1. **Crisis detection** → immediate human escalation, 988 resources surfaced, no routing delay.
2. **Out-of-scope clinical red flags** (e.g. chest pain) → urgent clinical escalation, not FM education.
3. **Explicit human request** → warm handoff with context packet.
4. **Specialist routing** (`src/agent/routing.ts`) → maps intent to the right specialist agent per the PRD matrix; multi-issue requests go to a human.
5. **FM knowledge retrieval** (`src/agent/knowledgeBase.ts`) → plain-language education, labelled as education vs. clinician input.
6. **Clarifying fallback** → asks rather than assumes.

Every turn also extracts **zero-party data tags** (pain level, symptoms, medication mentions) for the data layer.

### Swapping in a real LLM later
`runNavigator()` returns a typed `AgentResult`. To use Anthropic Claude, implement an async version that calls the API with the FM knowledge base as context and returns the same shape — callers in `src/routes/sessions.ts` don't change. Add `ANTHROPIC_API_KEY` to env and gate on its presence.

---

## Project structure

```
rapha-hnaas/
├── src/
│   ├── server.ts            # Express app + static hosting
│   ├── config.ts            # env config
│   ├── db/                  # pool, schema.sql, migrate, seed
│   ├── auth/                # JWT + password hashing
│   ├── middleware/          # auth guards + HIPAA audit logging
│   ├── agent/               # navigator (logIQ), routing, knowledge base, onboarding flow
│   └── routes/              # auth, onboarding, sessions, profile/staff/employer
├── public/index.html        # patient web app (chat + onboarding)
├── tests/                   # Vitest unit tests
├── Dockerfile, railway.json, Procfile
├── .env.example
├── HIPAA_COMPLIANCE.md, SECURITY.md
└── README.md
```

---

## Tests

```bash
npm test
```

Covers routing decisions, crisis/out-of-scope escalation, FM knowledge retrieval, zero-party data extraction, and the clarifying-question fallback.

---

## License

Proprietary — © 2026 Rapha Digital Health, Inc. Not open source.

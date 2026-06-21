# HIPAA Compliance Notes

This MVP is engineered toward HIPAA alignment but is **not certified or production-PHI-ready** out of the box. Treat the items below as a pre-production checklist.

## Status in this codebase
- **Audit logging:** every PHI-touching action writes to `audit_log` (actor, action, resource, IP, timestamp). Toggle via `HIPAA_AUDIT_LOG_ENABLED`.
- **Transport security:** terminate TLS at the platform/proxy (Railway provides HTTPS; on a VM use nginx/caddy). `PGSSL=true` enforces encrypted DB connections.
- **Access control:** JWT auth with role separation (`patient` / `staff` / `employer`). Employer reports are strictly aggregate and de-identified — no PHI.
- **Least exposure:** helmet security headers; employer endpoint returns counts only.

## Required BEFORE loading real PHI
1. **Encryption at rest.** PHI columns (`name`, `email`, `date_of_birth`, `insurance_info`) are documented in `schema.sql` but stored plaintext here. Implement column-level encryption (pgcrypto/KMS) or rely on an encrypted-at-rest managed DB plus app-layer field encryption.
2. **Signed BAAs.** Execute Business Associate Agreements with every processor of PHI: the database/cloud host, and the LLM provider if/when one is added.
3. **MFA.** Add multi-factor auth (the PRD specifies Auth0 HIPAA tier). The current JWT layer is MFA-ready but does not enforce it.
4. **Secrets management.** No secrets in source. Use the platform secret store; rotate `JWT_SECRET`.
5. **Audit log retention & integrity.** Ship `audit_log` to immutable/WORM storage; define retention (commonly 6 years).
6. **Backup, DR, and breach response.** Encrypted backups, tested restore, and an incident response runbook (see `SECURITY.md`).
7. **Minimum necessary & consent.** `consent_flags` are captured at onboarding; enforce them in any downstream data use.

## Clinical safety
Per the PRD, the agent **must not diagnose or prescribe**. The engine labels output as general education vs. clinician input, and escalates crisis and out-of-scope clinical red flags to humans immediately.

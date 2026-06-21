# Contributing

## Workflow
1. Branch from `main`.
2. Keep changes focused; write/adjust tests in `tests/`.
3. `npm run build` and `npm test` must pass before opening a PR.
4. PRs require review before merge.

## Code standards
- TypeScript strict mode; no `any` in new code without justification.
- Keep the agent engine (`src/agent`) pure and unit-tested.

## PHI handling rules (critical)
- Never log PHI to stdout/stderr or analytics. Use the `audit_log` table for access records (metadata only).
- Employer-facing endpoints return aggregate, de-identified data only.
- Any new PHI field must be added to the encryption plan in `HIPAA_COMPLIANCE.md`.

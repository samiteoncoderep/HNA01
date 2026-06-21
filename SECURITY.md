# Security Policy

## Reporting a vulnerability
Email **security@rapha.health** with details and reproduction steps. Do not open public issues for security reports. We aim to acknowledge within 2 business days.

## HIPAA incident reporting
Suspected exposure of Protected Health Information (PHI) must be reported immediately to the Privacy/Security Officer at **privacy@rapha.health**, and follow the breach-response runbook. Do not attempt to investigate by accessing additional PHI.

## Handling secrets
- Never commit `.env` or credentials. `.gitignore` excludes them.
- Rotate `JWT_SECRET` and database credentials on any suspected exposure.

## Dependencies
Run `npm audit` regularly and patch promptly. Pin and review new dependencies that touch auth, crypto, or PHI paths.

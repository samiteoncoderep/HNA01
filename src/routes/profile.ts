import { Router, Response } from 'express';
import { query } from '../db/pool';
import { AuthedRequest, requireAuth, requireRole, audit } from '../middleware/auth';

const router = Router();

// GET /api/patients/:id/profile — patient or staff
router.get('/patients/:id/profile', requireAuth, async (req: AuthedRequest, res: Response) => {
  if (req.user!.role === 'patient' && req.user!.sub !== req.params.id) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const { rows } = await query(
    `SELECT id, name, email, date_of_birth, diagnosis, insurance_info, care_goals,
            consent_flags, onboarding_done, created_at, updated_at
       FROM patients WHERE id = $1`,
    [req.params.id],
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
  await audit(req, 'patient.profile.read', 'patient', req.params.id);
  return res.json({ profile: rows[0] });
});

// PUT /api/patients/:id/profile — update profile/preferences
router.put('/patients/:id/profile', requireAuth, async (req: AuthedRequest, res: Response) => {
  if (req.user!.role === 'patient' && req.user!.sub !== req.params.id) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const allowed = ['name', 'diagnosis', 'insurance_info', 'care_goals', 'consent_flags'] as const;
  const updates: string[] = [];
  const values: any[] = [];
  let i = 1;
  for (const field of allowed) {
    if (field in (req.body || {})) {
      const val = req.body[field];
      if (field === 'insurance_info' || field === 'consent_flags') {
        updates.push(`${field} = $${i}::jsonb`);
        values.push(JSON.stringify(val));
      } else {
        updates.push(`${field} = $${i}`);
        values.push(val);
      }
      i++;
    }
  }
  if (updates.length === 0) return res.status(400).json({ error: 'No updatable fields provided' });
  values.push(req.params.id);
  await query(
    `UPDATE patients SET ${updates.join(', ')}, updated_at = now() WHERE id = $${i}`,
    values,
  );
  await audit(req, 'patient.profile.update', 'patient', req.params.id, { fields: Object.keys(req.body || {}) });
  return res.json({ ok: true });
});

// --- Staff: escalation queue (Feature 5) ---
// GET /api/staff/escalations
router.get('/staff/escalations', requireAuth, requireRole('staff'), async (req: AuthedRequest, res: Response) => {
  const { rows } = await query(
    `SELECT e.*, p.name AS patient_name
       FROM escalation_packets e JOIN patients p ON p.id = e.patient_id
      WHERE e.status <> 'resolved'
      ORDER BY CASE e.urgency WHEN 'crisis' THEN 0 WHEN 'urgent' THEN 1 ELSE 2 END, e.created_at ASC`,
  );
  await audit(req, 'staff.escalations.read', 'escalation_packet');
  return res.json({ escalations: rows });
});

// --- Employer: aggregate, de-identified utilization report (PRD §4.4 / Feature: basic employer reporting) ---
// GET /api/employer/:id/reports
router.get('/employer/:id/reports', requireAuth, requireRole('employer', 'staff'), async (req: AuthedRequest, res: Response) => {
  const totalPatients = await query('SELECT count(*)::int AS n FROM patients WHERE role = $1', ['patient']);
  const onboarded = await query(
    "SELECT count(*)::int AS n FROM patients WHERE onboarding_done = TRUE AND role = 'patient'",
  );
  const sessions = await query('SELECT count(*)::int AS n FROM navigator_sessions');
  const escalations = await query('SELECT count(*)::int AS n FROM escalation_packets');
  const routing = await query(
    `SELECT routed_to, count(*)::int AS n FROM routing_events GROUP BY routed_to ORDER BY n DESC`,
  );
  await audit(req, 'employer.report.read', 'employer', req.params.id);
  // Strictly aggregate / de-identified — no PHI.
  return res.json({
    employerId: req.params.id,
    generatedAt: new Date().toISOString(),
    metrics: {
      enrolledPatients: totalPatients.rows[0].n,
      onboardingCompletion:
        totalPatients.rows[0].n > 0 ? Math.round((onboarded.rows[0].n / totalPatients.rows[0].n) * 100) : 0,
      totalNavigatorSessions: sessions.rows[0].n,
      totalEscalations: escalations.rows[0].n,
      routingBreakdown: routing.rows,
    },
  });
});

export default router;

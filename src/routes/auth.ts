import { Router, Request, Response } from 'express';
import { query } from '../db/pool';
import { hashPassword, verifyPassword, signToken } from '../auth/jwt';
import { audit, AuthedRequest, requireAuth } from '../middleware/auth';

const router = Router();

interface PatientRow {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  role: string;
  onboarding_done: boolean;
  onboarding_step: number;
}

router.post('/register', async (req: Request, res: Response) => {
  const { name, email, password } = req.body || {};
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'name, email, and password are required' });
  }
  if (String(password).length < 8) {
    return res.status(400).json({ error: 'password must be at least 8 characters' });
  }
  const existing = await query('SELECT id FROM patients WHERE email = $1', [String(email).toLowerCase()]);
  if (existing.rowCount > 0) {
    return res.status(409).json({ error: 'An account with that email already exists' });
  }
  const hash = await hashPassword(password);
  const { rows } = await query<PatientRow>(
    `INSERT INTO patients (name, email, password_hash)
     VALUES ($1,$2,$3)
     RETURNING id, name, email, role, onboarding_done, onboarding_step`,
    [name, String(email).toLowerCase(), hash],
  );
  const p = rows[0];
  const token = signToken({ sub: p.id, role: p.role, email: p.email });
  await audit(req as AuthedRequest, 'auth.register', 'patient', p.id);
  return res.status(201).json({
    token,
    patient: { id: p.id, name: p.name, email: p.email, role: p.role, onboardingDone: p.onboarding_done, onboardingStep: p.onboarding_step },
  });
});

router.post('/login', async (req: Request, res: Response) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'email and password are required' });
  const { rows } = await query<PatientRow>(
    'SELECT id, name, email, password_hash, role, onboarding_done, onboarding_step FROM patients WHERE email = $1',
    [String(email).toLowerCase()],
  );
  if (rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });
  const p = rows[0];
  const ok = await verifyPassword(password, p.password_hash);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
  const token = signToken({ sub: p.id, role: p.role, email: p.email });
  await audit(req as AuthedRequest, 'auth.login', 'patient', p.id);
  return res.json({
    token,
    patient: { id: p.id, name: p.name, email: p.email, role: p.role, onboardingDone: p.onboarding_done, onboardingStep: p.onboarding_step },
  });
});

router.get('/me', requireAuth, async (req: AuthedRequest, res: Response) => {
  const { rows } = await query(
    `SELECT id, name, email, role, diagnosis, care_goals, consent_flags,
            onboarding_done, onboarding_step, created_at
     FROM patients WHERE id = $1`,
    [req.user!.sub],
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
  return res.json({ patient: rows[0] });
});

export default router;

import { Router, Response } from 'express';
import { query } from '../db/pool';
import { AuthedRequest, requireAuth, audit } from '../middleware/auth';
import { ONBOARDING_FLOW, ONBOARDING_TOTAL } from '../agent/onboarding';

const router = Router();

// Return the full flow + the patient's current resume point.
router.get('/', requireAuth, async (req: AuthedRequest, res: Response) => {
  const { rows } = await query(
    'SELECT onboarding_step, onboarding_done FROM patients WHERE id = $1',
    [req.user!.sub],
  );
  const step = rows[0]?.onboarding_step ?? 0;
  return res.json({
    total: ONBOARDING_TOTAL,
    currentStep: step,
    done: rows[0]?.onboarding_done ?? false,
    questions: ONBOARDING_FLOW,
  });
});

/**
 * Submit a single answer. Maps answer -> patient field (supporting dotted JSONB
 * paths like `insurance_info.payer`), advances onboarding_step (save-and-resume).
 */
router.post('/answer', requireAuth, async (req: AuthedRequest, res: Response) => {
  const { questionId, value } = req.body || {};
  const q = ONBOARDING_FLOW.find((x) => x.id === questionId);
  if (!q) return res.status(400).json({ error: 'Unknown questionId' });

  const [column, jsonKey] = q.field.split('.');

  if (jsonKey) {
    // merge into a JSONB column
    await query(
      `UPDATE patients
         SET ${column} = COALESCE(${column}, '{}'::jsonb) || jsonb_build_object($1, $2::jsonb),
             onboarding_step = GREATEST(onboarding_step, $3),
             updated_at = now()
       WHERE id = $4`,
      [jsonKey, JSON.stringify(value), q.step, req.user!.sub],
    );
  } else if (column === 'diagnosis') {
    const arr = Array.isArray(value) ? value : [value];
    await query(
      `UPDATE patients SET diagnosis = $1, onboarding_step = GREATEST(onboarding_step, $2), updated_at = now() WHERE id = $3`,
      [arr, q.step, req.user!.sub],
    );
  } else {
    await query(
      `UPDATE patients SET ${column} = $1, onboarding_step = GREATEST(onboarding_step, $2), updated_at = now() WHERE id = $3`,
      [value, q.step, req.user!.sub],
    );
  }

  const done = q.step >= ONBOARDING_TOTAL;
  if (done) {
    await query('UPDATE patients SET onboarding_done = TRUE, updated_at = now() WHERE id = $1', [req.user!.sub]);
  }
  await audit(req, 'onboarding.answer', 'patient', req.user!.sub, { questionId, step: q.step });
  return res.json({ ok: true, step: q.step, done });
});

export default router;

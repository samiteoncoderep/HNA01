import { Router, Response } from 'express';
import { query, withTransaction } from '../db/pool';
import { AuthedRequest, requireAuth, audit } from '../middleware/auth';
import { runNavigator, PatientContext } from '../agent/navigator';

const router = Router();

interface Message {
  role: 'patient' | 'agent';
  content: string;
  ts: string;
  agentId?: string;
}

async function loadPatientContext(patientId: string): Promise<PatientContext | null> {
  const { rows } = await query(
    `SELECT p.id, p.name, p.diagnosis, p.care_goals,
            (SELECT max(created_at) FROM navigator_sessions s WHERE s.patient_id = p.id) AS last_interaction
     FROM patients p WHERE p.id = $1`,
    [patientId],
  );
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    id: r.id,
    name: r.name,
    diagnosis: r.diagnosis || [],
    careGoals: r.care_goals,
    lastInteractionAt: r.last_interaction,
  };
}

// POST /api/sessions — initiate a new Care Navigator conversation
router.post('/', requireAuth, async (req: AuthedRequest, res: Response) => {
  const ctx = await loadPatientContext(req.user!.sub);
  if (!ctx) return res.status(404).json({ error: 'Patient not found' });

  // Longitudinal greeting (Feature 4)
  const first = ctx.name?.split(' ')[0] || 'there';
  const greeting = ctx.lastInteractionAt
    ? `Welcome back, ${first}. I'm here whenever you're ready — what's on your mind today?`
    : `Hi ${first}, I'm your Care Navigator. I'm here to help you navigate life with fibromyalgia. What can I help you with today?`;

  const opening: Message = { role: 'agent', content: greeting, ts: new Date().toISOString(), agentId: 'care-navigator' };

  const { rows } = await query(
    `INSERT INTO navigator_sessions (patient_id, messages) VALUES ($1, $2::jsonb) RETURNING id, created_at`,
    [req.user!.sub, JSON.stringify([opening])],
  );
  await audit(req, 'session.create', 'navigator_session', rows[0].id);
  return res.status(201).json({ id: rows[0].id, createdAt: rows[0].created_at, messages: [opening] });
});

// GET /api/sessions/:id — retrieve session history + context
router.get('/:id', requireAuth, async (req: AuthedRequest, res: Response) => {
  const { rows } = await query(
    `SELECT s.*, p.name AS patient_name FROM navigator_sessions s
       JOIN patients p ON p.id = s.patient_id
      WHERE s.id = $1`,
    [req.params.id],
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Session not found' });
  const s = rows[0];
  if (s.patient_id !== req.user!.sub && req.user!.role === 'patient') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  await audit(req, 'session.read', 'navigator_session', s.id);
  return res.json(s);
});

// POST /api/sessions/:id/messages — send a patient message, receive agent reply
router.post('/:id/messages', requireAuth, async (req: AuthedRequest, res: Response) => {
  const { content } = req.body || {};
  if (!content || typeof content !== 'string') {
    return res.status(400).json({ error: 'content (string) is required' });
  }

  const result = await withTransaction(async (q) => {
    const sessionRes = await q(
      'SELECT * FROM navigator_sessions WHERE id = $1 FOR UPDATE',
      [req.params.id],
    );
    if (sessionRes.rows.length === 0) return { notFound: true } as const;
    const session = sessionRes.rows[0];
    if (session.patient_id !== req.user!.sub && req.user!.role === 'patient') {
      return { forbidden: true } as const;
    }

    const ctx = await loadPatientContext(session.patient_id);
    if (!ctx) return { notFound: true } as const;

    // Run the navigator (the logIQ)
    const agentOut = runNavigator(content, ctx);

    const now = new Date().toISOString();
    const patientMsg: Message = { role: 'patient', content, ts: now };
    const agentMsg: Message = { role: 'agent', content: agentOut.reply, ts: now, agentId: agentOut.agentId };
    const messages: Message[] = [...(session.messages || []), patientMsg, agentMsg];

    // merge zero-party data tags
    const mergedTags = { ...(session.data_tags || {}), ...agentOut.dataTags };

    let escalationStatus = session.escalation_status;
    if (agentOut.escalate) escalationStatus = 'pending';

    await q(
      `UPDATE navigator_sessions
          SET messages = $1::jsonb, data_tags = $2::jsonb, escalation_status = $3
        WHERE id = $4`,
      [JSON.stringify(messages), JSON.stringify(mergedTags), escalationStatus, session.id],
    );

    // record routing event when a specialist (or human) was chosen
    if (agentOut.route.routedTo) {
      await q(
        `INSERT INTO routing_events (session_id, patient_id, need_type, routed_to, reason, outcome)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [session.id, session.patient_id, agentOut.route.needType, agentOut.route.routedTo, agentOut.route.reason, 'engaged'],
      );
    }

    // auto-generate an escalation packet (Feature 5)
    let escalationPacketId: string | null = null;
    if (agentOut.escalate) {
      const profileSummary =
        `Patient: ${ctx.name}. Diagnosis: ${(ctx.diagnosis || []).join(', ') || 'unspecified'}. ` +
        `Goals: ${ctx.careGoals || 'not yet captured'}.`;
      const packetRes = await q(
        `INSERT INTO escalation_packets
           (session_id, patient_id, profile_summary, transcript, identified_need, urgency, recommended_action)
         VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7) RETURNING id`,
        [
          session.id,
          session.patient_id,
          profileSummary,
          JSON.stringify(messages),
          agentOut.identifiedNeed,
          agentOut.urgency,
          agentOut.recommendedAction,
        ],
      );
      escalationPacketId = packetRes.rows[0].id;
    }

    return { agentMsg, route: agentOut.route, escalate: agentOut.escalate, urgency: agentOut.urgency, escalationPacketId };
  });

  if ('notFound' in result && result.notFound) return res.status(404).json({ error: 'Session not found' });
  if ('forbidden' in result && result.forbidden) return res.status(403).json({ error: 'Forbidden' });

  await audit(req, 'session.message', 'navigator_session', req.params.id, {
    escalated: (result as any).escalate,
    routedTo: (result as any).route?.routedTo,
  });

  return res.json(result);
});

// POST /api/sessions/:id/escalate — explicit human escalation with packet
router.post('/:id/escalate', requireAuth, async (req: AuthedRequest, res: Response) => {
  const { reason } = req.body || {};
  const sessionRes = await query('SELECT * FROM navigator_sessions WHERE id = $1', [req.params.id]);
  if (sessionRes.rows.length === 0) return res.status(404).json({ error: 'Session not found' });
  const session = sessionRes.rows[0];
  if (session.patient_id !== req.user!.sub && req.user!.role === 'patient') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const ctx = await loadPatientContext(session.patient_id);

  const profileSummary =
    `Patient: ${ctx?.name}. Diagnosis: ${(ctx?.diagnosis || []).join(', ') || 'unspecified'}. ` +
    `Goals: ${ctx?.careGoals || 'not yet captured'}.`;

  const { rows } = await query(
    `INSERT INTO escalation_packets
       (session_id, patient_id, profile_summary, transcript, identified_need, urgency, recommended_action)
     VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7) RETURNING id, created_at`,
    [
      session.id,
      session.patient_id,
      profileSummary,
      JSON.stringify(session.messages || []),
      reason || 'Patient-initiated escalation',
      'normal',
      'Warm handoff to HNaaS specialist with full context packet.',
    ],
  );
  await query(`UPDATE navigator_sessions SET escalation_status = 'pending' WHERE id = $1`, [session.id]);
  await audit(req, 'session.escalate', 'escalation_packet', rows[0].id);
  return res.status(201).json({ escalationPacketId: rows[0].id, createdAt: rows[0].created_at, profileSummary });
});

// POST /api/agents/route — expose routing decision (PRD internal endpoint)
router.post('/route/preview', requireAuth, async (req: AuthedRequest, res: Response) => {
  const { message } = req.body || {};
  if (!message) return res.status(400).json({ error: 'message is required' });
  const ctx = await loadPatientContext(req.user!.sub);
  const out = runNavigator(message, ctx!);
  return res.json({ route: out.route, escalate: out.escalate, urgency: out.urgency, identifiedNeed: out.identifiedNeed });
});

export default router;

import { Request, Response, NextFunction } from 'express';
import { verifyToken, JwtPayload } from '../auth/jwt';
import { query } from '../db/pool';
import { config } from '../config';

export interface AuthedRequest extends Request {
  user?: JwtPayload;
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }
  try {
    req.user = verifyToken(header.slice(7));
    return next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function requireRole(...roles: string[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    return next();
  };
}

/**
 * HIPAA-style audit logging (PRD §4.3 / §7). Fire-and-forget; never blocks the
 * request, but failures are logged to stderr.
 */
export async function audit(
  req: AuthedRequest,
  action: string,
  resource?: string,
  resourceId?: string,
  meta: Record<string, unknown> = {},
): Promise<void> {
  if (!config.hipaaAuditLog) return;
  try {
    await query(
      `INSERT INTO audit_log (actor_id, actor_role, action, resource, resource_id, ip, meta)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        req.user?.sub ?? null,
        req.user?.role ?? null,
        action,
        resource ?? null,
        resourceId ?? null,
        req.ip ?? null,
        JSON.stringify(meta),
      ],
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[audit] failed to write audit log:', err);
  }
}

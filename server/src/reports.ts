// Reporting objectionable players or groups (App Store guideline 1.2). Reports are reviewed with
// `npm run moderate`, which can reset a name, remove a group or suspend an account.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { requireUser } from './auth.ts';
import { query } from './db.ts';

export const REASONS = ['harassment', 'hate', 'spam', 'impersonation', 'inappropriate', 'other'] as const;

const reportBody = z.object({
  targetType: z.enum(['user', 'group']),
  targetId: z.string().min(1).max(128),
  reason: z.enum(REASONS),
  details: z.string().trim().max(500).optional(),
});

export async function reportRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireUser);

  app.post('/reports', async (req, reply) => {
    const body = reportBody.parse(req.body);
    if (body.targetType === 'user' && body.targetId === req.uid) return reply.code(400).send({ error: "You can't report yourself." });
    // Same answer whether or not the target exists, so reporting can't be used to probe for accounts.
    // One open report per person and target.
    await query(
      `INSERT INTO reports (reporter_id, target_type, target_id, reason, details)
       SELECT $1, $2, $3, $4, $5
       WHERE CASE WHEN $2 = 'user' THEN EXISTS (SELECT 1 FROM users WHERE id = $3)
                  ELSE EXISTS (SELECT 1 FROM groups WHERE id::text = $3) END
       ON CONFLICT (reporter_id, target_type, target_id) WHERE status = 'open' DO NOTHING`,
      [req.uid, body.targetType, body.targetId, body.reason, body.details || null],
    );
    return { ok: true };
  });
}

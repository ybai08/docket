import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { query } from './db.ts';

// Verifying ID tokens only needs the project ID: firebase-admin checks them against Google's public keys.
initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID });

declare module 'fastify' {
  interface FastifyRequest {
    uid: string;
  }
}

export async function requireUser(req: FastifyRequest, reply: FastifyReply) {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return reply.code(401).send({ error: 'Sign in first.' });
  try {
    const decoded = await getAuth().verifyIdToken(token);
    req.uid = decoded.uid;
    // First request from a new account creates its row.
    await query(
      `INSERT INTO users (id, display_name) VALUES ($1, $2)
       ON CONFLICT (id) DO UPDATE SET display_name = COALESCE(users.display_name, EXCLUDED.display_name)`,
      [decoded.uid, (decoded.name as string | undefined) ?? null],
    );
  } catch {
    return reply.code(401).send({ error: 'Your session expired. Sign in again.' });
  }
}

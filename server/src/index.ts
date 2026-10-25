import { createReadStream, existsSync } from 'node:fs';
import { join } from 'node:path';

import cors from '@fastify/cors';
import Fastify from 'fastify';
import { ZodError } from 'zod';

import { gameRoutes } from './games.ts';
import { groupRoutes } from './groups.ts';
import { lawmakerRoutes } from './lawmakers.ts';
import { meRoutes } from './me.ts';
import { socialRoutes } from './social.ts';

const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' } });

// The web demo (EAS Hosting) also sends PATCH, PUT and DELETE; the plugin allows only GET, HEAD and POST by default.
await app.register(cors, { origin: true, methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'] });

app.setErrorHandler((err, _req, reply) => {
  if (err instanceof ZodError) return reply.code(400).send({ error: err.issues[0]?.message ?? 'Invalid request.' });
  // Fastify's own client errors (bad JSON, body too large, wrong content type) keep their 4xx.
  const status = (err as { statusCode?: number }).statusCode;
  if (status && status >= 400 && status < 500) return reply.code(status).send({ error: (err as Error).message });
  // Postgres refusing malformed input (not a uuid, a NUL byte, a number out of range) is the client's mistake.
  const pgCode = (err as { code?: string }).code;
  if (pgCode && ['22P02', '22021', '22003', '22007', '22008', '22001'].includes(pgCode)) {
    return reply.code(400).send({ error: 'Invalid request.' });
  }
  app.log.error(err);
  return reply.code(500).send({ error: 'Something went wrong on our end.' });
});

app.get('/health', async () => ({ ok: true }));

// Lawmaker photos, stored with the API by scripts/build_civic_data.py. File names are IDs, so they never change.
const photos = join(import.meta.dirname, '..', 'media', 'photos');
app.get<{ Params: { file: string } }>('/photos/:file', async (req, reply) => {
  const file = req.params.file;
  if (!/^[A-Za-z0-9_.-]+\.jpg$/.test(file) || !existsSync(join(photos, file))) return reply.code(404).send({ error: 'No such photo.' });
  return reply.type('image/jpeg').header('Cache-Control', 'public, max-age=604800').send(createReadStream(join(photos, file)));
});
await app.register(gameRoutes);
await app.register(meRoutes);
await app.register(socialRoutes);
await app.register(groupRoutes);
await app.register(lawmakerRoutes);

await app.listen({ port: Number(process.env.PORT ?? 8787), host: '0.0.0.0' });

import cors from '@fastify/cors';
import Fastify from 'fastify';
import { ZodError } from 'zod';

import { gameRoutes } from './games.ts';
import { groupRoutes } from './groups.ts';
import { lawmakerRoutes } from './lawmakers.ts';
import { meRoutes } from './me.ts';
import { socialRoutes } from './social.ts';

const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' } });

await app.register(cors, { origin: true });

app.setErrorHandler((err, _req, reply) => {
  if (err instanceof ZodError) return reply.code(400).send({ error: err.issues[0]?.message ?? 'Invalid request.' });
  app.log.error(err);
  return reply.code(500).send({ error: 'Something went wrong on our end.' });
});

app.get('/health', async () => ({ ok: true }));
await app.register(gameRoutes);
await app.register(meRoutes);
await app.register(socialRoutes);
await app.register(groupRoutes);
await app.register(lawmakerRoutes);

await app.listen({ port: Number(process.env.PORT ?? 8787), host: '0.0.0.0' });

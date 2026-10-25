#!/usr/bin/env bash
# Starts an isolated Docket API for QA: its own Docker Postgres (docket-qa-pg on :55432), migrated and seeded,
# and the API on :8799 with firebase-admin/auth stubbed so `Bearer <uid>` signs in as <uid>.
# Never reads server/.env, so the production DATABASE_URL is never used. Stop with: docker rm -f docket-qa-pg
set -euo pipefail
cd "$(dirname "$0")/.."
# Generated env and loader files live here; 07-mover.mjs reads them to start its own clock-shifted server.
TMP="${QA_TMP:-${TMPDIR:-/tmp}/docket-qa}"
mkdir -p "$TMP"
printf 'DATABASE_URL=postgres://postgres:qa@localhost:55432/docket_qa\nFIREBASE_PROJECT_ID=docket-qa-local\nPORT=%s\nLOG_LEVEL=warn\n' "${PORT:-8799}" > "$TMP/qa.env"
echo "export const getAuth = () => ({ verifyIdToken: async (t) => ({ uid: t }) });" > "$TMP/stub-auth.mjs"
cat > "$TMP/register.mjs" <<JS
import { register } from 'node:module';
register('data:text/javascript,' + encodeURIComponent(\`
export async function resolve(s, c, next) {
  if (s === 'firebase-admin/auth') return { url: 'file://$TMP/stub-auth.mjs', shortCircuit: true };
  return next(s, c);
}\`));
JS
if ! docker ps --format '{{.Names}}' | grep -qx docket-qa-pg; then
  docker run -d --name docket-qa-pg -e POSTGRES_PASSWORD=qa -e POSTGRES_DB=docket_qa -p 55432:5432 postgres:16 >/dev/null
  until docker exec docket-qa-pg pg_isready -U postgres >/dev/null 2>&1; do sleep 1; done
  sleep 2
  env -u DATABASE_URL node --env-file="$TMP/qa.env" --import tsx src/migrate.ts
  env -u DATABASE_URL node --env-file="$TMP/qa.env" --import tsx src/seed.ts
fi
exec env -u DATABASE_URL node --env-file="$TMP/qa.env" --import tsx --import "$TMP/register.mjs" src/index.ts

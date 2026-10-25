// Tiny client for the QA repro scripts. Talks only to a local API started by start-local.sh, where
// auth is stubbed so `Authorization: Bearer <uid>` signs in as <uid>. Refuses any non-local base URL.
import { execFileSync } from 'node:child_process';

export const BASE = process.env.QA_BASE ?? 'http://localhost:8799';
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) throw new Error(`QA scripts only run against a local API, not ${BASE}`);

/** A unique uid prefix per run, so reruns don't collide with earlier accounts. */
export const RUN = process.env.QA_RUN ?? Date.now().toString(36);

export async function api(uid, method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { authorization: `Bearer ${uid}`, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, body: json };
}

/** Make a player with a ZIP (or none) and a username. */
export async function player(uid, { zip, username, displayName, shareVotes } = {}) {
  await api(uid, 'GET', '/me');
  if (zip) await api(uid, 'POST', '/me/location', { zip });
  const patch = {};
  if (username) patch.username = username;
  if (displayName) patch.displayName = displayName;
  if (shareVotes !== undefined) patch.shareVotes = shareVotes;
  if (Object.keys(patch).length) await api(uid, 'PATCH', '/me', patch);
  return uid;
}

/** Run SQL against the local QA database only (Docker container docket-qa-pg). */
export function sql(text) {
  return execFileSync('docker', ['exec', '-i', 'docket-qa-pg', 'psql', '-U', 'postgres', '-d', 'docket_qa', '-tAX', '-c', text], { encoding: 'utf8' }).trim();
}

export function check(label, ok, extra = '') {
  console.log(`${ok ? 'BUG ' : 'ok  '} ${label}${extra ? ` — ${extra}` : ''}`);
  return ok;
}

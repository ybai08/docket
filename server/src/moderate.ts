// Review reports and act on them. Run against production from server/:
//   npm run moderate                      open reports, oldest first, with who and what was reported
//   npm run moderate -- dismiss <report>  close a report with no action
//   npm run moderate -- reset-name <uid>  clear a player's display name and username
//   npm run moderate -- remove-group <id> delete a group
//   npm run moderate -- suspend <uid>     block the account from the API (it can still delete itself)
//   npm run moderate -- unsuspend <uid>
// Every action closes the open reports about that target. The Terms (docketapp.tech/terms) promise a
// response within 24 hours.
import { pool, query } from './db.ts';

const [cmd = 'list', arg] = process.argv.slice(2);

async function close(targetType: 'user' | 'group', targetId: string, action: string) {
  const rows = await query(
    `UPDATE reports SET status = 'resolved', action = $3, resolved_at = now()
     WHERE target_type = $1 AND target_id = $2 AND status = 'open' RETURNING id`,
    [targetType, targetId, action],
  );
  console.log(`${action}: ${targetType} ${targetId}; closed ${rows.length} report(s)`);
}

try {
  if (cmd === 'list') {
    const rows = await query<{
      id: string; target_type: string; target_id: string; reason: string; details: string | null; created_at: string;
      reporter: string | null; name: string | null; username: string | null; group_name: string | null;
    }>(
      `SELECT r.id, r.target_type, r.target_id, r.reason, r.details, r.created_at, r.reporter_id AS reporter,
              u.display_name AS name, u.username, g.name AS group_name
       FROM reports r
       LEFT JOIN users u ON r.target_type = 'user' AND u.id = r.target_id
       LEFT JOIN groups g ON r.target_type = 'group' AND g.id::text = r.target_id
       WHERE r.status = 'open' ORDER BY r.created_at`,
    );
    if (!rows.length) console.log('No open reports.');
    for (const r of rows) {
      const who = r.target_type === 'user' ? `${r.name ?? '(no name)'} @${r.username ?? '-'}` : `group "${r.group_name ?? '(gone)'}"`;
      console.log(`#${r.id}  ${r.created_at}  ${r.reason.padEnd(13)} ${r.target_type} ${r.target_id}  ${who}${r.details ? `\n      "${r.details}"` : ''}`);
    }
  } else if (!arg) {
    throw new Error(`Usage: npm run moderate -- ${cmd} <id>`);
  } else if (cmd === 'dismiss') {
    const rows = await query(`UPDATE reports SET status = 'resolved', action = 'none', resolved_at = now() WHERE id = $1 AND status = 'open' RETURNING id`, [arg]);
    console.log(rows.length ? `dismissed #${arg}` : `no open report #${arg}`);
  } else if (cmd === 'reset-name') {
    await query('UPDATE users SET display_name = NULL, username = NULL WHERE id = $1', [arg]);
    await close('user', arg, 'reset-name');
  } else if (cmd === 'remove-group') {
    await query('DELETE FROM groups WHERE id::text = $1', [arg]);
    await close('group', arg, 'removed-group');
  } else if (cmd === 'suspend') {
    await query('UPDATE users SET suspended_at = now() WHERE id = $1', [arg]);
    await close('user', arg, 'suspended');
  } else if (cmd === 'unsuspend') {
    await query('UPDATE users SET suspended_at = NULL WHERE id = $1', [arg]);
    console.log(`unsuspended ${arg}`);
  } else {
    throw new Error(`Unknown command "${cmd}". Use list, dismiss, reset-name, remove-group, suspend or unsuspend.`);
  }
} finally {
  await pool.end();
}

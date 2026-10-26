import { showAlert, showOptions, showPrompt } from '@/components/dialog';
import { api } from '@/lib/api';

export type ReportReason = 'harassment' | 'hate' | 'spam' | 'impersonation' | 'inappropriate' | 'other';

const REASONS: { reason: ReportReason; label: string }[] = [
  { reason: 'harassment', label: 'Harassment or bullying' },
  { reason: 'hate', label: 'Hate speech' },
  { reason: 'spam', label: 'Spam' },
  { reason: 'impersonation', label: 'Pretending to be someone else' },
  { reason: 'inappropriate', label: 'Inappropriate name or content' },
  { reason: 'other', label: 'Something else' },
];

export async function blockUser(userId: string) {
  await api('/blocks', { method: 'POST', body: { userId } });
}

/**
 * Report a person or a group: pick a reason, add details for "Something else", then send.
 * After reporting a person, offers to block them too. onBlocked runs once they are blocked.
 */
export function report(target: { type: 'user' | 'group'; id: string; name: string }, onBlocked?: () => void) {
  showOptions({
    title: `Report ${target.name}`,
    message: target.type === 'user' ? 'Why are you reporting them?' : 'Why are you reporting this group?',
    options: REASONS.map((r) => ({
      text: r.label,
      onPress: () =>
        r.reason === 'other'
          ? showPrompt('What happened?', 'Tell us a little more (up to 500 characters).', (details) => send(r.reason, details))
          : send(r.reason),
    })),
  });

  async function send(reason: ReportReason, details?: string) {
    const trimmed = details?.trim().slice(0, 500);
    try {
      await api('/reports', {
        method: 'POST',
        body: { targetType: target.type, targetId: target.id, reason, ...(trimmed ? { details: trimmed } : {}) },
      });
    } catch (err) {
      return showAlert("Couldn't send your report", (err as Error).message);
    }
    if (target.type === 'group') return showAlert('Thanks for reporting', "We'll review this within 24 hours.");
    showAlert('Thanks for reporting', "We'll review this within 24 hours.", [
      { text: 'Done', style: 'cancel' },
      {
        text: `Also block ${target.name}`,
        style: 'destructive',
        onPress: async () => {
          try {
            await blockUser(target.id);
            onBlocked?.();
          } catch (err) {
            showAlert("Couldn't block", (err as Error).message);
          }
        },
      },
    ]);
  }
}

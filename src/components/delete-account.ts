import { showAlert } from '@/components/dialog';
import { api } from '@/lib/api';
import { authErrorMessage, isCancelled, useAuth } from '@/lib/auth-context';

/**
 * Confirms, then deletes the account: Docket's data (DELETE /me), the sign-in account and, for Apple,
 * the Sign in with Apple grant. The person confirms with Apple or Google first. onError gets a message.
 */
export function useDeleteAccount(onError: (message: string) => void) {
  const { deleteAccount } = useAuth();
  return () =>
    showAlert(
      'Delete your account?',
      "This deletes your votes, results, friends, groups and your sign-in. It can't be undone. You'll confirm it's you first.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete everything',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteAccount(async () => {
                await api('/me', { method: 'DELETE' });
              });
            } catch (err) {
              if (!isCancelled(err)) onError(authErrorMessage(err));
            }
          },
        },
      ],
    );
}

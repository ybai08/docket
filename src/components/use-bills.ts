import { useEffect, useState } from 'react';

import { BILLS } from '@/data/bills';
import type { Bill } from '@/data/types';
import { api } from '@/lib/api';
import { useToday } from '@/lib/use-today';

// Bills outside src/data/bills.ts (other states' bills) come from GET /bills/:id, once per app run.
// null means the server has no such bill.
const cache = new Map<string, Bill | null>();
const pending = new Map<string, Promise<void>>();
// Ids whose last fetch failed for another reason (offline); retried on the next mount.
const failed = new Set<string>();

function fetchBill(id: string) {
  if (!pending.has(id)) {
    pending.set(
      id,
      api<Bill>(`/bills/${encodeURIComponent(id)}`)
        .then((b) => {
          cache.set(id, b);
          failed.delete(id);
        })
        .catch((err: { status?: number }) => {
          // A missing bill stays missing; anything else (offline) can be retried next time.
          if (err.status === 404) cache.set(id, null);
          else failed.add(id);
          pending.delete(id);
        }),
    );
  }
  return pending.get(id)!;
}

/** Looks bills up by id: the app's own list and today's set first, then the server. */
export function useBills(ids: string[]) {
  const { set } = useToday();
  const [, setVersion] = useState(0);
  const key = ids.join('|');

  useEffect(() => {
    const missing = key.split('|').filter((id) => id && !BILLS[id] && !cache.has(id));
    if (!missing.length) return;
    let live = true;
    Promise.all(missing.map(fetchBill)).then(() => {
      if (live) setVersion((v) => v + 1);
    });
    return () => {
      live = false;
    };
  }, [key]);

  return {
    get: (id: string): Bill | undefined => BILLS[id] ?? set.rollCall.find((b) => b.id === id) ?? cache.get(id) ?? undefined,
    /** True once the server has said it has no such bill. */
    missing: (id: string) => !BILLS[id] && !set.rollCall.some((b) => b.id === id) && cache.get(id) === null,
    /** True when the last try failed for a reason other than "no such bill". */
    failed: (id: string) => failed.has(id) && !cache.has(id),
  };
}

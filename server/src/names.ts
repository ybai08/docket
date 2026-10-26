// Filter for names other players see: display names, usernames and group names (App Store guideline
// 1.2). It catches slurs and strong profanity, including l33t spellings and words run together. Anything
// it misses can be reported and handled with `npm run moderate`.

// Matched anywhere in the name, even inside other words or with the words run together: these don't
// occur by accident in real names.
const ANYWHERE = [
  'nigger', 'nigga', 'faggot', 'fuck', 'cunt', 'motherf', 'bitch', 'whore', 'hitler', 'heilhitler', 'siegheil', 'kkk',
  'raghead', 'towelhead', 'wetback', 'pussy', 'vagina', 'jizz', 'shit',
];
// Matched only as a whole word (or its plural), since they're also names or parts of ordinary words:
// Cumming, Nazir, therapist, torpedo, Slutsky, retardant. "Dick" is left out: it's a first name
// (Dick Durbin), and reports cover misuse.
const WHOLE_WORD = [
  'ass', 'asshole', 'fag', 'fags', 'cock', 'cum', 'coon', 'spic', 'kike', 'gook', 'chink', 'dyke', 'tranny',
  'retard', 'retarded', 'beaner', 'slut', 'rapist', 'rape', 'pedo', 'pedophile', 'nazi', 'porn', 'penis', 'tit', 'tits',
  'twat', 'wank', 'nude', 'nudes', 'anal', 'sex',
];
// Words that contain an ANYWHERE entry but are fine.
const ALLOWED = ['scunthorpe', 'shiitake', 'shitake', 'pussywillow'];

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '!': 'i', '3': 'e', '4': 'a', '@': 'a', '5': 's', '$': 's', '7': 't', '+': 't', '8': 'b' };

function letters(s: string) {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[0-9!@$+]/g, (c) => LEET[c] ?? c);
}

/** True when a name shouldn't be shown to other players. */
export function isObjectionable(name: string) {
  const words = letters(name).split(/[^a-z]+/).filter(Boolean);
  if (words.some((w) => WHOLE_WORD.includes(w) || (w.endsWith('s') && WHOLE_WORD.includes(w.slice(0, -1))))) return true;
  // Run the words together too, so "f u c k" and "f.u.c.k" are caught.
  let joined = words.join('');
  for (const ok of ALLOWED) joined = joined.split(ok).join('');
  return ANYWHERE.some((bad) => joined.includes(bad));
}

const WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];

/** "Eight", "Four": bill counts in copy, which vary by state. */
export function countWord(n: number) {
  return WORDS[n] ?? String(n);
}

// What each state calls its legislative chambers, where it isn't "House" and "Senate".
// Mirrors server/src/lawmakers.ts so labels match the lawmaker roles the API sends.
const LOWER: Record<string, string> = {
  CA: 'Assembly',
  NV: 'Assembly',
  NY: 'Assembly',
  WI: 'Assembly',
  NJ: 'General Assembly',
  MD: 'House of Delegates',
  VA: 'House of Delegates',
  WV: 'House of Delegates',
};
// Nebraska has one chamber; D.C. has a council in place of a legislature.
const UPPER: Record<string, string> = { NE: 'Legislature', DC: 'Council' };

export function lowerChamber(state: string) {
  return LOWER[state] ?? 'House';
}

export function upperChamber(state: string) {
  return UPPER[state] ?? 'Senate';
}

type Districts = { stateHouse: string | null; stateSenate: string | null };

/** "California Assembly District 51", "Nebraska Legislature District 9", "D.C. Council, Ward 2". */
export function stateDistrictLine(state: string, stateName: string, d: Districts) {
  if (state === 'DC') return d.stateSenate ? `D.C. Council, ${d.stateSenate}` : null;
  if (d.stateHouse) return `${stateName} ${lowerChamber(state)} District ${d.stateHouse}`;
  if (d.stateSenate) return `${stateName} ${upperChamber(state)} District ${d.stateSenate}`;
  return null;
}

/** Both state seats in one line: "Assembly District 51, Senate District 26". */
export function stateSeats(state: string, d: Districts) {
  if (state === 'DC') return d.stateSenate ? `${d.stateSenate} and the at-large members` : 'Your ward and the at-large members';
  const parts = [
    d.stateHouse ? `${lowerChamber(state)} District ${d.stateHouse}` : null,
    d.stateSenate ? `${upperChamber(state)} District ${d.stateSenate}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(', ') : 'Your state lawmakers';
}

/** "capitol.texas.gov" from a source link, for "See HB 1481 on ...". */
export function sourceHost(url: string) {
  return url.match(/^https?:\/\/(?:www\.)?([^/?#]+)/)?.[1] ?? 'the official site';
}

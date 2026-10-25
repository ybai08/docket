// ZIP -> state, county, city and districts, read from the zip_districts table (built from Census files by
// scripts/build_civic_data.py). Nothing is looked up from outside at request time.
import { query } from './db.ts';

export const STATE_NAMES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut',
  DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois',
  IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana',
  NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
  NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania',
  RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah',
  VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
  AS: 'American Samoa', GU: 'Guam', MP: 'Northern Mariana Islands', PR: 'Puerto Rico', VI: 'U.S. Virgin Islands',
};

export const stateName = (state: string | null | undefined) => (state ? (STATE_NAMES[state] ?? state) : null);

export type Location = {
  zip: string;
  state: string;
  stateName: string;
  county: string | null;
  city: string | null;
  /** District names as people say them: '49', 'Belknap 1', '1st Middlesex'. */
  districts: {
    congress: string | null;
    stateSenate: string | null;
    stateHouse: string | null;
    council: string | null;
  };
  /** Kinds where the ZIP straddles more than one district; the one covering most of it is used. */
  split: string[];
};

/** Normalized district codes, matched against lawmakers.district_key. */
export type Seats = {
  state: string;
  city: string | null;
  congress: string | null;
  upper: string | null;
  lower: string | null;
  council: string | null;
};

type Row = { state: string; kind: string; code: string; name: string; share: number };

// 'State House District Belknap 01' -> 'Belknap 1'; 'Congressional District 7' -> '7'.
const label = (name: string) =>
  (name.match(/\b(?:sub)?district\b\s*(.+)$/i)?.[1] ?? name).replace(/(?<!\d)0+(?=\d)/g, '').trim();

async function rowsFor(zip: string) {
  const rows = await query<Row>('SELECT state, kind, code, name, share FROM zip_districts WHERE zip = $1 ORDER BY share DESC', [zip]);
  if (!rows.length) return null;
  // A few ZIPs cross a state line; use the state that holds most of the ZIP.
  const state = (rows.find((r) => r.kind === 'county') ?? rows[0]).state;
  const mine = rows.filter((r) => r.state === state);
  return { state, rows: mine, top: (kind: string) => mine.find((r) => r.kind === kind) ?? null };
}

export async function lookupZip(zip: string): Promise<Location | null> {
  const z = await rowsFor(zip);
  if (!z) return null;
  const { top, rows } = z;
  const congress = top('us-house');
  return {
    zip,
    state: z.state,
    stateName: stateName(z.state)!,
    county: top('county')?.name ?? null,
    city: top('city')?.name ?? null,
    districts: {
      // At-large seats and non-voting delegates are district 0 in the data; say "At-large" instead.
      congress: congress ? (congress.code === '0' ? 'At-large' : congress.code) : null,
      stateSenate: top('state-upper') ? label(top('state-upper')!.name) : null,
      stateHouse: top('state-lower') ? label(top('state-lower')!.name) : null,
      council: top('city-council')?.code ?? null,
    },
    split: [...new Set(rows.filter((r) => rows.filter((x) => x.kind === r.kind).length > 1).map((r) => r.kind))],
  };
}

export async function zipSeats(zip: string): Promise<Seats | null> {
  const z = await rowsFor(zip);
  if (!z) return null;
  const { top } = z;
  return {
    state: z.state,
    city: top('city')?.name ?? null,
    congress: top('us-house')?.code ?? null,
    upper: top('state-upper')?.code ?? null,
    lower: top('state-lower')?.code ?? null,
    council: top('city-council')?.code ?? null,
  };
}

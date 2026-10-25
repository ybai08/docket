// ZIP -> county, city and districts, read from the zip_districts table (built from Census files by
// scripts/build_civic_data.py). Nothing is looked up from outside at request time.
import { query } from './db.ts';

export type Location = {
  zip: string;
  state: string;
  stateName: string;
  county: string | null;
  city: string | null;
  districts: {
    congress: string | null;
    stateSenate: string | null;
    stateHouse: string | null;
    council: string | null;
  };
  /** Kinds where the ZIP straddles more than one district; the one covering most of it is used. */
  split: string[];
};

type Row = { kind: string; code: string; name: string; share: number };

export async function lookupZip(zip: string): Promise<Location | null> {
  const rows = await query<Row>('SELECT kind, code, name, share FROM zip_districts WHERE zip = $1 ORDER BY share DESC', [zip]);
  if (!rows.length) return null;
  const top = (kind: string) => rows.find((r) => r.kind === kind) ?? null;
  return {
    zip,
    state: 'TX',
    stateName: 'Texas',
    county: top('county')?.name ?? null,
    city: top('city')?.name ?? null,
    districts: {
      congress: top('us-house')?.code ?? null,
      stateSenate: top('tx-senate')?.code ?? null,
      stateHouse: top('tx-house')?.code ?? null,
      council: top('atx-council')?.code ?? null,
    },
    split: [...new Set(rows.filter((r) => rows.filter((x) => x.kind === r.kind).length > 1).map((r) => r.kind))],
  };
}

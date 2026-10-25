// ZIP -> state, county, city and districts with the free U.S. Census APIs (no key).
// A ZIP can straddle districts, so we use the ZIP's internal point and say so in the app.

const STATES: Record<string, string> = {
  '01': 'AL', '02': 'AK', '04': 'AZ', '05': 'AR', '06': 'CA', '08': 'CO', '09': 'CT', '10': 'DE', '11': 'DC',
  '12': 'FL', '13': 'GA', '15': 'HI', '16': 'ID', '17': 'IL', '18': 'IN', '19': 'IA', '20': 'KS', '21': 'KY',
  '22': 'LA', '23': 'ME', '24': 'MD', '25': 'MA', '26': 'MI', '27': 'MN', '28': 'MS', '29': 'MO', '30': 'MT',
  '31': 'NE', '32': 'NV', '33': 'NH', '34': 'NJ', '35': 'NM', '36': 'NY', '37': 'NC', '38': 'ND', '39': 'OH',
  '40': 'OK', '41': 'OR', '42': 'PA', '44': 'RI', '45': 'SC', '46': 'SD', '47': 'TN', '48': 'TX', '49': 'UT',
  '50': 'VT', '51': 'VA', '53': 'WA', '54': 'WV', '55': 'WI', '56': 'WY', '72': 'PR',
};

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
    schoolDistrict: string | null;
  };
};

type Geo = Record<string, string | undefined>;

const cache = new Map<string, Location | null>();

async function getJson(url: string) {
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Census lookup failed (${res.status})`);
  return res.json();
}

export async function lookupZip(zip: string): Promise<Location | null> {
  if (cache.has(zip)) return cache.get(zip)!;
  const zcta = await getJson(
    'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/PUMA_TAD_TAZ_UGA_ZCTA/MapServer/1/query?' +
      new URLSearchParams({ where: `ZCTA5='${zip}'`, outFields: 'INTPTLAT,INTPTLON', returnGeometry: 'false', f: 'json' }),
  );
  const point = zcta.features?.[0]?.attributes as { INTPTLAT: string; INTPTLON: string } | undefined;
  if (!point) {
    cache.set(zip, null);
    return null;
  }
  const geo = await getJson(
    'https://geocoding.geo.census.gov/geocoder/geographies/coordinates?' +
      new URLSearchParams({
        x: String(Number(point.INTPTLON)),
        y: String(Number(point.INTPTLAT)),
        benchmark: 'Public_AR_Current',
        vintage: 'Current_Current',
        layers: 'all',
        format: 'json',
      }),
  );
  const layers = geo.result.geographies as Record<string, Geo[]>;
  // Layer names carry years ("120th Congressional Districts"), so match on the stable part.
  const first = (part: string) => Object.entries(layers).find(([k, v]) => k.includes(part) && v.length)?.[1][0];
  const state = first('States');
  if (!state?.STATE) {
    cache.set(zip, null);
    return null;
  }
  const loc: Location = {
    zip,
    state: STATES[state.STATE] ?? state.STATE,
    stateName: state.NAME ?? '',
    county: first('Counties')?.NAME ?? null,
    city: first('Incorporated Places')?.BASENAME ?? null,
    districts: {
      congress: first('Congressional Districts')?.BASENAME ?? null,
      stateSenate: first('Legislative Districts - Upper')?.BASENAME ?? null,
      stateHouse: first('Legislative Districts - Lower')?.BASENAME ?? null,
      schoolDistrict: first('Unified School Districts')?.NAME ?? null,
    },
  };
  cache.set(zip, loc);
  return loc;
}

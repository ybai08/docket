import type { LandslideItem } from './types';

// Final Texas House record votes, 89th Legislature (2025), from the House Journal.
// HB 2's last House vote was concurring in Senate amendments (122–13), not the earlier 142–5.
export const LANDSLIDE_OCT24: LandslideItem[] = [
  {
    billId: 'tx-89r-sb3',
    number: 'SB 3',
    title: 'Ban hemp-derived THC products',
    yeas: 87,
    nays: 54,
    sourceUrl: 'https://capitol.texas.gov/BillLookup/History.aspx?LegSess=89R&Bill=SB3',
  },
  {
    billId: 'tx-89r-hb2',
    number: 'HB 2',
    title: 'Raise state funding for public schools',
    yeas: 122,
    nays: 13,
    sourceUrl: 'https://journals.house.texas.gov/hjrnl/89r/pdf/89RDAY77FINAL.PDF',
  },
  {
    billId: 'tx-89r-sb2',
    number: 'SB 2',
    title: 'Create education savings accounts',
    yeas: 86,
    nays: 61,
    sourceUrl: 'https://journals.house.texas.gov/hjrnl/89r/pdf/89RDAY46FINAL.PDF',
  },
  {
    billId: 'tx-89r-hb1481',
    number: 'HB 1481',
    title: 'Ban personal phones in classrooms',
    yeas: 128,
    nays: 17,
    sourceUrl: 'https://capitol.texas.gov/BillLookup/History.aspx?LegSess=89R&Bill=HB1481',
  },
];

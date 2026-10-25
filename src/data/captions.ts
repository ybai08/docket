import type { Caption } from './types';

// Real captions are copied exactly from Texas Legislature Online ("Caption Text"). Fakes are
// written by Docket and always stamped FAKE after the answer. Never show a fake out of context.
const tlo = (bill: string) => `https://capitol.texas.gov/BillLookup/History.aspx?LegSess=89R&Bill=${bill}`;

export const CAPTIONS_OCT24: Caption[] = [
  {
    id: 'tx-89r-hb582',
    text: 'Relating to proper etiquette during the recitation of the pledge of allegiance to the state flag.',
    origin: 'Texas House, 2025',
    real: true,
    number: 'HB 582',
    explanation: 'Real. HB 582 was sent to the State Affairs committee and went no further.',
    sourceUrl: tlo('HB582'),
  },
  {
    id: 'fake-handshake',
    text: 'Relating to requiring a two-step handshake at the start of state agency meetings.',
    origin: 'Texas House, 2025',
    real: false,
    explanation: 'Docket wrote this one. No bill like it was filed in 2025.',
  },
  {
    id: 'tx-89r-sb1364',
    text: "Relating to the repeal of wheelbase and horsepower restrictions for the state's passenger vehicle fleet.",
    origin: 'Texas Senate, 2025',
    real: true,
    number: 'SB 1364',
    explanation: 'Real. SB 1364 passed both chambers and was signed into law.',
    sourceUrl: tlo('SB1364'),
  },
  {
    id: 'tx-89r-hb2669',
    text: 'Relating to the establishment of a reporting and education program for the dangers of balloons to livestock.',
    origin: 'Texas House, 2025',
    real: true,
    number: 'HB 2669',
    explanation: 'Real. HB 2669 passed the House, then stalled in the Senate.',
    sourceUrl: tlo('HB2669'),
  },
  {
    id: 'fake-line-standers',
    text: 'Relating to the licensing of professional line-standers at state offices; providing a civil penalty.',
    origin: 'Texas Senate, 2025',
    real: false,
    explanation: 'Docket wrote this one. It is not a real bill.',
  },
  {
    id: 'tx-89r-hb1382',
    text: 'Relating to a prohibition on weather modification and control; creating a criminal offense.',
    origin: 'Texas House, 2025',
    real: true,
    number: 'HB 1382',
    explanation: 'Real. HB 1382 was left pending in committee.',
    sourceUrl: tlo('HB1382'),
  },
  {
    id: 'tx-89r-sb1804',
    text: 'Relating to restitution and compensation paid to victims of certain offenses for tattoo removal related to the offense.',
    origin: 'Texas Senate, 2025',
    real: true,
    number: 'SB 1804',
    explanation: 'Real. SB 1804 passed both chambers and was signed into law.',
    sourceUrl: tlo('SB1804'),
  },
  {
    id: 'fake-armadillo',
    text: 'Relating to designating the armadillo as the official state lawn ornament.',
    origin: 'Texas House, 2025',
    real: false,
    explanation: 'Docket wrote this one. It is not a real bill.',
  },
];

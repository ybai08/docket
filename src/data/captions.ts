import type { Caption } from './types';

// Real captions restate the official caption from Texas Legislature Online ("Caption Text") in plain
// English, adding nothing it doesn't say. Fakes are written in the same style by Docket and always
// stamped FAKE after the answer. Never show a fake out of context.
const tlo = (bill: string) => `https://capitol.texas.gov/BillLookup/History.aspx?LegSess=89R&Bill=${bill}`;

export const CAPTIONS_OCT24: Caption[] = [
  {
    id: 'tx-89r-hb582',
    text: 'Set rules of etiquette for reciting the pledge of allegiance to the Texas flag.',
    origin: 'Texas House, 2025',
    real: true,
    number: 'HB 582',
    explanation: 'Real. HB 582 was sent to the State Affairs committee and went no further.',
    sourceUrl: tlo('HB582'),
  },
  {
    id: 'fake-handshake',
    text: 'Require a two-step handshake at the start of every state agency meeting.',
    origin: 'Texas House, 2025',
    real: false,
    explanation: 'Docket wrote this one. No bill like it was filed in 2025.',
  },
  {
    id: 'tx-89r-sb1364',
    text: 'Drop the wheelbase and horsepower limits on the passenger cars the state buys for its fleet.',
    origin: 'Texas Senate, 2025',
    real: true,
    number: 'SB 1364',
    explanation: 'Real. SB 1364 passed both chambers and was signed into law.',
    sourceUrl: tlo('SB1364'),
  },
  {
    id: 'tx-89r-hb2669',
    text: 'Create a program to report and teach the dangers balloons pose to livestock.',
    origin: 'Texas House, 2025',
    real: true,
    number: 'HB 2669',
    explanation: 'Real. HB 2669 passed the House, then stalled in the Senate.',
    sourceUrl: tlo('HB2669'),
  },
  {
    id: 'fake-line-standers',
    text: 'License people paid to stand in line at state offices, with fines for breaking the rules.',
    origin: 'Texas Senate, 2025',
    real: false,
    explanation: 'Docket wrote this one. It is not a real bill.',
  },
  {
    id: 'tx-89r-hb1382',
    text: 'Ban modifying or controlling the weather, and make doing it a crime.',
    origin: 'Texas House, 2025',
    real: true,
    number: 'HB 1382',
    explanation: 'Real. HB 1382 was left pending in committee.',
    sourceUrl: tlo('HB1382'),
  },
  {
    id: 'tx-89r-sb1804',
    text: 'Pay victims of certain crimes to remove tattoos connected to those crimes.',
    origin: 'Texas Senate, 2025',
    real: true,
    number: 'SB 1804',
    explanation: 'Real. SB 1804 passed both chambers and was signed into law.',
    sourceUrl: tlo('SB1804'),
  },
  {
    id: 'fake-armadillo',
    text: 'Name the armadillo the official state lawn ornament.',
    origin: 'Texas House, 2025',
    real: false,
    explanation: 'Docket wrote this one. It is not a real bill.',
  },
];

export const CAPTIONS_OCT25: Caption[] = [
  {
    id: 'tx-89r-hb911',
    text: 'Make Celebration of Life Day a state holiday.',
    origin: 'Texas House, 2025',
    real: true,
    number: 'HB 911',
    explanation: 'Real. HB 911 was sent to committee and went no further.',
    sourceUrl: tlo('HB911'),
  },
  {
    id: 'fake-screen-door',
    text: 'Name the sound of a screen door closing the official state sound.',
    origin: 'Texas Senate, 2025',
    real: false,
    explanation: 'Docket wrote this one. It is not a real bill.',
  },
  {
    id: 'tx-89r-hb3760',
    text: 'Exempt some materials used to trap feral hogs from sales and use taxes.',
    origin: 'Texas House, 2025',
    real: true,
    number: 'HB 3760',
    explanation: 'Real. HB 3760 was sent to the Ways & Means committee and went no further.',
    sourceUrl: tlo('HB3760'),
  },
  {
    id: 'tx-89r-hb2976',
    text: 'Set rules for how restaurants advertise and sell catfish and similar fish, with fines for breaking them.',
    origin: 'Texas House, 2025',
    real: true,
    number: 'HB 2976',
    explanation: 'Real. HB 2976 was sent to committee and went no further.',
    sourceUrl: tlo('HB2976'),
  },
  {
    id: 'fake-trail-steps',
    text: 'Require state parks to post the number of steps on each hiking trail, with fines for parks that don\'t.',
    origin: 'Texas House, 2025',
    real: false,
    explanation: 'Docket wrote this one. It is not a real bill.',
  },
  {
    id: 'tx-89r-hb3481',
    text: 'Regulate trampoline parks, and let courts order them to follow the rules.',
    origin: 'Texas House, 2025',
    real: true,
    number: 'HB 3481',
    explanation: 'Real. HB 3481 was sent to the Insurance committee and went no further.',
    sourceUrl: tlo('HB3481'),
  },
  {
    id: 'tx-89r-hb472',
    text: 'Repay state employees for groceries they eat while traveling for work.',
    origin: 'Texas House, 2025',
    real: true,
    number: 'HB 472',
    explanation: 'Real. HB 472 was sent to committee and went no further.',
    sourceUrl: tlo('HB472'),
  },
  {
    id: 'fake-mailbox-height',
    text: 'Set one required height for home mailboxes on county roads, and make breaking it a crime.',
    origin: 'Texas Senate, 2025',
    real: false,
    explanation: 'Docket wrote this one. It is not a real bill.',
  },
];

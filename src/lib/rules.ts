// Pure game rules shared by the app and the server. No React Native imports here.
import type { Bill, Caption, LandslideItem, Vote } from '../data/types.ts';

/** Agreeing with the final vote means your vote matches whether the body passed it. */
export function agreed(bill: Bill, vote: Vote) {
  return (vote === 'yea') === bill.passed;
}

export function rollCallAgreement(bills: Bill[], votes: Record<string, Vote>) {
  return bills.map((b) => (votes[b.id] ? agreed(b, votes[b.id]) : null));
}

export function filedOrFakeScore(captions: Caption[], answers: Record<string, boolean>) {
  return captions.filter((c) => answers[c.id] === c.real).length;
}

export function margin(item: Pick<LandslideItem, 'yeas' | 'nays'>) {
  return item.yeas - item.nays;
}

/** The correct order: widest margin first. */
export function landslideAnswer(items: LandslideItem[]) {
  return [...items].sort((a, b) => margin(b) - margin(a)).map((i) => i.billId);
}

/** 3 points for an exact spot, 1 for one off. */
export function landslidePoints(order: string[], answer: string[]) {
  return order.map((id, i): number => {
    const d = Math.abs(answer.indexOf(id) - i);
    return d === 0 ? 3 : d === 1 ? 1 : 0;
  });
}

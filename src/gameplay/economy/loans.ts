import { NICK, usd } from './types';

/**
 * Nick's street loans to the other leads. Interest compounds daily (1.2%/day, roughly 8.7% a week:
 * friendly by shylock standards, ruinous if ignored). A loan is due 7 days after it is made; on the
 * due day the borrower's cash is drawn on (as much as they have), and if some is left the loan
 * rolls another week. Each outcome emits a relationship delta for the host to apply:
 *   paid in full +1, partial 0, nothing 0 then -1 on a second miss.
 */
export const DAILY_RATE = 0.012;
export const LOAN_TERM_DAYS = 7;
export const MAX_OUTSTANDING = usd(5000);

export interface Loan { id: number; lender: string; borrower: string; principal: number; balance: number; madeDay: number; dueDay: number; misses: number }
export interface LoanDue { loan: Loan; paid: number; remaining: number; relationship: number }

export class Loans {
  readonly loans: Loan[] = [];
  private nextId = 1;
  /** `pull(borrower, lender, cents)` moves cash borrower->lender and returns what actually moved. */
  constructor(private lender = NICK) {}

  outstanding(borrower: string) { return this.loans.filter((l) => l.borrower === borrower).reduce((a, l) => a + l.balance, 0); }
  /** Make a loan (the caller moves the money). Returns the loan or null if refused. */
  lend(lender: string, borrower: string, cents: number, day: number): Loan | null {
    if (lender !== this.lender || borrower === lender || !(cents > 0)) return null;
    if (this.outstanding(borrower) + cents > MAX_OUTSTANDING) return null;
    const l: Loan = { id: this.nextId++, lender, borrower, principal: cents, balance: cents, madeDay: day, dueDay: day + LOAN_TERM_DAYS, misses: 0 };
    this.loans.push(l);
    return l;
  }
  /** Daily interest on every open loan. */
  accrue() { for (const l of this.loans) l.balance = Math.round(l.balance * (1 + DAILY_RATE)); }
  /** Voluntary repayment (the caller has already taken `cents` from the borrower). Returns the part used. */
  repay(borrower: string, cents: number): number {
    let left = cents;
    for (const l of [...this.loans].filter((x) => x.borrower === borrower).sort((a, b) => a.dueDay - b.dueDay)) {
      const use = Math.min(left, l.balance);
      l.balance -= use; left -= use;
      if (l.balance <= 0) this.loans.splice(this.loans.indexOf(l), 1);
      if (left <= 0) break;
    }
    return cents - left;
  }
  /** On a new day, collect the loans that fall due. `cashOf` and `take` expose the borrower's wallet. */
  settle(day: number, cashOf: (lead: string) => number, take: (lead: string, cents: number) => boolean): LoanDue[] {
    const out: LoanDue[] = [];
    for (const l of [...this.loans]) {
      if (day < l.dueDay) continue;
      const pay = Math.min(l.balance, cashOf(l.borrower));
      const paid = pay > 0 && take(l.borrower, pay) ? pay : 0;
      l.balance -= paid;
      let rel = 0;
      if (l.balance <= 0) { rel = 1; this.loans.splice(this.loans.indexOf(l), 1); }
      else { l.dueDay = day + LOAN_TERM_DAYS; if (paid === 0) { l.misses++; rel = l.misses >= 2 ? -1 : 0; } }
      out.push({ loan: { ...l }, paid, remaining: l.balance, relationship: rel });
    }
    return out;
  }
  serialize() { return { loans: this.loans, nextId: this.nextId }; }
  restore(o: ReturnType<Loans['serialize']>) { this.loans.length = 0; this.loans.push(...o.loans); this.nextId = o.nextId; }
}

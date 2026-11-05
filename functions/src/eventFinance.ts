// The arithmetic behind "are we going to lose money on this event". Shared on
// purpose, like ics.ts: the admin page imports this file and the tests run it.
// No dependencies, no Node or DOM APIs.

export interface CostLine {
  label: string;
  cents: number;
  /** True when the cost scales with headcount (catering, name tags). */
  per_head: boolean;
}

export interface FinanceInputs {
  costs: CostLine[];
  /** Processor fee, as a fraction of each charge plus a fixed part. */
  fee_rate: number;
  fee_fixed_cents: number;
  /** The most the fiduciary has agreed to lose. */
  max_loss_cents: number | null;
}

export const stripeFee = (chargeCents: number, f: Pick<FinanceInputs, 'fee_rate' | 'fee_fixed_cents'>) =>
  chargeCents > 0 ? Math.round(chargeCents * f.fee_rate) + f.fee_fixed_cents : 0;

export const fixedCosts = (f: FinanceInputs) => f.costs.filter((c) => !c.per_head).reduce((n, c) => n + c.cents, 0);
export const perHeadCost = (f: FinanceInputs) => f.costs.filter((c) => c.per_head).reduce((n, c) => n + c.cents, 0);

/** Net of a scenario: sponsors in hand, `heads` people at the door of whom the
 *  given numbers paid each ticket price. Comped people still eat lunch. */
export function net(f: FinanceInputs, s: { heads: number; ticket_cents: number[]; sponsor_cents: number }): number {
  const tickets = s.ticket_cents.reduce((n, c) => n + c - stripeFee(c, f), 0);
  return s.sponsor_cents + tickets - fixedCosts(f) - perHeadCost(f) * s.heads;
}

/** What one more person at `ticketCents` adds. If this is small, selling more
 *  tickets will not rescue the budget and only sponsors will. */
export const marginPerHead = (f: FinanceInputs, ticketCents: number) => ticketCents - stripeFee(ticketCents, f) - perHeadCost(f);

/** Sponsorship needed for `heads` paying `ticketCents` each to break even. */
export const sponsorsToBreakEven = (f: FinanceInputs, heads: number, ticketCents: number) =>
  Math.max(0, fixedCosts(f) - marginPerHead(f, ticketCents) * heads);

/** Parses the budget box: one line each, `label | dollars | head` where the
 *  last part is present for a per-head cost. Lines without a number are skipped,
 *  so a budget line whose cost is not known yet can sit there as a reminder. */
export function parseCosts(text: string): CostLine[] {
  const out: CostLine[] = [];
  for (const line of text.split('\n')) {
    const [label, amount, unit] = line.split('|').map((x) => x.trim());
    const dollars = Number((amount ?? '').replace(/[$,]/g, ''));
    if (!label || !amount || !Number.isFinite(dollars)) continue;
    out.push({ label, cents: Math.round(dollars * 100), per_head: /head/i.test(unit ?? '') });
  }
  return out;
}

export const formatCosts = (costs: CostLine[]) =>
  costs.map((c) => `${c.label} | ${c.cents / 100}${c.per_head ? ' | head' : ''}`).join('\n');

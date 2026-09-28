/** The cycle currently in progress (start <= today < end), anchored on `anchorDay`. */
export function currentCycle(anchorDay: number, today: Date): { start: Date; end: Date } {
  let start = new Date(today.getFullYear(), today.getMonth(), anchorDay);
  if (start.getTime() > today.getTime()) {
    start = new Date(today.getFullYear(), today.getMonth() - 1, anchorDay);
  }
  const end = new Date(start.getFullYear(), start.getMonth() + 1, anchorDay);
  return { start, end };
}

export function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** YYYY-MM-DD from local date parts (toISOString would shift a local-midnight date back a day east of UTC). */
export function formatLocalDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export interface InvoiceCycle {
  /** Inclusive YYYY-MM-DD bounds, matching the Orders page date filter. */
  periodStart: string;
  periodEnd: string;
}

/** The cycle that `date` falls in, with an inclusive end date. */
export function cycleContaining(anchorDay: number, date: Date): InvoiceCycle {
  const { start, end } = currentCycle(anchorDay, date);
  const lastDay = new Date(end.getFullYear(), end.getMonth(), end.getDate() - 1);
  return { periodStart: formatLocalDate(start), periodEnd: formatLocalDate(lastDay) };
}

/** The current cycle followed by the `count - 1` cycles before it, newest first. */
export function recentCycles(anchorDay: number, today: Date, count: number): InvoiceCycle[] {
  const cycles: InvoiceCycle[] = [];
  let cursor = today;
  for (let i = 0; i < count; i++) {
    const cycle = cycleContaining(anchorDay, cursor);
    cycles.push(cycle);
    const [y, m, d] = cycle.periodStart.split("-").map(Number);
    cursor = new Date(y, m - 1, d - 1);
  }
  return cycles;
}

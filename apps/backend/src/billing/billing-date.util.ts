function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

/** Next occurrence of `anchorDay` (1-28) on or after `from`. */
export function nextBillingDate(anchorDay: number, from: Date): Date {
  const year = from.getFullYear();
  const month = from.getMonth();
  const candidate = new Date(year, month, anchorDay);

  if (candidate.getTime() >= from.getTime()) {
    return candidate;
  }
  return new Date(year, month + 1, anchorDay);
}

export function daysBetween(a: Date, b: Date): number {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  return Math.round((b.getTime() - a.getTime()) / MS_PER_DAY);
}

/** Prorated charge for the stub period from `start` up to (excluding) `end`, at `monthlyRate`. */
export function proratedAmount(start: Date, end: Date, monthlyRate: number): number {
  const days = Math.max(0, daysBetween(start, end));
  const totalDaysInMonth = daysInMonth(start.getFullYear(), start.getMonth());
  return Math.round(((monthlyRate * days) / totalDaysInMonth) * 100) / 100;
}

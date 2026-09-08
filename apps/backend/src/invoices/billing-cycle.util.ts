/** Most recently completed monthly cycle (end <= today) anchored on `anchorDay`. */
export function lastCompletedCycle(anchorDay: number, today: Date): { start: Date; end: Date } {
  let end = new Date(today.getFullYear(), today.getMonth(), anchorDay);
  if (end.getTime() > today.getTime()) {
    end = new Date(today.getFullYear(), today.getMonth() - 1, anchorDay);
  }
  const start = new Date(end.getFullYear(), end.getMonth() - 1, anchorDay);
  return { start, end };
}

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

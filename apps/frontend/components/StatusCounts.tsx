"use client";

/** Order status colors, fixed across role themes (same as the dashboard charts). */
export const STATUS_COLORS: Record<string, string> = {
  PENDING: "#f59e0b",
  PROCESSING: "#3b82f6",
  SHIPPED: "#8b5cf6",
  DELIVERED: "#10b981",
  CANCELLED: "#ef4444",
  REFUNDED: "#6b7280",
};

/**
 * A row of count cards: a gradient Total card, then one card per status in its status color. With `onSelect` the
 * cards are buttons that pick a status (null = Total) and `active` highlights the current one; without it they're
 * display-only. `labels` / `colors` name and color extra, non-status cards (e.g. the 3PL "No tracking #" card).
 */
export default function StatusCounts({
  totalLabel,
  total,
  statuses,
  counts,
  active,
  onSelect,
  labels,
  colors,
}: {
  totalLabel: string;
  total: number;
  statuses: string[];
  counts: Record<string, number>;
  labels?: Record<string, string>;
  colors?: Record<string, string>;
  active?: string | null;
  onSelect?: (status: string | null) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
      <StatusCount label={totalLabel} count={total} active={onSelect ? !active : true} onClick={onSelect && (() => onSelect(null))} />
      {statuses.map((s) => (
        <StatusCount
          key={s}
          label={labels?.[s] ?? s}
          count={counts[s] ?? 0}
          color={colors?.[s] ?? STATUS_COLORS[s]}
          active={!!onSelect && active === s}
          onClick={onSelect && (() => onSelect(active === s ? null : s))}
        />
      ))}
    </div>
  );
}

function StatusCount({
  label,
  count,
  color,
  active,
  onClick,
}: {
  label: string;
  count: number;
  color?: string;
  active: boolean;
  onClick?: () => void;
}) {
  const className = `status-count ${color ? "" : "status-count-total"} ${active ? "status-count-active" : ""} ${
    onClick ? "" : "status-count-static"
  }`;
  const style = color ? ({ "--status-color": color } as React.CSSProperties) : undefined;
  const body = (
    <>
      <span className="flex items-center gap-1.5 text-xs font-medium">
        {color && <span className="inline-block h-2 w-2 rounded-full" style={{ background: color }} />}
        {label}
      </span>
      <span className="mt-1 block text-2xl font-semibold">{count}</span>
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} aria-pressed={active} className={className} style={style}>
      {body}
    </button>
  ) : (
    <div className={className} style={style}>
      {body}
    </div>
  );
}

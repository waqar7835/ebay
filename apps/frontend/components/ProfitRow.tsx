"use client";

/** One line of the Amounts card's profit estimate; `amount` colors a total green (profit) or red (loss). */
export default function ProfitRow({
  label,
  value,
  amount,
  strong,
  divider,
}: {
  label: string;
  value: string;
  amount?: number;
  strong?: boolean;
  divider?: boolean;
}) {
  const tone = amount == null ? "text-slate-700" : amount < 0 ? "text-red-600" : "text-green-600";
  return (
    <div className={`flex justify-between gap-3 ${divider ? "mt-1 border-t border-slate-100 pt-2" : ""}`}>
      <dt className={strong ? "font-medium text-slate-700" : "text-slate-500"}>{label}</dt>
      <dd className={`mb-0 tabular-nums ${tone} ${strong ? "font-semibold" : ""}`}>{value}</dd>
    </div>
  );
}

import { cn } from "@/lib/utils";
import type { FeeMonth } from "@/lib/fees.functions";

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export type MonthKey = `${number}-${number}`;
export const monthKey = (y: number, m: number): MonthKey =>
  `${y}-${m}` as MonthKey;

const STATUS_STYLE: Record<FeeMonth["status"], string> = {
  paid: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30 dark:text-emerald-300",
  partial: "bg-amber-500/15 text-amber-700 border-amber-500/30 dark:text-amber-300",
  pending: "bg-red-500/15 text-red-700 border-red-500/30 dark:text-red-300",
  upcoming: "bg-muted text-muted-foreground border-border",
};

export function MonthStatusGrid({
  months,
  selected,
  onToggle,
  selectable = true,
}: {
  months: FeeMonth[];
  selected?: Set<MonthKey>;
  onToggle?: (key: MonthKey, month: FeeMonth) => void;
  selectable?: boolean;
}) {
  if (!months.length) {
    return (
      <p className="text-sm text-muted-foreground">
        No fee periods yet — check that the class has a monthly fee set in Settings.
      </p>
    );
  }
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
      {months.map((m) => {
        const k = monthKey(m.period_year, m.period_month);
        const isSelectable =
          selectable && (m.status === "pending" || m.status === "partial" || m.status === "upcoming") && Number(m.due) > 0;
        const isSelected = selected?.has(k);
        return (
          <button
            type="button"
            key={k}
            disabled={!isSelectable && selectable}
            onClick={() => isSelectable && onToggle?.(k, m)}
            aria-pressed={isSelected}
            className={cn(
              "rounded-lg border px-3 py-2 text-left transition-all",
              STATUS_STYLE[m.status],
              isSelectable
                ? "cursor-pointer hover:scale-[1.02] hover:shadow-sm"
                : "cursor-default",
              isSelected && "ring-2 ring-primary ring-offset-1 ring-offset-background",
            )}
          >
            <div className="text-xs font-medium">
              {MONTH_NAMES[m.period_month - 1]} {m.period_year}
            </div>
            <div className="text-[10px] uppercase tracking-wide opacity-70">
              {m.status === "upcoming" ? "Upcoming" : m.status}
            </div>
            <div className="text-xs font-semibold mt-0.5">
              ₹{Number(m.due).toLocaleString("en-IN")}
            </div>
          </button>
        );
      })}
    </div>
  );
}

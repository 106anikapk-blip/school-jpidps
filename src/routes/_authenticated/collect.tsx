import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { notifyFeeDeposit } from "@/lib/telegram.functions";
import { collectFee, getStudentFeeStatus } from "@/lib/fees.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { formatCurrency, formatDate } from "@/lib/format";
import { StudentCombobox } from "@/components/student-combobox";
import { MonthStatusGrid, monthKey, type MonthKey } from "@/components/month-status-grid";

export const Route = createFileRoute("/_authenticated/collect")({
  component: CollectFee,
  validateSearch: (s: Record<string, unknown>) => ({
    studentId: typeof s.studentId === "string" ? s.studentId : undefined,
  }),
});

function CollectFee() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const qc = useQueryClient();
  const notify = useServerFn(notifyFeeDeposit);
  const fetchStatus = useServerFn(getStudentFeeStatus);
  const collect = useServerFn(collectFee);

  const dateId = useId();
  const modeId = useId();
  const noteId = useId();

  const [studentId, setStudentId] = useState<string>(search.studentId ?? "");
  const [selected, setSelected] = useState<Set<MonthKey>>(new Set());
  const [mode, setMode] = useState<"cash" | "upi" | "card" | "bank_transfer" | "cheque">("cash");
  const [paidOn, setPaidOn] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: status, isLoading: statusLoading } = useQuery({
    queryKey: ["fee-status", studentId],
    enabled: !!studentId,
    queryFn: () => fetchStatus({ data: { studentId } }),
  });

  const selectedMonths = useMemo(() => {
    if (!status) return [];
    return status.months.filter((m) =>
      selected.has(monthKey(m.period_year, m.period_month)),
    );
  }, [status, selected]);

  const totalAmount = useMemo(
    () => selectedMonths.length * (status?.monthlyFee ?? 0),
    [selectedMonths, status],
  );

  const paidCount = status?.months.filter((m) => m.status === "paid").length ?? 0;
  const pendingCount = status?.months.filter((m) => m.status === "pending" || m.status === "partial").length ?? 0;

  function handleStudentChange(id: string) {
    setStudentId(id);
    setSelected(new Set());
  }

  function toggleMonth(k: MonthKey) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  function selectAllPending() {
    if (!status) return;
    const next = new Set<MonthKey>();
    for (const m of status.months) {
      if (m.status === "pending" || m.status === "partial") {
        next.add(monthKey(m.period_year, m.period_month));
      }
    }
    setSelected(next);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!studentId) return toast.error("Select a student");
    if (selected.size === 0) return toast.error("Select at least one month");
    if (!status?.monthlyFee) {
      return toast.error(
        `Set monthly fee for class "${status?.student.class_name}" in Settings first.`,
      );
    }

    setBusy(true);
    try {
      const months = Array.from(selected).map((k) => {
        const [y, m] = k.split("-").map(Number);
        return { year: y, month: m };
      });
      const res = await collect({
        data: {
          studentId,
          months,
          payment_mode: mode,
          paid_on: paidOn,
          note: note || undefined,
        },
      });
      toast.success(`Receipt ${res.receiptNo} created`);
      qc.invalidateQueries({ queryKey: ["fee-status", studentId] });

      // Fire-and-forget Telegram notify
      notify({
        data: {
          studentName: status.student.name,
          amount: res.amount,
          receiptNo: res.receiptNo,
          paymentMode: res.payment_mode,
          paidOn: res.paid_on,
          className: status.student.class_name,
        },
      }).catch(() => {});

      navigate({ to: "/receipt/$paymentId", params: { paymentId: res.paymentId } });
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to record payment");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Collect fee</h1>
        <p className="text-sm text-muted-foreground">
          Select a student, pick the months being paid, and generate a receipt.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Student</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <StudentCombobox value={studentId} onChange={handleStudentChange} />

          {studentId && statusLoading && (
            <div className="text-sm text-muted-foreground">Loading fee status…</div>
          )}

          {status && (
            <div className="rounded-lg border bg-card p-4 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-semibold">{status.student.name}</div>
                  <div className="text-xs text-muted-foreground">
                    Class {status.student.class_name}
                    {status.student.section ? ` · ${status.student.section}` : ""}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <Badge variant="secondary">
                    Monthly {formatCurrency(status.monthlyFee)}
                  </Badge>
                  <Badge className="bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/15 border-0">
                    {paidCount} paid
                  </Badge>
                  <Badge className="bg-red-500/15 text-red-700 hover:bg-red-500/15 border-0">
                    {pendingCount} pending
                  </Badge>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                <Stat label="Total pending" value={formatCurrency(status.totalPending)} highlight={status.totalPending > 0} />
                <Stat label="Total paid" value={formatCurrency(status.totalPaid)} />
                <Stat label="Last payment" value={status.lastPaymentDate ? formatDate(status.lastPaymentDate) : "—"} />
              </div>

              {status.monthlyFee === 0 && (
                <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                  No monthly fee configured for class “{status.student.class_name}”. Set it in Settings.
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {status && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <CardTitle className="text-base">Months</CardTitle>
            {pendingCount > 0 && (
              <Button type="button" variant="outline" size="sm" onClick={selectAllPending}>
                Pay full pending fee
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            <MonthStatusGrid
              months={status.months}
              selected={selected}
              onToggle={toggleMonth}
            />
            <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground pt-2">
              <LegendDot className="bg-emerald-500" label="Paid" />
              <LegendDot className="bg-amber-500" label="Partial" />
              <LegendDot className="bg-red-500" label="Pending" />
              <LegendDot className="bg-muted-foreground/40" label="Upcoming" />
            </div>
          </CardContent>
        </Card>
      )}

      {status && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Payment</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor={dateId}>Date</Label>
                  <Input
                    id={dateId}
                    type="date"
                    value={paidOn}
                    onChange={(e) => setPaidOn(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={modeId}>Payment mode</Label>
                  <Select value={mode} onValueChange={(v) => setMode(v as any)}>
                    <SelectTrigger id={modeId} aria-label="Payment mode">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="upi">UPI</SelectItem>
                      <SelectItem value="card">Card</SelectItem>
                      <SelectItem value="bank_transfer">Bank transfer</SelectItem>
                      <SelectItem value="cheque">Cheque</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor={noteId}>Note (optional)</Label>
                <Textarea
                  id={noteId}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  maxLength={255}
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/40 px-4 py-3">
                <div>
                  <div className="text-xs text-muted-foreground">
                    {selected.size} month{selected.size === 1 ? "" : "s"} selected
                  </div>
                  <div className="text-2xl font-semibold">{formatCurrency(totalAmount)}</div>
                </div>
                <Button type="submit" disabled={busy || selected.size === 0}>
                  {busy ? "Saving…" : "Save & generate receipt"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-md border bg-background px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`font-semibold ${highlight ? "text-destructive" : ""}`}>{value}</div>
    </div>
  );
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block h-2.5 w-2.5 rounded-full ${className}`} />
      {label}
    </span>
  );
}

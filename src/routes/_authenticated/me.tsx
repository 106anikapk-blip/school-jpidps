import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getStudentFeeStatus } from "@/lib/fees.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Receipt } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/format";
import { MonthStatusGrid } from "@/components/month-status-grid";

export const Route = createFileRoute("/_authenticated/me")({
  component: StudentPortal,
});

function StudentPortal() {
  const fetchStatus = useServerFn(getStudentFeeStatus);

  const { data, isLoading, error } = useQuery({
    queryKey: ["my-student-data"],
    queryFn: async () => {
      // RLS limits this to the signed-in student's own row
      const { data: students, error: sErr } = await supabase
        .from("students")
        .select("*")
        .limit(1);
      if (sErr) throw sErr;
      const student = students?.[0];
      if (!student) return null;

      const { data: payments, error: pErr } = await supabase
        .from("fee_payments")
        .select("*")
        .eq("student_id", student.id)
        .order("paid_on", { ascending: false });
      if (pErr) throw pErr;

      const status = await fetchStatus({ data: { studentId: student.id } });

      return { student, payments, status };
    },
  });

  if (isLoading) return <div className="text-sm text-muted-foreground">Loading…</div>;
  if (error) return <div className="text-sm text-destructive">{(error as Error).message}</div>;
  if (!data)
    return (
      <div className="text-sm text-muted-foreground">
        No student profile linked to your account.
      </div>
    );

  const { student, payments, status } = data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{student.name}</h1>
        <p className="text-sm text-muted-foreground">
          Admission {student.admission_no ?? "—"} · Class {student.class_name}
          {student.section ? ` · ${student.section}` : ""}
          {student.roll_no ? ` · Roll ${student.roll_no}` : ""}
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Monthly fee" value={formatCurrency(status.monthlyFee)} />
        <Stat label="Total paid" value={formatCurrency(status.totalPaid)} />
        <Stat label="Total pending" value={formatCurrency(status.totalPending)} highlight={status.totalPending > 0} />
        <Stat label="Last payment" value={status.lastPaymentDate ? formatDate(status.lastPaymentDate) : "—"} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Month-wise fee status</CardTitle>
        </CardHeader>
        <CardContent>
          <MonthStatusGrid months={status.months} selectable={false} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payment history</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {payments.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">No payments yet.</div>
          ) : (
            <div className="divide-y">
              {payments.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between gap-3 px-4 md:px-6 py-3"
                >
                  <div className="min-w-0">
                    <div className="font-medium">{p.receipt_no}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatDate(p.paid_on)} ·{" "}
                      <span className="capitalize">{p.payment_mode}</span>
                      {p.note ? ` · ${p.note}` : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="font-semibold">{formatCurrency(Number(p.amount))}</div>
                    <Button asChild size="sm" variant="outline">
                      <Link to="/receipt/$paymentId" params={{ paymentId: p.id }}>
                        <Receipt className="h-4 w-4" /> Receipt
                      </Link>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`mt-1 font-semibold ${highlight ? "text-destructive" : ""}`}>
          {value}
        </div>
      </CardContent>
    </Card>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate } from "@/lib/format";
import { ArrowLeft, Receipt } from "lucide-react";

export const Route = createFileRoute("/_authenticated/students/$id")({
  component: StudentDetail,
});

function StudentDetail() {
  const { id } = Route.useParams();
  const { data, isLoading } = useQuery({
    queryKey: ["student-detail", id],
    queryFn: async () => {
      const { data: s, error } = await supabase.from("students").select("*").eq("id", id).single();
      if (error) throw error;
      const { data: payments, error: pErr } = await supabase
        .from("fee_payments")
        .select("*")
        .eq("student_id", id)
        .order("paid_on", { ascending: false });
      if (pErr) throw pErr;
      const paid = payments.reduce((s, p) => s + Number(p.amount), 0);
      return { student: s, payments, paid, pending: Math.max(0, Number(s.total_fee) - paid) };
    },
  });

  if (isLoading) return <div className="text-sm text-muted-foreground">Loading…</div>;
  if (!data) return null;
  const { student, payments, paid, pending } = data;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button asChild size="icon" variant="ghost" aria-label="Back to students">
          <Link to="/students" aria-label="Back to students"><ArrowLeft className="h-4 w-4" aria-hidden="true" /></Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">{student.name}</h1>
          <p className="text-sm text-muted-foreground">
            Class {student.class_name}{student.section ? ` · ${student.section}` : ""}{student.roll_no ? ` · Roll ${student.roll_no}` : ""}
          </p>
        </div>
        <Button asChild>
          <Link to="/collect" search={{ studentId: student.id }}>Collect fee</Link>
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Parent" value={student.parent_name ?? "—"} />
        <Stat label="Phone" value={student.phone ?? "—"} />
        <Stat label="Total fee" value={formatCurrency(Number(student.total_fee))} />
        <Stat label="Pending" value={formatCurrency(pending)} highlight={pending > 0} />
      </div>

      <Card>
        <CardHeader><CardTitle>Payment history · {formatCurrency(paid)} paid</CardTitle></CardHeader>
        <CardContent className="p-0">
          {payments.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">No payments yet.</div>
          ) : (
            <div className="divide-y">
              {payments.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-3 px-4 md:px-6 py-3">
                  <div className="min-w-0">
                    <div className="font-medium">{p.receipt_no}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatDate(p.paid_on)} · <span className="capitalize">{p.payment_mode}</span>
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

function Stat({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`mt-1 font-semibold ${highlight ? "text-destructive" : ""}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

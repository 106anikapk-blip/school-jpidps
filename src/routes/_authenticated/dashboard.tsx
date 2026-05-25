import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Wallet, AlertTriangle, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const [students, payments, recent] = await Promise.all([
        supabase.from("students").select("id, total_fee"),
        supabase.from("fee_payments").select("amount, paid_on"),
        supabase
          .from("fee_payments")
          .select("id, amount, paid_on, receipt_no, payment_mode, student:students(name, class_name)")
          .order("created_at", { ascending: false })
          .limit(8),
      ]);
      if (students.error) throw students.error;
      if (payments.error) throw payments.error;
      if (recent.error) throw recent.error;

      const totalStudents = students.data.length;
      const totalCollected = payments.data.reduce((s, p) => s + Number(p.amount), 0);
      const totalExpected = students.data.reduce((s, st) => s + Number(st.total_fee), 0);
      const pending = Math.max(0, totalExpected - totalCollected);

      const today = new Date().toISOString().slice(0, 10);
      const collectedToday = payments.data
        .filter((p) => p.paid_on === today)
        .reduce((s, p) => s + Number(p.amount), 0);

      return {
        totalStudents,
        totalCollected,
        pending,
        collectedToday,
        recent: recent.data,
      };
    },
  });

  const stats = [
    { label: "Students", value: data?.totalStudents ?? 0, icon: Users, format: (v: number) => v.toString() },
    { label: "Collected today", value: data?.collectedToday ?? 0, icon: TrendingUp, format: formatCurrency },
    { label: "Total collected", value: data?.totalCollected ?? 0, icon: Wallet, format: formatCurrency },
    { label: "Pending dues", value: data?.pending ?? 0, icon: AlertTriangle, format: formatCurrency },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Overview of fee collection and pending dues.</p>
        </div>
        <div className="flex gap-2">
          <Button asChild>
            <Link to="/collect">Collect fee</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/students">Manage students</Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4 md:p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs md:text-sm text-muted-foreground">{s.label}</span>
                <s.icon className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="mt-2 text-xl md:text-2xl font-semibold">
                {isLoading ? "…" : s.format(Number(s.value))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold leading-none tracking-tight">Recent payments</h2>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">Loading…</div>
          ) : data && data.recent.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">No payments yet.</div>
          ) : (
            <div className="divide-y">
              {data?.recent.map((p: any) => (
                <Link
                  key={p.id}
                  to="/receipt/$paymentId"
                  params={{ paymentId: p.id }}
                  className="flex items-center justify-between gap-3 px-4 md:px-6 py-3 hover:bg-accent/50"
                >
                  <div className="min-w-0">
                    <div className="font-medium truncate">{p.student?.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {p.student?.class_name} · {formatDate(p.paid_on)} · {p.receipt_no}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold">{formatCurrency(Number(p.amount))}</div>
                    <div className="text-xs text-muted-foreground capitalize">{p.payment_mode}</div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

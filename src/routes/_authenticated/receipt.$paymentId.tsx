import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowLeft, Printer, Download } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/receipt/$paymentId")({
  component: ReceiptPage,
});

function ReceiptPage() {
  const { paymentId } = Route.useParams();
  const { data, isLoading } = useQuery({
    queryKey: ["receipt", paymentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fee_payments")
        .select("*, student:students(*)")
        .eq("id", paymentId)
        .single();
      if (error) throw error;
      const { data: schoolName } = await supabase
        .from("app_settings").select("value").eq("key", "school_name").maybeSingle();
      return { ...data, school_name: schoolName?.value || "School Fee Manager" };
    },
  });

  async function downloadPdf() {
    if (!data) return;
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF({ unit: "pt", format: "a5" });
    const W = doc.internal.pageSize.getWidth();
    let y = 40;

    doc.setFont("helvetica", "bold").setFontSize(16);
    doc.text(data.school_name, W / 2, y, { align: "center" });
    y += 18;
    doc.setFont("helvetica", "normal").setFontSize(10);
    doc.text("Fee Payment Receipt", W / 2, y, { align: "center" });
    y += 24;
    doc.setDrawColor(200);
    doc.line(30, y, W - 30, y);
    y += 18;

    const rows: [string, string][] = [
      ["Receipt no.", data.receipt_no],
      ["Date", formatDate(data.paid_on)],
      ["Student", data.student?.name ?? ""],
      ["Class", `${data.student?.class_name ?? ""}${data.student?.section ? " · " + data.student.section : ""}`],
      ["Roll no.", data.student?.roll_no ?? "—"],
      ["Parent", data.student?.parent_name ?? "—"],
      ["Payment mode", String(data.payment_mode).toUpperCase()],
    ];
    doc.setFontSize(10);
    for (const [k, v] of rows) {
      doc.setFont("helvetica", "normal").setTextColor(120);
      doc.text(k, 40, y);
      doc.setFont("helvetica", "bold").setTextColor(0);
      doc.text(String(v), W - 40, y, { align: "right" });
      y += 16;
    }
    if (data.note) {
      doc.setFont("helvetica", "normal").setTextColor(120);
      doc.text("Note", 40, y);
      doc.setFont("helvetica", "bold").setTextColor(0);
      doc.text(String(data.note), W - 40, y, { align: "right" });
      y += 16;
    }

    y += 8;
    doc.setDrawColor(200);
    doc.line(30, y, W - 30, y);
    y += 22;

    doc.setFont("helvetica", "bold").setFontSize(12);
    doc.text("Amount paid", 40, y);
    doc.setFontSize(14);
    doc.text(formatCurrency(Number(data.amount)), W - 40, y, { align: "right" });

    y += 40;
    doc.setFont("helvetica", "italic").setFontSize(9).setTextColor(120);
    doc.text("Thank you. This is a computer-generated receipt.", W / 2, y, { align: "center" });

    doc.save(`Receipt-${data.receipt_no}.pdf`);
  }

  if (isLoading || !data) return <div className="text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      <div className="flex items-center justify-between gap-2 print:hidden">
        <Button asChild size="sm" variant="ghost">
          <Link to="/dashboard"><ArrowLeft className="h-4 w-4" /> Back</Link>
        </Button>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> Print
          </Button>
          <Button size="sm" onClick={downloadPdf}>
            <Download className="h-4 w-4" /> Download PDF
          </Button>
        </div>
      </div>

      <Card className="p-6 md:p-8 print:shadow-none print:border-0">
        <div className="text-center border-b pb-4">
          <div className="text-xl font-semibold tracking-tight">{data.school_name}</div>
          <h1 className="text-base font-medium text-muted-foreground mt-1">
            Fee Payment Receipt · {data.receipt_no}
          </h1>
        </div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm mt-5">
          <Row label="Receipt no." value={data.receipt_no} />
          <Row label="Date" value={formatDate(data.paid_on)} />
          <Row label="Student" value={data.student.name} />
          <Row label="Class" value={`${data.student.class_name}${data.student.section ? ` · ${data.student.section}` : ""}`} />
          <Row label="Roll no." value={data.student.roll_no ?? "—"} />
          <Row label="Parent" value={data.student.parent_name ?? "—"} />
          <Row label="Phone" value={data.student.phone ?? "—"} />
          <Row label="Payment mode" value={String(data.payment_mode).toUpperCase()} />
          {data.note && <Row label="Note" value={data.note} className="col-span-2" />}
        </div>

        <div className="flex items-center justify-between mt-6 pt-4 border-t">
          <div className="text-sm text-muted-foreground">Amount paid</div>
          <div className="text-2xl font-semibold">{formatCurrency(Number(data.amount))}</div>
        </div>

        <div className="text-center text-xs text-muted-foreground mt-6 italic">
          Thank you. This is a computer-generated receipt.
        </div>
      </Card>
    </div>
  );
}

function Row({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return (
    <div className={className}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}

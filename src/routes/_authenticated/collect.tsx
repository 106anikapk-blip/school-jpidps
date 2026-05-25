import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { notifyFeeDeposit } from "@/lib/telegram.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/collect")({
  component: CollectFee,
  validateSearch: (s: Record<string, unknown>) => ({
    studentId: typeof s.studentId === "string" ? s.studentId : undefined,
  }),
});

const schema = z.object({
  student_id: z.string().uuid(),
  amount: z.coerce.number().positive().max(10_000_000),
  payment_mode: z.enum(["cash", "upi", "card", "bank_transfer", "cheque"]),
  paid_on: z.string().min(1),
  note: z.string().max(255).optional().or(z.literal("")),
});

function CollectFee() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const notify = useServerFn(notifyFeeDeposit);

  const [studentId, setStudentId] = useState(search.studentId ?? "");
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState<"cash" | "upi" | "card" | "bank_transfer" | "cheque">("cash");
  const [paidOn, setPaidOn] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: students } = useQuery({
    queryKey: ["students-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("id, name, class_name, total_fee")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: paidSoFar } = useQuery({
    queryKey: ["paid-so-far", studentId],
    enabled: !!studentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fee_payments")
        .select("amount")
        .eq("student_id", studentId);
      if (error) throw error;
      return data.reduce((s, p) => s + Number(p.amount), 0);
    },
  });

  const selected = students?.find((s) => s.id === studentId);
  const pending = selected ? Math.max(0, Number(selected.total_fee) - (paidSoFar ?? 0)) : 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = schema.safeParse({
      student_id: studentId,
      amount,
      payment_mode: mode,
      paid_on: paidOn,
      note,
    });
    if (!parsed.success) {
      toast.error(parsed.error.errors[0].message);
      return;
    }
    setBusy(true);
    const { data: inserted, error } = await supabase
      .from("fee_payments")
      .insert({
        student_id: parsed.data.student_id,
        amount: parsed.data.amount,
        payment_mode: parsed.data.payment_mode,
        paid_on: parsed.data.paid_on,
        note: parsed.data.note || null,
      })
      .select("id, receipt_no, amount, paid_on, payment_mode")
      .single();
    if (error) {
      setBusy(false);
      return toast.error(error.message);
    }
    toast.success(`Receipt ${inserted.receipt_no} created`);

    // Fire-and-forget Telegram notify
    notify({
      data: {
        studentName: selected?.name ?? "Student",
        amount: Number(inserted.amount),
        receiptNo: inserted.receipt_no,
        paymentMode: inserted.payment_mode,
        paidOn: inserted.paid_on,
        className: selected?.class_name,
      },
    })
      .then((r) => {
        if (!r.sent && r.reason === "no_chat_id") {
          toast.info("Tip: add a Telegram chat ID in Settings to receive notifications.");
        }
      })
      .catch((err) => {
        console.error(err);
        toast.warning("Receipt saved but Telegram notification failed.");
      });

    setBusy(false);
    navigate({ to: "/receipt/$paymentId", params: { paymentId: inserted.id } });
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Collect fee</h1>
        <p className="text-sm text-muted-foreground">Record a payment and generate a receipt.</p>
      </div>

      <Card>
        <CardHeader><CardTitle>New payment</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Student</Label>
              <Select value={studentId} onValueChange={setStudentId}>
                <SelectTrigger><SelectValue placeholder="Select a student" /></SelectTrigger>
                <SelectContent>
                  {students?.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} · {s.class_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selected && (
                <div className="text-xs text-muted-foreground">
                  Total fee {formatCurrency(Number(selected.total_fee))} · Paid {formatCurrency(paidSoFar ?? 0)} · Pending{" "}
                  <span className={pending > 0 ? "text-destructive font-medium" : ""}>{formatCurrency(pending)}</span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Amount (₹)</Label>
                <Input type="number" min="1" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label>Date</Label>
                <Input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} required />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Payment mode</Label>
              <Select value={mode} onValueChange={(v) => setMode(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="upi">UPI</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                  <SelectItem value="bank_transfer">Bank transfer</SelectItem>
                  <SelectItem value="cheque">Cheque</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Note (optional)</Label>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={255} />
            </div>

            <Button type="submit" disabled={busy || !studentId}>
              {busy ? "Saving…" : "Save & generate receipt"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

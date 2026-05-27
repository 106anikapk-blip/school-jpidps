import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function requireAdmin(supabase: any, userId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Forbidden: admin only");
}

const statusInput = z.object({ studentId: z.string().uuid() });

export type FeeMonth = {
  period_year: number;
  period_month: number;
  due: number;
  paid: number;
  status: "paid" | "partial" | "pending" | "upcoming";
};

export const getStudentFeeStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => statusInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Authorization: admin OR the student themselves
    const { data: isAdmin } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();

    const { data: student, error: sErr } = await supabaseAdmin
      .from("students")
      .select("id, name, class_name, section, auth_user_id, start_year, start_month")
      .eq("id", data.studentId)
      .maybeSingle();
    if (sErr) throw new Error(sErr.message);
    if (!student) throw new Error("Student not found");
    if (!isAdmin && student.auth_user_id !== userId) {
      throw new Error("Forbidden");
    }

    const { data: months, error: mErr } = await supabaseAdmin.rpc(
      "student_fee_status",
      { _student_id: data.studentId },
    );
    if (mErr) throw new Error(mErr.message);

    const { data: feeRow } = await supabaseAdmin
      .from("fee_structure")
      .select("monthly_fee")
      .eq("class_name", student.class_name)
      .maybeSingle();
    const monthlyFee = Number(feeRow?.monthly_fee ?? 0);

    const { data: lastPay } = await supabaseAdmin
      .from("fee_payments")
      .select("paid_on")
      .eq("student_id", data.studentId)
      .order("paid_on", { ascending: false })
      .limit(1)
      .maybeSingle();

    const list = (months ?? []) as FeeMonth[];
    let totalDue = 0;
    let totalPaid = 0;
    for (const m of list) {
      totalDue += Number(m.due);
      totalPaid += Number(m.paid);
    }
    const totalPending = list
      .filter((m) => m.status === "pending" || m.status === "partial")
      .reduce((s, m) => s + Math.max(0, Number(m.due) - Number(m.paid)), 0);

    return {
      student: {
        id: student.id,
        name: student.name,
        class_name: student.class_name,
        section: student.section,
      },
      monthlyFee,
      months: list,
      totalDue,
      totalPaid,
      totalPending,
      lastPaymentDate: lastPay?.paid_on ?? null,
    };
  });

const collectInput = z.object({
  studentId: z.string().uuid(),
  months: z
    .array(
      z.object({
        year: z.number().int().min(2000).max(2100),
        month: z.number().int().min(1).max(12),
      }),
    )
    .min(1)
    .max(36),
  payment_mode: z.enum(["cash", "upi", "card", "bank_transfer", "cheque"]),
  paid_on: z.string().min(1),
  note: z.string().max(255).optional(),
});

export const collectFee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => collectInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireAdmin(supabase, userId);

    const { data: student, error: sErr } = await supabaseAdmin
      .from("students")
      .select("id, class_name")
      .eq("id", data.studentId)
      .maybeSingle();
    if (sErr || !student) throw new Error("Student not found");

    const { data: feeRow } = await supabaseAdmin
      .from("fee_structure")
      .select("monthly_fee")
      .eq("class_name", student.class_name)
      .maybeSingle();
    const monthlyFee = Number(feeRow?.monthly_fee ?? 0);
    if (monthlyFee <= 0) {
      throw new Error(
        `Set monthly fee for class "${student.class_name}" in Settings first.`,
      );
    }

    // Reject months that already have a full payment
    const conflicts: string[] = [];
    for (const m of data.months) {
      const { data: existing } = await supabaseAdmin
        .from("fee_period_payments")
        .select("amount")
        .eq("student_id", data.studentId)
        .eq("period_year", m.year)
        .eq("period_month", m.month);
      const paid = (existing ?? []).reduce(
        (s, r) => s + Number(r.amount),
        0,
      );
      if (paid >= monthlyFee) {
        conflicts.push(`${m.year}-${String(m.month).padStart(2, "0")}`);
      }
    }
    if (conflicts.length) {
      throw new Error(`Already paid: ${conflicts.join(", ")}`);
    }

    const amount = monthlyFee * data.months.length;

    const { data: payment, error: pErr } = await supabaseAdmin
      .from("fee_payments")
      .insert({
        student_id: data.studentId,
        amount,
        payment_mode: data.payment_mode,
        paid_on: data.paid_on,
        note: data.note || null,
        created_by: userId,
      })
      .select("id, receipt_no, amount, paid_on, payment_mode")
      .single();
    if (pErr || !payment) throw new Error(pErr?.message ?? "Failed to record payment");

    const rows = data.months.map((m) => ({
      payment_id: payment.id,
      student_id: data.studentId,
      period_year: m.year,
      period_month: m.month,
      amount: monthlyFee,
    }));
    const { error: fppErr } = await supabaseAdmin
      .from("fee_period_payments")
      .insert(rows);
    if (fppErr) {
      // rollback the parent payment to keep things consistent
      await supabaseAdmin.from("fee_payments").delete().eq("id", payment.id);
      throw new Error(fppErr.message);
    }

    return {
      paymentId: payment.id,
      receiptNo: payment.receipt_no,
      amount: Number(payment.amount),
      paid_on: payment.paid_on,
      payment_mode: payment.payment_mode,
    };
  });

const searchInput = z.object({ q: z.string().trim().max(64).optional() });

export const searchStudents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => searchInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireAdmin(supabase, userId);

    const q = (data.q ?? "").trim();
    let query = supabaseAdmin
      .from("students")
      .select("id, name, class_name, section, admission_no, phone")
      .order("name")
      .limit(50);

    if (q) {
      const like = `%${q.replace(/[%_]/g, "")}%`;
      query = query.or(
        `name.ilike.${like},admission_no.ilike.${like},phone.ilike.${like}`,
      );
    }
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

const upsertFeeInput = z.object({
  class_name: z.string().trim().min(1).max(40),
  monthly_fee: z.number().min(0).max(1_000_000),
});

export const upsertClassFee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => upsertFeeInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireAdmin(supabase, userId);

    const { error } = await supabaseAdmin
      .from("fee_structure")
      .upsert(
        { class_name: data.class_name, monthly_fee: data.monthly_fee, updated_at: new Date().toISOString() },
        { onConflict: "class_name" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteClassFee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ class_name: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireAdmin(supabase, userId);
    const { error } = await supabaseAdmin
      .from("fee_structure")
      .delete()
      .eq("class_name", data.class_name);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

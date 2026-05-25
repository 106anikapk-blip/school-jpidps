import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Synthetic email used for student auth accounts.
// We never display this to the user; they sign in by admission no or phone.
function studentEmail(admissionNo: string) {
  return `s_${admissionNo.trim().toLowerCase().replace(/[^a-z0-9]/g, "")}@students.school.local`;
}

const createInput = z.object({
  name: z.string().trim().min(1).max(120),
  admission_no: z.string().trim().min(1).max(40).regex(/^[A-Za-z0-9_\-/]+$/),
  class_name: z.string().trim().min(1).max(40),
  section: z.string().trim().max(20).optional(),
  roll_no: z.string().trim().max(40).optional(),
  parent_name: z.string().trim().max(120).optional(),
  phone: z.string().trim().min(4).max(20).regex(/^[0-9+\-\s]+$/).optional().or(z.literal("")),
  total_fee: z.number().min(0).max(10_000_000),
  notes: z.string().trim().max(500).optional(),
  password: z.string().min(6).max(72),
});

export const createStudentAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Verify caller is admin
    const { data: adminRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!adminRow) throw new Error("Forbidden: admin only");

    // Ensure unique admission_no
    const { data: existing } = await supabaseAdmin
      .from("students")
      .select("id")
      .eq("admission_no", data.admission_no)
      .maybeSingle();
    if (existing) throw new Error("Admission number already exists");

    const email = studentEmail(data.admission_no);

    const { data: created, error: createErr } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password: data.password,
        email_confirm: true,
        user_metadata: { full_name: data.name, role: "student" },
      });
    if (createErr || !created.user) {
      throw new Error(createErr?.message ?? "Failed to create login account");
    }

    const authUserId = created.user.id;

    const { data: student, error: insertErr } = await supabaseAdmin
      .from("students")
      .insert({
        name: data.name,
        admission_no: data.admission_no,
        class_name: data.class_name,
        section: data.section || null,
        roll_no: data.roll_no || null,
        parent_name: data.parent_name || null,
        phone: data.phone || null,
        total_fee: data.total_fee,
        notes: data.notes || null,
        auth_user_id: authUserId,
      })
      .select("id")
      .single();

    if (insertErr) {
      // Roll back the auth user so we don't leave an orphan account
      await supabaseAdmin.auth.admin.deleteUser(authUserId).catch(() => {});
      throw new Error(insertErr.message);
    }

    return { id: student.id };
  });

const resetInput = z.object({
  studentId: z.string().uuid(),
  password: z.string().min(6).max(72),
});

export const resetStudentPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => resetInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: adminRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!adminRow) throw new Error("Forbidden: admin only");

    const { data: s } = await supabaseAdmin
      .from("students")
      .select("auth_user_id")
      .eq("id", data.studentId)
      .maybeSingle();
    if (!s?.auth_user_id) throw new Error("Student has no login account");

    const { error } = await supabaseAdmin.auth.admin.updateUserById(s.auth_user_id, {
      password: data.password,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const deleteInput = z.object({ studentId: z.string().uuid() });

export const deleteStudentAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => deleteInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: adminRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!adminRow) throw new Error("Forbidden: admin only");

    const { data: s } = await supabaseAdmin
      .from("students")
      .select("auth_user_id")
      .eq("id", data.studentId)
      .maybeSingle();

    const { error } = await supabaseAdmin
      .from("students")
      .delete()
      .eq("id", data.studentId);
    if (error) throw new Error(error.message);

    if (s?.auth_user_id) {
      await supabaseAdmin.auth.admin.deleteUser(s.auth_user_id).catch(() => {});
    }
    return { ok: true };
  });

const resolveInput = z.object({
  identifier: z.string().trim().min(1).max(64),
});

// Public (no auth) — returns the synthetic email for a student given
// their admission no or phone. The caller still needs the password.
export const resolveStudentEmail = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => resolveInput.parse(d))
  .handler(async ({ data }) => {
    const id = data.identifier.trim();

    // Try admission_no first
    const { data: byAdm } = await supabaseAdmin
      .from("students")
      .select("admission_no")
      .eq("admission_no", id)
      .maybeSingle();
    if (byAdm?.admission_no) return { email: studentEmail(byAdm.admission_no) };

    // Then phone
    const { data: byPhone } = await supabaseAdmin
      .from("students")
      .select("admission_no")
      .eq("phone", id)
      .not("admission_no", "is", null)
      .limit(1)
      .maybeSingle();
    if (byPhone?.admission_no) return { email: studentEmail(byPhone.admission_no) };

    throw new Error("No student found with that admission number or phone");
  });

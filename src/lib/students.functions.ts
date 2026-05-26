import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Synthetic email used for student auth accounts.
// Students never see this; they log in with their generated username (admission_no).
function studentEmail(username: string) {
  return `s_${username.trim().toLowerCase().replace(/[^a-z0-9]/g, "")}@students.school.local`;
}

// Username = first 4 letters of name (uppercased, letters only) + last 4 digits of phone.
// If name has fewer than 4 letters, use what's available.
function baseUsername(name: string, phone: string) {
  const letters = name.replace(/[^a-zA-Z]/g, "").toUpperCase().slice(0, 4);
  const digits = phone.replace(/\D/g, "").slice(-4);
  if (!letters) throw new Error("Name must contain at least one letter");
  if (digits.length < 4) throw new Error("Phone must contain at least 4 digits");
  return `${letters}${digits}`;
}

async function uniqueUsername(name: string, phone: string): Promise<string> {
  const base = baseUsername(name, phone);
  // Try base, then base + 2 random digits, up to a handful of times.
  for (let i = 0; i < 8; i++) {
    const candidate = i === 0 ? base : `${base}${Math.floor(Math.random() * 90) + 10}`;
    const { data } = await supabaseAdmin
      .from("students")
      .select("id")
      .eq("admission_no", candidate)
      .maybeSingle();
    if (!data) return candidate;
  }
  throw new Error("Could not generate a unique username, please try again");
}

async function requireAdmin(supabase: any, userId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Forbidden: admin only");
}

const createInput = z.object({
  name: z.string().trim().min(1).max(120),
  class_name: z.string().trim().min(1).max(40),
  section: z.string().trim().max(20).optional(),
  roll_no: z.string().trim().max(40).optional(),
  parent_name: z.string().trim().max(120).optional(),
  phone: z.string().trim().min(4).max(20).regex(/^[0-9+\-\s]+$/, "Digits only"),
  total_fee: z.number().min(0).max(10_000_000),
  notes: z.string().trim().max(500).optional(),
});

export const createStudentAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireAdmin(supabase, userId);

    const username = await uniqueUsername(data.name, data.phone);
    const password = data.phone.replace(/\D/g, ""); // exact mobile digits
    const email = studentEmail(username);

    const { data: created, error: createErr } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password,
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
        admission_no: username,
        class_name: data.class_name,
        section: data.section || null,
        roll_no: data.roll_no || null,
        parent_name: data.parent_name || null,
        phone: data.phone,
        total_fee: data.total_fee,
        notes: data.notes || null,
        auth_user_id: authUserId,
      })
      .select("id")
      .single();

    if (insertErr) {
      await supabaseAdmin.auth.admin.deleteUser(authUserId).catch(() => {});
      throw new Error(insertErr.message);
    }

    return { id: student.id, username, password };
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
    await requireAdmin(supabase, userId);

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
    await requireAdmin(supabase, userId);

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

// Backfill credentials for existing students that don't yet have a login account.
// Generates username + password using the same rules. Skips students without a
// valid phone or letters in their name and reports them.
export const backfillStudentCredentials = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await requireAdmin(supabase, userId);

    const { data: students, error } = await supabaseAdmin
      .from("students")
      .select("id, name, phone, auth_user_id, admission_no")
      .is("auth_user_id", null);
    if (error) throw new Error(error.message);

    const generated: { id: string; name: string; username: string; password: string }[] = [];
    const skipped: { name: string; reason: string }[] = [];

    for (const s of students ?? []) {
      try {
        if (!s.phone || s.phone.replace(/\D/g, "").length < 4) {
          skipped.push({ name: s.name, reason: "missing/short phone" });
          continue;
        }
        const username = await uniqueUsername(s.name, s.phone);
        const password = s.phone.replace(/\D/g, "");
        const email = studentEmail(username);

        const { data: created, error: createErr } =
          await supabaseAdmin.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: { full_name: s.name, role: "student" },
          });
        if (createErr || !created.user) {
          skipped.push({ name: s.name, reason: createErr?.message ?? "auth create failed" });
          continue;
        }

        const { error: updErr } = await supabaseAdmin
          .from("students")
          .update({ auth_user_id: created.user.id, admission_no: username })
          .eq("id", s.id);
        if (updErr) {
          await supabaseAdmin.auth.admin.deleteUser(created.user.id).catch(() => {});
          skipped.push({ name: s.name, reason: updErr.message });
          continue;
        }

        generated.push({ id: s.id, name: s.name, username, password });
      } catch (err: any) {
        skipped.push({ name: s.name, reason: err?.message ?? "unknown error" });
      }
    }

    return { generated, skipped };
  });

const resolveInput = z.object({
  identifier: z.string().trim().min(1).max(64),
});

// Public — resolves the synthetic email for a student given username or phone.
export const resolveStudentEmail = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => resolveInput.parse(d))
  .handler(async ({ data }) => {
    const id = data.identifier.trim();

    const { data: byAdm } = await supabaseAdmin
      .from("students")
      .select("admission_no")
      .eq("admission_no", id)
      .maybeSingle();
    if (byAdm?.admission_no) return { email: studentEmail(byAdm.admission_no) };

    const { data: byAdmCi } = await supabaseAdmin
      .from("students")
      .select("admission_no")
      .ilike("admission_no", id)
      .limit(1)
      .maybeSingle();
    if (byAdmCi?.admission_no) return { email: studentEmail(byAdmCi.admission_no) };

    const { data: byPhone } = await supabaseAdmin
      .from("students")
      .select("admission_no")
      .eq("phone", id)
      .not("admission_no", "is", null)
      .limit(1)
      .maybeSingle();
    if (byPhone?.admission_no) return { email: studentEmail(byPhone.admission_no) };

    throw new Error("No student found with that username or phone");
  });

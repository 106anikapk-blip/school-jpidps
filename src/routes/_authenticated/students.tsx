import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Search, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/students")({
  component: StudentsPage,
});

const studentSchema = z.object({
  name: z.string().trim().min(1).max(120),
  class_name: z.string().trim().min(1).max(40),
  section: z.string().trim().max(20).optional().or(z.literal("")),
  roll_no: z.string().trim().max(40).optional().or(z.literal("")),
  parent_name: z.string().trim().max(120).optional().or(z.literal("")),
  phone: z.string().trim().max(20).optional().or(z.literal("")),
  total_fee: z.coerce.number().min(0).max(10_000_000),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
});

type StudentForm = z.infer<typeof studentSchema>;

const empty: StudentForm = {
  name: "",
  class_name: "",
  section: "",
  roll_no: "",
  parent_name: "",
  phone: "",
  total_fee: 0,
  notes: "",
};

function StudentsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<StudentForm>(empty);
  const [busy, setBusy] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["students-with-paid"],
    queryFn: async () => {
      const { data: students, error } = await supabase
        .from("students")
        .select("*")
        .order("name");
      if (error) throw error;
      const { data: payments, error: pErr } = await supabase
        .from("fee_payments")
        .select("student_id, amount");
      if (pErr) throw pErr;
      const paidMap = new Map<string, number>();
      for (const p of payments) {
        paidMap.set(p.student_id, (paidMap.get(p.student_id) ?? 0) + Number(p.amount));
      }
      return students.map((s) => ({
        ...s,
        paid: paidMap.get(s.id) ?? 0,
        pending: Math.max(0, Number(s.total_fee) - (paidMap.get(s.id) ?? 0)),
      }));
    },
  });

  const filtered =
    data?.filter((s) =>
      [s.name, s.class_name, s.roll_no, s.parent_name, s.phone]
        .filter(Boolean)
        .some((f) => String(f).toLowerCase().includes(search.toLowerCase()))
    ) ?? [];

  function openNew() {
    setEditing(null);
    setForm(empty);
    setOpen(true);
  }
  function openEdit(s: any) {
    setEditing(s);
    setForm({
      name: s.name,
      class_name: s.class_name,
      section: s.section ?? "",
      roll_no: s.roll_no ?? "",
      parent_name: s.parent_name ?? "",
      phone: s.phone ?? "",
      total_fee: Number(s.total_fee),
      notes: s.notes ?? "",
    });
    setOpen(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = studentSchema.safeParse(form);
    if (!parsed.success) {
      toast.error(parsed.error.errors[0].message);
      return;
    }
    setBusy(true);
    const payload = {
      ...parsed.data,
      section: parsed.data.section || null,
      roll_no: parsed.data.roll_no || null,
      parent_name: parsed.data.parent_name || null,
      phone: parsed.data.phone || null,
      notes: parsed.data.notes || null,
    };
    const res = editing
      ? await supabase.from("students").update(payload).eq("id", editing.id)
      : await supabase.from("students").insert(payload);
    setBusy(false);
    if (res.error) return toast.error(res.error.message);
    toast.success(editing ? "Student updated" : "Student added");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["students-with-paid"] });
    qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
  }

  async function remove(id: string) {
    if (!confirm("Delete this student and all their payments?")) return;
    const { error } = await supabase.from("students").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    qc.invalidateQueries({ queryKey: ["students-with-paid"] });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Students</h1>
          <p className="text-sm text-muted-foreground">Manage your student database.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNew}>
              <Plus className="h-4 w-4" /> Add student
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editing ? "Edit student" : "New student"}</DialogTitle>
              <DialogDescription>Enter student details and annual fee.</DialogDescription>
            </DialogHeader>
            <form onSubmit={submit} className="grid grid-cols-2 gap-3">
              <Field label="Full name" className="col-span-2">
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </Field>
              <Field label="Class">
                <Input value={form.class_name} onChange={(e) => setForm({ ...form, class_name: e.target.value })} required />
              </Field>
              <Field label="Section">
                <Input value={form.section} onChange={(e) => setForm({ ...form, section: e.target.value })} />
              </Field>
              <Field label="Roll no.">
                <Input value={form.roll_no} onChange={(e) => setForm({ ...form, roll_no: e.target.value })} />
              </Field>
              <Field label="Total fee (₹)">
                <Input type="number" min="0" step="0.01" value={form.total_fee} onChange={(e) => setForm({ ...form, total_fee: Number(e.target.value) })} required />
              </Field>
              <Field label="Parent name">
                <Input value={form.parent_name} onChange={(e) => setForm({ ...form, parent_name: e.target.value })} />
              </Field>
              <Field label="Phone">
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </Field>
              <Field label="Notes" className="col-span-2">
                <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </Field>
              <DialogFooter className="col-span-2">
                <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center gap-3 space-y-0">
          <CardTitle className="flex-1">All students</CardTitle>
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" className="pl-8" />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">No students.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground bg-muted/50">
                  <tr>
                    <th className="py-2 px-4 font-medium">Name</th>
                    <th className="py-2 px-4 font-medium">Class</th>
                    <th className="py-2 px-4 font-medium hidden md:table-cell">Parent</th>
                    <th className="py-2 px-4 font-medium text-right">Fee</th>
                    <th className="py-2 px-4 font-medium text-right">Paid</th>
                    <th className="py-2 px-4 font-medium text-right">Pending</th>
                    <th className="py-2 px-4 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.map((s) => (
                    <tr key={s.id} className="hover:bg-accent/40">
                      <td className="py-2 px-4">
                        <Link to="/students/$id" params={{ id: s.id }} className="font-medium hover:underline">
                          {s.name}
                        </Link>
                        {s.roll_no && <div className="text-xs text-muted-foreground">Roll {s.roll_no}</div>}
                      </td>
                      <td className="py-2 px-4">{s.class_name}{s.section ? ` · ${s.section}` : ""}</td>
                      <td className="py-2 px-4 hidden md:table-cell">
                        <div>{s.parent_name ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">{s.phone ?? ""}</div>
                      </td>
                      <td className="py-2 px-4 text-right">{formatCurrency(Number(s.total_fee))}</td>
                      <td className="py-2 px-4 text-right">{formatCurrency(s.paid)}</td>
                      <td className={`py-2 px-4 text-right font-medium ${s.pending > 0 ? "text-destructive" : "text-muted-foreground"}`}>
                        {formatCurrency(s.pending)}
                      </td>
                      <td className="py-2 px-4 text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="icon" variant="ghost" onClick={() => openEdit(s)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => remove(s.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

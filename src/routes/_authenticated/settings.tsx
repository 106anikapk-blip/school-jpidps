import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useId, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { upsertClassFee, deleteClassFee } from "@/lib/fees.functions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const schoolId = useId();
  const chatIdField = useId();
  const newClassId = useId();
  const newFeeId = useId();

  const qc = useQueryClient();
  const upsertFee = useServerFn(upsertClassFee);
  const deleteFee = useServerFn(deleteClassFee);

  const [schoolName, setSchoolName] = useState("");
  const [chatId, setChatId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [newClass, setNewClass] = useState("");
  const [newFee, setNewFee] = useState("");

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("app_settings").select("key, value");
      if (data) {
        setSchoolName(data.find((d) => d.key === "school_name")?.value ?? "");
        setChatId(data.find((d) => d.key === "telegram_chat_id")?.value ?? "");
      }
      setLoading(false);
    })();
  }, []);

  const { data: fees } = useQuery({
    queryKey: ["fee-structure"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fee_structure")
        .select("class_name, monthly_fee")
        .order("class_name");
      if (error) throw error;
      return data;
    },
  });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const rows = [
      { key: "school_name", value: schoolName.trim() },
      { key: "telegram_chat_id", value: chatId.trim() },
    ];
    const { error } = await supabase.from("app_settings").upsert(rows, { onConflict: "key" });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Settings saved");
  }

  async function saveFee(class_name: string, monthly_fee: number) {
    try {
      await upsertFee({ data: { class_name, monthly_fee } });
      qc.invalidateQueries({ queryKey: ["fee-structure"] });
      toast.success(`Saved fee for ${class_name}`);
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to save");
    }
  }

  async function addNew(e: React.FormEvent) {
    e.preventDefault();
    const cn = newClass.trim();
    const fee = Number(newFee);
    if (!cn) return toast.error("Enter a class name");
    if (!Number.isFinite(fee) || fee < 0) return toast.error("Enter a valid fee");
    await saveFee(cn, fee);
    setNewClass("");
    setNewFee("");
  }

  async function removeFee(class_name: string) {
    try {
      await deleteFee({ data: { class_name } });
      qc.invalidateQueries({ queryKey: ["fee-structure"] });
      toast.success(`Removed ${class_name}`);
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to delete");
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">School branding, notifications, and class fees.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>General</CardTitle>
          <CardDescription>Shown on receipts and PDFs.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={save} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor={schoolId}>School name</Label>
              <Input id={schoolId} value={schoolName} onChange={(e) => setSchoolName(e.target.value)} placeholder="e.g. Sunrise Public School" disabled={loading} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={chatIdField}>Telegram chat ID</Label>
              <Input id={chatIdField} value={chatId} onChange={(e) => setChatId(e.target.value)} placeholder="e.g. 123456789 or -100123456789" disabled={loading} />
              <p className="text-xs text-muted-foreground">
                Receive a notification every time a fee is collected.
              </p>
            </div>
            <Button type="submit" disabled={busy || loading}>{busy ? "Saving…" : "Save settings"}</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Class fee structure</CardTitle>
          <CardDescription>
            Set the monthly fee for each class. Changes apply to future pending calculations; existing receipts stay the same.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {fees && fees.length > 0 && (
            <div className="divide-y rounded-md border">
              {fees.map((f) => (
                <FeeRow
                  key={f.class_name}
                  className={f.class_name}
                  initial={Number(f.monthly_fee)}
                  onSave={(v) => saveFee(f.class_name, v)}
                  onDelete={() => removeFee(f.class_name)}
                />
              ))}
            </div>
          )}

          <form onSubmit={addNew} className="grid grid-cols-1 sm:grid-cols-[1fr,1fr,auto] gap-2 items-end">
            <div className="space-y-1.5">
              <Label htmlFor={newClassId}>Class</Label>
              <Input id={newClassId} value={newClass} onChange={(e) => setNewClass(e.target.value)} placeholder="e.g. Class 1" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={newFeeId}>Monthly fee (₹)</Label>
              <Input id={newFeeId} type="number" min="0" step="1" value={newFee} onChange={(e) => setNewFee(e.target.value)} placeholder="500" />
            </div>
            <Button type="submit">Add</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function FeeRow({
  className,
  initial,
  onSave,
  onDelete,
}: {
  className: string;
  initial: number;
  onSave: (v: number) => Promise<void> | void;
  onDelete: () => void;
}) {
  const [v, setV] = useState(String(initial));
  const dirty = Number(v) !== initial;
  return (
    <div className="flex items-center gap-2 p-3">
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{className}</div>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-sm text-muted-foreground">₹</span>
        <Input
          type="number"
          min="0"
          step="1"
          value={v}
          onChange={(e) => setV(e.target.value)}
          className="w-24 h-8"
          aria-label={`Monthly fee for ${className}`}
        />
      </div>
      <Button
        type="button"
        size="sm"
        variant={dirty ? "default" : "outline"}
        disabled={!dirty}
        onClick={() => onSave(Number(v))}
      >
        Save
      </Button>
      <Button type="button" size="icon" variant="ghost" onClick={onDelete} aria-label={`Delete ${className}`}>
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

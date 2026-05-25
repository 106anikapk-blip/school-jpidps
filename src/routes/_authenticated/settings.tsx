import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const [schoolName, setSchoolName] = useState("");
  const [chatId, setChatId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

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

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const rows = [
      { key: "school_name", value: schoolName.trim() },
      { key: "telegram_chat_id", value: chatId.trim() },
    ];
    const { error } = await supabase
      .from("app_settings")
      .upsert(rows, { onConflict: "key" });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Settings saved");
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">School branding and notifications.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>General</CardTitle>
          <CardDescription>Shown on receipts and PDFs.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={save} className="space-y-4">
            <div className="space-y-1.5">
              <Label>School name</Label>
              <Input value={schoolName} onChange={(e) => setSchoolName(e.target.value)} placeholder="e.g. Sunrise Public School" disabled={loading} />
            </div>

            <div className="space-y-1.5">
              <Label>Telegram chat ID</Label>
              <Input value={chatId} onChange={(e) => setChatId(e.target.value)} placeholder="e.g. 123456789 or -100123456789" disabled={loading} />
              <p className="text-xs text-muted-foreground">
                Open your bot in Telegram and send any message, then look up your chat ID. Add it here to receive a notification every time a fee is collected.
              </p>
            </div>

            <Button type="submit" disabled={busy || loading}>{busy ? "Saving…" : "Save settings"}</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

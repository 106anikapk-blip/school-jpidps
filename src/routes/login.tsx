import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { resolveStudentEmail } from "@/lib/students.functions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { GraduationCap } from "lucide-react";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

const adminCred = z.object({
  email: z.string().email().max(255),
  password: z.string().min(6).max(72),
});
const studentCred = z.object({
  identifier: z.string().trim().min(1).max(64),
  password: z.string().min(6).max(72),
});

function LoginPage() {
  const navigate = useNavigate();
  const { session, role, loading } = useAuth();
  const resolve = useServerFn(resolveStudentEmail);
  const [busy, setBusy] = useState(false);

  // Admin form
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [fullName, setFullName] = useState("");

  // Student form
  const [identifier, setIdentifier] = useState("");
  const [studentPassword, setStudentPassword] = useState("");

  useEffect(() => {
    if (loading || !session) return;
    if (role === "student") navigate({ to: "/me", replace: true });
    else if (role === "admin") navigate({ to: "/dashboard", replace: true });
  }, [loading, session, role, navigate]);

  async function handleAdminSignIn(e: React.FormEvent) {
    e.preventDefault();
    const parsed = adminCred.safeParse({ email: adminEmail, password: adminPassword });
    if (!parsed.success) return toast.error(parsed.error.errors[0].message);
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: adminEmail,
      password: adminPassword,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Welcome back");
  }

  async function handleAdminSignUp(e: React.FormEvent) {
    e.preventDefault();
    const parsed = adminCred.safeParse({ email: adminEmail, password: adminPassword });
    if (!parsed.success) return toast.error(parsed.error.errors[0].message);
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email: adminEmail,
      password: adminPassword,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        data: { full_name: fullName || adminEmail },
      },
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Account created. You can sign in now.");
  }

  async function handleStudentSignIn(e: React.FormEvent) {
    e.preventDefault();
    const parsed = studentCred.safeParse({ identifier, password: studentPassword });
    if (!parsed.success) return toast.error(parsed.error.errors[0].message);
    setBusy(true);
    try {
      const { email } = await resolve({ data: { identifier } });
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password: studentPassword,
      });
      if (error) throw new Error(error.message);
      toast.success("Welcome");
    } catch (err: any) {
      toast.error(err?.message ?? "Sign in failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-secondary/30 to-background px-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-6">
          <div className="h-12 w-12 rounded-xl bg-primary text-primary-foreground flex items-center justify-center mb-3">
            <GraduationCap className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">School Fee Manager</h1>
          <p className="text-sm text-muted-foreground">Sign in to continue</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Sign in</CardTitle>
            <CardDescription>Students log in with admission number or phone.</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="student">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="student">Student</TabsTrigger>
                <TabsTrigger value="admin">Admin</TabsTrigger>
              </TabsList>

              <TabsContent value="student">
                <form onSubmit={handleStudentSignIn} className="space-y-3 pt-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="identifier">Admission no. or phone</Label>
                    <Input
                      id="identifier"
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      autoComplete="username"
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="s-password">Password</Label>
                    <Input
                      id="s-password"
                      type="password"
                      value={studentPassword}
                      onChange={(e) => setStudentPassword(e.target.value)}
                      autoComplete="current-password"
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={busy}>
                    {busy ? "Signing in…" : "Sign in"}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="admin">
                <Tabs defaultValue="signin">
                  <TabsList className="grid w-full grid-cols-2 mt-3">
                    <TabsTrigger value="signin">Sign in</TabsTrigger>
                    <TabsTrigger value="signup">Sign up</TabsTrigger>
                  </TabsList>
                  <TabsContent value="signin">
                    <form onSubmit={handleAdminSignIn} className="space-y-3 pt-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="a-email">Email</Label>
                        <Input id="a-email" type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} required />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="a-password">Password</Label>
                        <Input id="a-password" type="password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} required />
                      </div>
                      <Button type="submit" className="w-full" disabled={busy}>
                        {busy ? "Signing in…" : "Sign in"}
                      </Button>
                    </form>
                  </TabsContent>
                  <TabsContent value="signup">
                    <form onSubmit={handleAdminSignUp} className="space-y-3 pt-3">
                      <p className="text-xs text-muted-foreground">
                        Only the first signup becomes admin. Students cannot self-register.
                      </p>
                      <div className="space-y-1.5">
                        <Label htmlFor="a-name">Full name</Label>
                        <Input id="a-name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="a-email2">Email</Label>
                        <Input id="a-email2" type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} required />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="a-password2">Password</Label>
                        <Input id="a-password2" type="password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} required minLength={6} />
                      </div>
                      <Button type="submit" className="w-full" disabled={busy}>
                        {busy ? "Creating account…" : "Create account"}
                      </Button>
                    </form>
                  </TabsContent>
                </Tabs>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

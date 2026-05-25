import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { AppShell } from "@/components/app-shell";

export const Route = createFileRoute("/_authenticated")({
  component: Layout,
});

const ADMIN_ONLY_PREFIXES = ["/dashboard", "/students", "/collect", "/settings"];
const STUDENT_ONLY_PREFIXES = ["/me"];

function Layout() {
  const { session, role, loading } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (loading) return;
    if (!session) {
      navigate({ to: "/login", replace: true });
      return;
    }
    if (!role) return;

    const isOnAdminRoute = ADMIN_ONLY_PREFIXES.some((p) => pathname.startsWith(p));
    const isOnStudentRoute = STUDENT_ONLY_PREFIXES.some((p) => pathname.startsWith(p));

    if (role === "student" && isOnAdminRoute) {
      navigate({ to: "/me", replace: true });
    } else if (role === "admin" && isOnStudentRoute) {
      navigate({ to: "/dashboard", replace: true });
    }
  }, [loading, session, role, pathname, navigate]);

  if (loading || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-sm text-muted-foreground">Loading…</div>
      </div>
    );
  }

  if (role && role !== "admin" && role !== "student") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold">Access required</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your account doesn't have access. Contact the school admin.
          </p>
        </div>
      </div>
    );
  }

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}

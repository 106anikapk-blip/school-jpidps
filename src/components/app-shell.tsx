import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { ReactNode, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { GraduationCap, LayoutDashboard, Users, Wallet, Settings, LogOut, Menu, X, User } from "lucide-react";
import { cn } from "@/lib/utils";

const adminNav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/students", label: "Students", icon: Users },
  { to: "/collect", label: "Collect Fee", icon: Wallet },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

const studentNav = [
  { to: "/me", label: "My Profile", icon: User },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const nav = role === "student" ? studentNav : adminNav;
  const subtitle = role === "student" ? "Student portal" : "Admin console";

  async function logout() {
    await supabase.auth.signOut();
    navigate({ to: "/login", replace: true });
  }

  return (
    <div className="min-h-screen bg-secondary/30">
      <header className="lg:hidden sticky top-0 z-40 flex items-center justify-between border-b bg-background px-4 h-14">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center">
            <GraduationCap className="h-5 w-5" />
          </div>
          <span className="font-semibold">Fee Manager</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label={open ? "Close navigation menu" : "Open navigation menu"}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
        </Button>
      </header>

      <div className="lg:flex">
        <aside
          className={cn(
            "lg:sticky lg:top-0 lg:h-screen lg:w-64 lg:flex-shrink-0 bg-background border-r",
            "lg:block",
            open ? "block" : "hidden"
          )}
        >
          <div className="hidden lg:flex items-center gap-2 px-5 h-16 border-b">
            <div className="h-9 w-9 rounded-lg bg-primary text-primary-foreground flex items-center justify-center">
              <GraduationCap className="h-5 w-5" />
            </div>
            <div>
              <div className="font-semibold leading-tight">Fee Manager</div>
              <div className="text-xs text-muted-foreground">{subtitle}</div>
            </div>
          </div>
          <nav className="p-3 space-y-1">
            {nav.map((item) => {
              const active = pathname.startsWith(item.to);
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-foreground hover:bg-accent"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="p-3 border-t mt-auto">
            <div className="px-3 py-2 text-xs text-muted-foreground truncate">
              {user?.email}
            </div>
            <Button variant="ghost" className="w-full justify-start gap-2" onClick={logout}>
              <LogOut className="h-4 w-4" /> Sign out
            </Button>
          </div>
        </aside>

        <main className="flex-1 min-w-0 p-4 md:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}

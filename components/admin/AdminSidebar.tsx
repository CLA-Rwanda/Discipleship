"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  BookOpen,
  GraduationCap,
  FileText,
  Shield,
  Settings,
  LogOut,
  ChevronRight,
  BarChart2,
  ClipboardList,
  Target,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase";
import { CLALogo } from "@/components/ui/CLALogo";

const NAV_ITEMS = [
  { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/classes", label: "Classes", icon: BookOpen },
  { href: "/admin/members", label: "Members", icon: Users },
  { href: "/admin/attendance", label: "Attendance", icon: ClipboardList },
  { href: "/admin/missions", label: "Missions", icon: Target },
  { href: "/admin/facilitators", label: "Facilitators", icon: GraduationCap },
  { href: "/admin/resources/manage", label: "Resources", icon: FileText },
  { href: "/admin/reports", label: "Reports", icon: BarChart2 },
  { href: "/admin/access", label: "Access Control", icon: Shield },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

export function AdminSidebar({ onClose }: { onClose?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/admin/login");
  }

  return (
    <aside className="admin-sidebar w-64 flex flex-col shrink-0">
      {/* Logo */}
      <div
        className="px-5 py-4 flex items-center justify-between"
        style={{ borderBottom: "1px solid rgba(228,148,12,0.1)" }}
      >
        <CLALogo layout="inline" size="sm" />
        {onClose && (
          <button
            onClick={onClose}
            className="lg:hidden p-1.5 rounded-lg"
            style={{ color: "rgba(248,240,230,0.5)" }}
            aria-label="Close menu"
          >
            <X size={20} />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 p-4 flex flex-col gap-1">
        {NAV_ITEMS.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/admin/dashboard" &&
              pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-all group"
              style={{
                fontFamily: "Barlow Condensed, sans-serif",
                fontSize: "0.95rem",
                background: isActive
                  ? "rgba(228,148,12,0.12)"
                  : "transparent",
                color: isActive
                  ? "var(--cla-amber-light)"
                  : "rgba(248,240,230,0.6)",
                borderLeft: isActive
                  ? "2px solid var(--cla-amber)"
                  : "2px solid transparent",
              }}
            >
              <item.icon
                size={18}
                style={{
                  color: isActive
                    ? "var(--cla-amber)"
                    : "rgba(248,240,230,0.4)",
                }}
              />
              {item.label}
              {isActive && (
                <ChevronRight
                  size={14}
                  className="ml-auto"
                  style={{ color: "var(--cla-amber)" }}
                />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Sign out */}
      <div className="p-4" style={{ borderTop: "1px solid rgba(228,148,12,0.1)" }}>
        <button
          onClick={handleSignOut}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-semibold transition-all"
          style={{
            fontFamily: "Barlow Condensed, sans-serif",
            color: "rgba(248,240,230,0.45)",
          }}
        >
          <LogOut size={18} />
          Sign Out
        </button>
      </div>
    </aside>
  );
}

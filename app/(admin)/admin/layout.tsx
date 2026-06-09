"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { CLALogo } from "@/components/ui/CLALogo";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Close sidebar on route change (mobile nav)
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  const isLoginPage = pathname === "/admin/login";
  const isSetupPage = pathname === "/admin/setup-password";

  if (isLoginPage || isSetupPage) {
    return (
      <div className="min-h-dvh" style={{ background: "var(--cla-bg-dark)" }}>
        {children}
      </div>
    );
  }

  return (
    <div className="flex h-dvh overflow-hidden" style={{ background: "var(--cla-bg-dark)" }}>
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 lg:hidden"
          style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(2px)" }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar — fixed overlay on mobile, pinned column on desktop */}
      <div
        className={`fixed inset-y-0 left-0 z-30 lg:relative lg:flex-none transition-transform duration-200 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        <AdminSidebar onClose={() => setSidebarOpen(false)} />
      </div>

      {/* Main content — fills remaining width, clips its own overflow */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile top bar — pinned by being outside the scrollable <main> */}
        <div
          className="lg:hidden flex items-center gap-3 px-4 py-3 shrink-0 z-10"
          style={{
            background: "#190606",
            borderBottom: "1px solid rgba(228,148,12,0.12)",
          }}
        >
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-1.5 rounded-lg"
            style={{ color: "rgba(248,240,230,0.7)" }}
            aria-label="Open menu"
          >
            <Menu size={22} />
          </button>
          <CLALogo layout="inline" size="sm" />
        </div>

        <main className="flex-1 overflow-y-auto p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}

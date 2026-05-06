"use client";

import { usePathname } from "next/navigation";
import { AdminSidebar } from "@/components/admin/AdminSidebar";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
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
    <div className="flex min-h-dvh" style={{ background: "var(--cla-bg-dark)" }}>
      <AdminSidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <main className="flex-1 p-6 overflow-auto">{children}</main>
      </div>
    </div>
  );
}

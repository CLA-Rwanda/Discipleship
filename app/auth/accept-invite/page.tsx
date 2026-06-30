"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { CLALogo } from "@/components/ui/CLALogo";

export default function AcceptInvitePage() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    // The Supabase browser SDK automatically reads hash tokens from the URL
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        router.replace("/admin/setup-password");
      } else {
        router.replace("/admin/login?error=invite_expired");
      }
    });
  }, [router]);

  return (
    <div
      className="min-h-dvh flex flex-col items-center justify-center gap-6"
      style={{ background: "var(--cla-bg-dark)" }}
    >
      <CLALogo size="md" />
      <p className="text-sm" style={{ color: "rgba(248,240,230,0.5)" }}>
        Setting up your account…
      </p>
    </div>
  );
}

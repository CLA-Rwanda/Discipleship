"use server";

import { createAdminClient } from "@/lib/supabase-admin";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { ADMIN_EMAIL } from "@/lib/config";

/** Returns the current user if they are super_admin (by email) or admin (by role). Throws otherwise. */
export async function assertFullAdmin() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  if (user.email === ADMIN_EMAIL) return user;

  const adminClient = createAdminClient();
  const { data: roleRow } = await adminClient
    .from("admin_roles")
    .select("role")
    .eq("user_id", user.id)
    .single();

  if (!roleRow || !["super_admin", "admin"].includes(roleRow.role)) {
    throw new Error("This action requires admin access.");
  }
  return user;
}

/** Server action — returns the current user's role, or null if unauthenticated. */
export async function getMyRole(): Promise<{ email: string; role: string; isFullAdmin: boolean } | null> {
  try {
    const supabase = createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    if (user.email === ADMIN_EMAIL) {
      return { email: user.email, role: "super_admin", isFullAdmin: true };
    }

    const adminClient = createAdminClient();
    const { data: roleRow } = await adminClient
      .from("admin_roles")
      .select("role")
      .eq("user_id", user.id)
      .single();

    if (!roleRow) return null;
    return {
      email: user.email ?? "",
      role: roleRow.role,
      isFullAdmin: ["super_admin", "admin"].includes(roleRow.role),
    };
  } catch {
    return null;
  }
}

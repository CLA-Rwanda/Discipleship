"use server";

import { createAdminClient } from "@/lib/supabase-admin";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { ADMIN_EMAIL } from "@/lib/config";
import type { AdminRole } from "@/lib/types";

// Verify the current session user is the super admin
async function assertSuperAdmin() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.email !== ADMIN_EMAIL) {
    throw new Error("Unauthorized: only the super admin can perform this action.");
  }
  return user;
}

export async function inviteAdminUser(
  email: string,
  role: AdminRole
): Promise<{ success: boolean; error?: string }> {
  try {
    await assertSuperAdmin();

    if (role === "super_admin") {
      return { success: false, error: "Cannot invite another super admin." };
    }

    const adminClient = createAdminClient();

    // Send invite email — Supabase creates the user and emails them a magic link.
    // We pass the role in user metadata so the DB trigger auto-assigns it.
    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
    const { data, error } = await adminClient.auth.admin.inviteUserByEmail(email, {
      data: { invited_role: role },
      redirectTo: `${siteUrl}/auth/callback?type=invite`,
    });

    if (error) {
      // If user already exists, just upsert their role
      if (error.message.includes("already been registered")) {
        const { data: { users } } = await adminClient.auth.admin.listUsers();
        const found = (users ?? []).find((u: any) => u.email === email);
        if (found) {
          await adminClient.from("admin_roles").upsert(
            { user_id: found.id, role },
            { onConflict: "user_id" }
          );
          return { success: true };
        }
      }
      return { success: false, error: error.message };
    }

    // Also explicitly insert into admin_roles (belt + trigger)
    if (data?.user) {
      await adminClient.from("admin_roles").upsert(
        { user_id: data.user.id, role },
        { onConflict: "user_id" }
      );
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function revokeAdminUser(
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await assertSuperAdmin();

    const adminClient = createAdminClient();

    // The DB trigger will throw if role = 'super_admin' — this is the DB-level guard.
    const { error } = await adminClient
      .from("admin_roles")
      .delete()
      .eq("user_id", userId);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export interface AdminUserRow {
  id: string;
  email: string;
  role: AdminRole;
  granted_at: string;
  isSuperAdmin: boolean;
  status: "active" | "invited";
}

export async function listAdminUsers(): Promise<AdminUserRow[]> {
  try {
    await assertSuperAdmin();

    const adminClient = createAdminClient();

    const [{ data: roles }, { data: { users } }] = await Promise.all([
      adminClient.from("admin_roles").select("user_id, role, granted_at").order("granted_at"),
      adminClient.auth.admin.listUsers(),
    ]);

    return (roles ?? []).map((r: any) => {
      const user = (users ?? []).find((u: any) => u.id === r.user_id);
      return {
        id: r.user_id,
        email: user?.email ?? "(unknown)",
        role: r.role,
        granted_at: r.granted_at,
        isSuperAdmin: r.role === "super_admin",
        status: user?.email_confirmed_at ? "active" : "invited",
      };
    });
  } catch {
    return [];
  }
}

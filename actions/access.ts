"use server";

import { createAdminClient } from "@/lib/supabase-admin";
import { getSiteUrl } from "@/lib/config";
import { getTransporter, FROM_EMAIL } from "@/lib/email";
import { assertFullAdmin } from "@/lib/assert-admin";
import type { AdminRole } from "@/lib/types";

export async function inviteAdminUser(
  email: string,
  role: AdminRole
): Promise<{ success: boolean; error?: string }> {
  try {
    await assertFullAdmin();

    if (role === "super_admin") {
      return { success: false, error: "Cannot invite another super admin." };
    }

    const adminClient = createAdminClient();

    // Generate the invite link ourselves so we can send it via our own SMTP
    const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
      type: "invite",
      email,
      options: {
        redirectTo: `${getSiteUrl()}/auth/accept-invite`,
        data: { invited_role: role },
      },
    });

    if (linkError) {
      if (linkError.message.includes("already been registered")) {
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
      return { success: false, error: linkError.message };
    }

    const tokenHash = linkData?.properties?.hashed_token;
    if (!tokenHash) return { success: false, error: "Failed to generate invite link." };

    // Build our own confirm URL — server handles verifyOtp, no PKCE mismatch
    const inviteUrl = `${getSiteUrl()}/auth/confirm?token_hash=${encodeURIComponent(tokenHash)}&type=invite`;

    // Fallback URL on Netlify, using the same token, in case the primary host fails to load
    const fallbackInviteUrl = `https://discipleship-alpha.netlify.app/auth/confirm?token_hash=${encodeURIComponent(tokenHash)}&type=invite`;

    // Upsert admin_roles
    if (linkData?.user) {
      await adminClient.from("admin_roles").upsert(
        { user_id: linkData.user.id, role },
        { onConflict: "user_id" }
      );
    }

    // Send the invite email ourselves via Gmail SMTP
    const roleLabel = role === "admin" ? "Admin" : "Facilitator";
    await getTransporter().sendMail({
      from: FROM_EMAIL,
      to: email,
      subject: "You've been invited to CLA Discipleship Console",
      html: `<!DOCTYPE html><html><body style="margin:0;padding:32px 16px;background:#0f0202;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;">
<tr><td style="background:#1A0505;border:1px solid rgba(212,134,10,0.2);border-radius:12px;padding:36px 32px;text-align:center;">
  <p style="margin:0 0 4px;font-family:Arial,sans-serif;font-size:11px;letter-spacing:0.2em;color:rgba(212,134,10,0.7);text-transform:uppercase;">Christian Life Assembly</p>
  <h1 style="margin:0 0 24px;font-size:22px;font-weight:800;color:#FFFFFF;">You've been invited</h1>
  <p style="margin:0 0 8px;font-size:14px;color:rgba(232,224,216,0.75);">You've been granted <strong style="color:#F0A500;">${roleLabel}</strong> access to the CLA Discipleship Management Console.</p>
  <p style="margin:0 0 28px;font-size:13px;color:rgba(232,224,216,0.45);">Click the button below to set up your password and get started.</p>
  <a href="${inviteUrl}" style="display:inline-block;padding:14px 32px;background:#D4860A;color:#1A0505;font-weight:800;font-size:15px;text-decoration:none;border-radius:8px;">Accept Invitation</a>
  <a href="${inviteUrl}" style="display:inline-block;padding:14px 32px;background:#D4860A;color:#1A0505;font-weight:800;font-size:15px;text-decoration:none;border-radius:8px;">Accept Invitation</a>
<p style="margin:16px 0 0;font-size:12px;color:rgba(232,224,216,0.4);">Having trouble with the button? <a href="${fallbackInviteUrl}" style="color:#F0A500;">Try this alternate link instead</a>.</p>
  <p style="margin:24px 0 0;font-size:11px;color:rgba(232,224,216,0.3);">This link expires in 24 hours. If you did not expect this invitation, you can ignore this email.</p>
</td></tr>
</table>
</body></html>`,
    });

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function revokeAdminUser(
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await assertFullAdmin();

    const adminClient = createAdminClient();

    const { error: roleError } = await adminClient
      .from("admin_roles")
      .delete()
      .eq("user_id", userId);

    if (roleError) {
      return { success: false, error: roleError.message };
    }

    // Best-effort: delete the auth user so they don't linger in Supabase
    // Not blocking — access is already revoked by removing the admin_roles row
    await adminClient.auth.admin.deleteUser(userId).catch(() => null);

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
    await assertFullAdmin();

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

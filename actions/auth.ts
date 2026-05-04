"use server";

import { createServerSupabaseClient } from "@/lib/supabase-server";
import { ADMIN_EMAIL } from "@/lib/config";

export async function changeAdminPassword(
  currentPassword: string,
  newPassword: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = createServerSupabaseClient();

  // Verify the current session belongs to the admin email
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.email !== ADMIN_EMAIL) {
    return { success: false, error: "Unauthorized." };
  }

  // Re-authenticate with the current password to verify before overwriting
  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email: ADMIN_EMAIL,
    password: currentPassword,
  });

  if (verifyError) {
    return { success: false, error: "Current password is incorrect." };
  }

  // Overwrite — old hash is gone from Supabase Auth after this call
  const { error: updateError } = await supabase.auth.updateUser({
    password: newPassword,
  });

  if (updateError) {
    return { success: false, error: updateError.message };
  }

  return { success: true };
}

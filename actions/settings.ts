"use server";

import { createAdminClient } from "@/lib/supabase-admin";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getAppSettings, type AppSettings } from "@/lib/settings";

export { getAppSettings, type AppSettings };

export async function updateAppSetting(
  key: string,
  value: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Unauthorized" };

  const admin = createAdminClient();
  const { error } = await admin
    .from("app_settings")
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });

  if (error) return { success: false, error: error.message };
  return { success: true };
}

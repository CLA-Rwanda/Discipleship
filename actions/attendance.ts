"use server";

import { createServerSupabaseClient } from "@/lib/supabase-server";
import type { Slot } from "@/lib/types";

export async function logAttendance(formData: {
  member_name: string;
  phone: string;
  service_slot: Slot;
}): Promise<{ success: boolean; error?: string }> {
  const supabase = createServerSupabaseClient();

  const { error } = await supabase.from("attendance").insert({
    member_name: formData.member_name,
    phone: formData.phone,
    service_slot: formData.service_slot,
    attended_at: new Date().toISOString(),
  });

  if (error) return { success: false, error: error.message };
  return { success: true };
}

"use server";

import { createAdminClient } from "@/lib/supabase-admin";

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  member?: {
    full_name: string;
    class_name?: string;
    slot?: string;
  };
}

export async function checkPhoneDuplicate(
  phone: string
): Promise<DuplicateCheckResult> {
  if (!phone || phone.trim().length < 7) {
    return { isDuplicate: false };
  }

  const supabase = createAdminClient();

  const { data } = await supabase
    .from("members")
    .select(
      `
      full_name,
      preferred_slot,
      classes(name)
    `
    )
    .eq("phone", phone.trim())
    .maybeSingle();

  if (!data) return { isDuplicate: false };

  return {
    isDuplicate: true,
    member: {
      full_name: data.full_name,
      class_name: (data.classes as any)?.name,
      slot: data.preferred_slot,
    },
  };
}

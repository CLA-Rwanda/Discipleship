"use server";

import { createAdminClient } from "@/lib/supabase-admin";

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  member?: {
    first_name: string;
    last_name: string;
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
    .select("first_name, last_name, preferred_slot, classes(name)")
    .eq("phone", phone.trim())
    .maybeSingle();

  if (!data) return { isDuplicate: false };

  return {
    isDuplicate: true,
    member: {
      first_name: data.first_name,
      last_name:  data.last_name,
      class_name: (data.classes as any)?.name,
      slot:       data.preferred_slot,
    },
  };
}

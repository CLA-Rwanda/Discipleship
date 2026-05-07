"use server";

import { createAdminClient } from "@/lib/supabase-admin";
import type { Slot } from "@/lib/types";

export interface ClassForAttendance {
  id: string;
  name: string;
  slot: Slot;
  facilitator_name: string | null;
}

export async function getClassesForAttendance(): Promise<ClassForAttendance[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("classes")
    .select("id, name, slot, facilitators(full_name)")
    .eq("is_active", true)
    .not("facilitator_id", "is", null)
    .order("name");

  return (data ?? []).map((c: any) => ({
    id: c.id,
    name: c.name,
    slot: c.slot,
    facilitator_name: c.facilitators?.full_name ?? null,
  }));
}

export async function logAttendance(formData: {
  member_name: string;
  class_id: string;
}): Promise<{ success: boolean; slot?: Slot; class_name?: string; error?: string }> {
  const admin = createAdminClient();

  const { data: cls, error: clsErr } = await admin
    .from("classes")
    .select("id, name, slot")
    .eq("id", formData.class_id)
    .single();

  if (clsErr || !cls) {
    return { success: false, error: "Class not found." };
  }

  // Auto-link to a registered member in that class by exact name (case-insensitive)
  const { data: memberMatch } = await admin
    .from("members")
    .select("id")
    .eq("class_id", formData.class_id)
    .ilike("full_name", formData.member_name.trim())
    .maybeSingle();

  const { error } = await admin.from("attendance").insert({
    member_name: formData.member_name.trim(),
    class_id: formData.class_id,
    service_slot: cls.slot,
    attended_at: new Date().toISOString(),
    member_id: memberMatch?.id ?? null,
  });

  if (error) return { success: false, error: error.message };
  return { success: true, slot: cls.slot, class_name: cls.name };
}

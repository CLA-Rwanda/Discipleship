"use server";

import { createAdminClient } from "@/lib/supabase-admin";
import { isFormLocked } from "@/actions/time-lock";

export interface AdminAttendanceRow {
  id: string;
  member_name: string;
  service_slot: string;
  attended_at: string;
  class_name: string | null;
  facilitator_name: string | null;
  is_linked: boolean;
}

export async function getAllAttendanceForAdmin(): Promise<AdminAttendanceRow[]> {
  const admin = createAdminClient();
  const PAGE = 1000;
  const all: any[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await admin
      .from("attendance")
      .select("id, member_name, service_slot, attended_at, member_id, classes(name, facilitators(full_name))")
      .order("attended_at", { ascending: false })
      .range(from, from + PAGE - 1);

    if (error || !data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }

  return all.map((r: any) => ({
    id:               r.id,
    member_name:      r.member_name,
    service_slot:     r.service_slot,
    attended_at:      r.attended_at,
    class_name:       r.classes?.name ?? null,
    facilitator_name: r.classes?.facilitators?.full_name ?? null,
    is_linked:        !!r.member_id,
  }));
}

export interface ClassForAttendance {
  id: string;
  name: string;
  slot: string;
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
    id:               c.id,
    name:             c.name,
    slot:             c.slot,
    facilitator_name: c.facilitators?.full_name ?? null,
  }));
}

export async function getDistinctSlots(): Promise<string[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("classes")
    .select("slot")
    .eq("is_active", true);

  const slots = Array.from(new Set((data ?? []).map((c: any) => c.slot as string))).sort();
  return slots;
}

export type AttendanceSubmitResult =
  | { success: true; slot: string; class_name: string; linked: boolean }
  | { success: false; error: string }
  | { needsSuggestion: true; suggestion: string; matchType: "reversed" };

export async function logAttendance(formData: {
  first_name: string;
  last_name: string;
}): Promise<AttendanceSubmitResult> {
  const { locked } = await isFormLocked();
  if (locked) {
    return { success: false, error: "Thank you for attending. Registration  is only active during class time." };
  }

  const admin = createAdminClient();
  const fn = formData.first_name.trim();
  const ln = formData.last_name.trim();

  // Exact case-insensitive match
  const { data: exact } = await admin
    .from("members")
    .select("id, class_id, classes(name, slot)")
    .ilike("first_name", fn)
    .ilike("last_name", ln)
    .limit(2);

  if (exact && exact.length >= 1) {
    const member = exact[0] as any;
    const cls = member.classes;
    const { error } = await admin.from("attendance").insert({
      member_name:  `${fn} ${ln}`,
      class_id:     member.class_id,
      service_slot: cls.slot,
      attended_at:  new Date().toISOString(),
      member_id:    member.id,
    });
    if (error) return { success: false, error: error.message };
    return { success: true, slot: cls.slot, class_name: cls.name, linked: true };
  }

  // Try reversed name order
  const { data: reversed } = await admin
    .from("members")
    .select("id, first_name, last_name")
    .ilike("first_name", ln)
    .ilike("last_name", fn)
    .limit(1);

  if (reversed && reversed.length > 0) {
    const m = reversed[0] as any;
    return {
      needsSuggestion: true,
      suggestion: `${m.first_name} ${m.last_name}`,
      matchType: "reversed",
    };
  }

  return {
    success: false,
    error: "Your name was not found. Make sure you are registered and enter your name exactly as you registered.",
  };
}

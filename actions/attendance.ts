"use server";

import { createAdminClient } from "@/lib/supabase-admin";

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

  const slots = [...new Set((data ?? []).map((c: any) => c.slot as string))].sort();
  return slots;
}

export type AttendanceNameMatch =
  | { match_type: "exact"; member_id: string }
  | { match_type: "reversed" | "fuzzy"; suggestion: string }
  | { match_type: "none" };

export type AttendanceSubmitResult =
  | { success: true; slot: string; class_name: string; linked: boolean }
  | { success: false; error: string }
  | { needsSuggestion: true; suggestion: string; matchType: "reversed" | "fuzzy" };

export async function logAttendance(formData: {
  first_name: string;
  last_name: string;
  phone: string;
  class_id: string;
  forceAnonymous?: boolean;
}): Promise<AttendanceSubmitResult> {
  const admin = createAdminClient();

  const { data: cls, error: clsErr } = await admin
    .from("classes")
    .select("id, name, slot")
    .eq("id", formData.class_id)
    .single();

  if (clsErr || !cls) return { success: false, error: "Class not found." };

  const memberName = `${formData.first_name.trim()} ${formData.last_name.trim()}`;
  let memberId: string | null = null;

  if (!formData.forceAnonymous) {
    const { data: matchResult, error: matchErr } = await admin.rpc("match_attendance_name", {
      p_first_name: formData.first_name.trim(),
      p_last_name:  formData.last_name.trim(),
      p_class_id:   formData.class_id,
    });

    if (!matchErr && matchResult) {
      const match = matchResult as AttendanceNameMatch;

      if (match.match_type === "exact") {
        memberId = match.member_id;
      } else if (match.match_type === "reversed" || match.match_type === "fuzzy") {
        return {
          needsSuggestion: true,
          suggestion: match.suggestion,
          matchType: match.match_type,
        };
      }
      // match_type === 'none' → anonymous, memberId stays null
    }
  }

  const { error } = await admin.from("attendance").insert({
    member_name:  memberName,
    phone:        formData.phone.trim() || null,
    class_id:     formData.class_id,
    service_slot: cls.slot,
    attended_at:  new Date().toISOString(),
    member_id:    memberId,
  });

  if (error) return { success: false, error: error.message };
  return { success: true, slot: cls.slot, class_name: cls.name, linked: !!memberId };
}

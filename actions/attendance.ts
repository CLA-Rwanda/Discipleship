"use server";

import { createAdminClient } from "@/lib/supabase-admin";
import { isFormLocked } from "@/actions/time-lock";
import { snapToSunday } from "@/lib/dates";

export interface AdminAttendanceRow {
  id: string;
  member_name: string;
  service_slot: string;
  attended_at: string;
  class_id: string | null;
  class_name: string | null;
  facilitator_name: string | null;
  member_id: string | null;
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
      .select("id, member_name, service_slot, attended_at, member_id, class_id, classes(name, facilitators(full_name))")
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
    class_id:         r.class_id ?? null,
    class_name:       r.classes?.name ?? null,
    facilitator_name: r.classes?.facilitators?.full_name ?? null,
    member_id:        r.member_id ?? null,
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
  | { needsSuggestion: true; suggestion: string; matchType: "reversed" }
  | { needsOtherName: true }
  | { alreadyMarked: true; slot: string; class_name: string; attended_at: string };

async function recordAttendance(
  admin: ReturnType<typeof createAdminClient>,
  member: { id: string; class_id: string; other_name?: string | null; classes: { name: string; slot: string } },
  fn: string,
  ln: string
): Promise<AttendanceSubmitResult> {
  const cls = member.classes;

  // Attendance is only ever meant to be recorded against a Sunday — snap the
  // submission time back to the Sunday of its own week (Sun = day 0), so a
  // late Mon–Sat submission still lands on the service it belongs to.
  const attendedAt = snapToSunday(new Date().toISOString());
  const sundayKey = attendedAt.slice(0, 10);

  // Same-Sunday guard: one check-in per member per service week, regardless
  // of which class it's under, and regardless of which day it was submitted.
  const { data: existing } = await admin
    .from("attendance")
    .select("attended_at, classes(name, slot)")
    .eq("member_id", member.id)
    .gte("attended_at", `${sundayKey}T00:00:00.000Z`)
    .lte("attended_at", `${sundayKey}T23:59:59.999Z`)
    .maybeSingle();

  if (existing) {
    const existingCls = (existing as any).classes;
    return {
      alreadyMarked: true,
      attended_at: existing.attended_at,
      slot:         existingCls?.slot ?? cls.slot,
      class_name:   existingCls?.name ?? cls.name,
    };
  }

  const on = (member.other_name ?? "").trim();
  const { error } = await admin.from("attendance").insert({
    member_name:  on ? `${fn} ${on} ${ln}` : `${fn} ${ln}`,
    class_id:     member.class_id,
    service_slot: cls.slot,
    attended_at:  attendedAt,
    member_id:    member.id,
  });
  if (error) return { success: false, error: error.message };
  return { success: true, slot: cls.slot, class_name: cls.name, linked: true };
}

export async function logAttendance(formData: {
  first_name: string;
  last_name: string;
  other_name?: string;
}): Promise<AttendanceSubmitResult> {
  const { locked } = await isFormLocked();
  if (locked) {
    return { success: false, error: "Thank you for attending. Registration  is only active during class time." };
  }

  const admin = createAdminClient();
  const fn = formData.first_name.trim();
  const ln = formData.last_name.trim();
  const on = (formData.other_name ?? "").trim();

  // Exact case-insensitive match on first + last name
  const { data: exact } = await admin
    .from("members")
    .select("id, class_id, other_name, classes(name, slot)")
    .ilike("first_name", fn)
    .ilike("last_name", ln);

  const matches = (exact ?? []) as any[];

  if (matches.length > 1) {
    // Multiple people share this exact name — disambiguate using the middle
    // name/nickname captured at registration.
    if (!on) {
      return { needsOtherName: true };
    }
    const disambiguated = matches.filter(
      (m) => (m.other_name ?? "").trim().toLowerCase() === on.toLowerCase()
    );
    if (disambiguated.length === 1) {
      return recordAttendance(admin, disambiguated[0], fn, ln);
    }
    return {
      success: false,
      error: "We couldn't match that middle name to anyone registered under this name. Please see your facilitator to record your attendance.",
    };
  }

  if (matches.length === 1) {
    return recordAttendance(admin, matches[0], fn, ln);
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

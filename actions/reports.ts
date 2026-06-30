"use server";

import { createAdminClient } from "@/lib/supabase-admin";
import { assertFullAdmin } from "@/lib/assert-admin";
import { getTransporter, FROM_EMAIL, buildReportEmail } from "@/lib/email";
import { getSundaysBetween } from "@/lib/dates";

async function assertAdmin() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  return user;
}

export interface ReportMember {
  name: string;
  sessions: boolean[];
  attendedCount: number;
  missedCount: number;
  flagged: boolean;
  currentConsecutiveMisses: number;
}

export interface ReportClass {
  name: string;
  slot: string;
  attendanceCount: number;
  uniqueMembers: number;
  sundays: string[];
  members: ReportMember[];
}

export interface ReportPreviewData {
  facilitatorId: string;
  facilitatorName: string;
  facilitatorEmail: string;
  dateFrom: string;
  dateTo: string;
  classes: ReportClass[];
  totalAttendance: number;
}

export async function getFacilitators(): Promise<
  { id: string; full_name: string; email: string | null }[]
> {
  await assertAdmin();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("facilitators")
    .select("id, full_name, email")
    .order("full_name");
  if (error) return [];
  return data ?? [];
}

export async function getReportPreview(
  facilitatorId: string,
  dateFrom: string,
  dateTo: string
): Promise<{ success: true; data: ReportPreviewData } | { success: false; error: string }> {
  try {
    await assertAdmin();
    const admin = createAdminClient();

    const { data: facilitator, error: fErr } = await admin
      .from("facilitators")
      .select("id, full_name, email")
      .eq("id", facilitatorId)
      .single();
    if (fErr || !facilitator) return { success: false, error: "Facilitator not found." };

    const { data: classes, error: cErr } = await admin
      .from("classes")
      .select("id, name, slot")
      .eq("facilitator_id", facilitatorId)
      .order("slot");
    if (cErr) return { success: false, error: cErr.message };
    if (!classes || classes.length === 0) return { success: false, error: "This facilitator has no classes assigned." };

    const classIds = classes.map((c) => c.id);
    const sundays  = getSundaysBetween(dateFrom, dateTo);

    // Get all members for those classes
    const { data: members } = await admin
      .from("members")
      .select("id, first_name, last_name, other_name, class_id")
      .in("class_id", classIds)
      .order("last_name");

    const memberIds = (members ?? []).map((m: any) => m.id);

    // Get attendance in date range
    const { data: attendance } = memberIds.length > 0
      ? await admin
          .from("attendance")
          .select("member_id, member_name, class_id, attended_at")
          .in("class_id", classIds)
          .gte("attended_at", `${dateFrom}T00:00:00.000Z`)
          .lte("attended_at", `${dateTo}T23:59:59.999Z`)
      : { data: [] };

    const attendedMap = new Map<string, Set<string>>();
    let totalAttendance = 0;
    for (const a of attendance ?? []) {
      if (!a.member_id) continue;
      if (!attendedMap.has(a.member_id)) attendedMap.set(a.member_id, new Set());
      attendedMap.get(a.member_id)!.add((a.attended_at as string).slice(0, 10));
      totalAttendance++;
    }

    const maxConsec = (sessions: boolean[]): number => {
      let max = 0, cur = 0;
      for (const s of sessions) { cur = s ? 0 : cur + 1; if (cur > max) max = cur; }
      return max;
    };
    const trailingMisses = (sessions: boolean[]): number => {
      let count = 0;
      for (let i = sessions.length - 1; i >= 0; i--) { if (!sessions[i]) count++; else break; }
      return count;
    };

    const reportClasses: ReportClass[] = classes.map((cls) => {
      const clsMembers: ReportMember[] = ((members ?? []) as any[])
        .filter((m) => m.class_id === cls.id)
        .map((m) => {
          const dates = attendedMap.get(m.id) ?? new Set<string>();
          const sessions = sundays.map((d) => dates.has(d));
          const mc = maxConsec(sessions);
          const tm = trailingMisses(sessions);
          const name = [m.first_name, m.other_name, m.last_name].filter(Boolean).join(" ");
          return {
            name,
            sessions,
            attendedCount: sessions.filter(Boolean).length,
            missedCount:   sessions.filter((s) => !s).length,
            flagged: mc >= 3,
            currentConsecutiveMisses: tm,
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name));

      return {
        name: cls.name,
        slot: cls.slot,
        attendanceCount: clsMembers.reduce((s, m) => s + m.attendedCount, 0),
        uniqueMembers:   clsMembers.length,
        sundays,
        members: clsMembers,
      };
    });

    return {
      success: true,
      data: {
        facilitatorId,
        facilitatorName:  facilitator.full_name,
        facilitatorEmail: facilitator.email ?? "",
        dateFrom,
        dateTo,
        classes: reportClasses,
        totalAttendance,
      },
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function sendReport(
  preview: ReportPreviewData
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await assertAdmin();
    if (!preview.facilitatorEmail) {
      return { success: false, error: "This facilitator has no email address on file." };
    }

    const fmtLabel = (iso: string) =>
      new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

    const html = buildReportEmail({
      facilitatorName:  preview.facilitatorName,
      dateFrom:         fmtLabel(preview.dateFrom),
      dateTo:           fmtLabel(preview.dateTo),
      classes:          preview.classes,
      totalAttendance:  preview.totalAttendance,
    });

    await getTransporter().sendMail({
      from:    FROM_EMAIL,
      to:      preview.facilitatorEmail,
      subject: `CLA Discipleship Report — ${fmtLabel(preview.dateFrom)} to ${fmtLabel(preview.dateTo)}`,
      html,
    });

    const admin = createAdminClient();
    await admin.from("reports").insert({
      facilitator_id:    preview.facilitatorId,
      facilitator_name:  preview.facilitatorName,
      facilitator_email: preview.facilitatorEmail,
      date_from:         preview.dateFrom,
      date_to:           preview.dateTo,
      sent_by:           user.id,
      class_names:       preview.classes.map((c) => c.name),
      attendance_count:  preview.totalAttendance,
      report_html:       html,
      metadata:          { classes_count: preview.classes.length, sent_by_email: user.email },
    });

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export interface ReportHistoryRow {
  id: string;
  facilitator_name: string;
  facilitator_email: string;
  date_from: string;
  date_to: string;
  sent_at: string;
  class_names: string[];
  attendance_count: number;
  metadata: Record<string, any>;
}

export async function getReportHistory(): Promise<ReportHistoryRow[]> {
  try {
    await assertFullAdmin();

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("reports")
      .select("id, facilitator_name, facilitator_email, date_from, date_to, sent_at, class_names, attendance_count, metadata")
      .order("sent_at", { ascending: false })
      .limit(100);

    if (error) return [];
    return data ?? [];
  } catch {
    return [];
  }
}

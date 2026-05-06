"use server";

import { createAdminClient } from "@/lib/supabase-admin";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { ADMIN_EMAIL } from "@/lib/config";
import { getResend, FROM_EMAIL, buildReportEmail } from "@/lib/email";

async function assertAdmin() {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  return user;
}

export interface ReportClass {
  name: string;
  slot: string;
  attendanceCount: number;
  members: { name: string; attended_at: string }[];
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

    // Get facilitator info
    const { data: facilitator, error: fErr } = await admin
      .from("facilitators")
      .select("id, full_name, email")
      .eq("id", facilitatorId)
      .single();

    if (fErr || !facilitator) {
      return { success: false, error: "Facilitator not found." };
    }

    // Get classes assigned to this facilitator
    const { data: classes, error: cErr } = await admin
      .from("classes")
      .select("id, name, slot")
      .eq("facilitator_id", facilitatorId)
      .order("slot");

    if (cErr) return { success: false, error: cErr.message };
    if (!classes || classes.length === 0) {
      return { success: false, error: "This facilitator has no classes assigned." };
    }

    const classIds = classes.map((c) => c.id);

    // Get attendance records for those classes in the date range
    const { data: attendance, error: aErr } = await admin
      .from("attendance")
      .select("member_name, class_id, attended_at")
      .in("class_id", classIds)
      .gte("attended_at", `${dateFrom}T00:00:00.000Z`)
      .lte("attended_at", `${dateTo}T23:59:59.999Z`)
      .order("attended_at");

    if (aErr) return { success: false, error: aErr.message };

    const attendanceRows = attendance ?? [];

    const reportClasses: ReportClass[] = classes.map((cls) => {
      const clsAttendance = attendanceRows.filter((a) => a.class_id === cls.id);
      return {
        name: cls.name,
        slot: cls.slot,
        attendanceCount: clsAttendance.length,
        members: clsAttendance.map((a) => ({
          name: a.member_name,
          attended_at: a.attended_at,
        })),
      };
    });

    return {
      success: true,
      data: {
        facilitatorId,
        facilitatorName: facilitator.full_name,
        facilitatorEmail: facilitator.email ?? "",
        dateFrom,
        dateTo,
        classes: reportClasses,
        totalAttendance: attendanceRows.length,
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

    const dateFromLabel = new Date(preview.dateFrom).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    const dateToLabel = new Date(preview.dateTo).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    const html = buildReportEmail({
      facilitatorName: preview.facilitatorName,
      dateFrom: dateFromLabel,
      dateTo: dateToLabel,
      classes: preview.classes,
      totalAttendance: preview.totalAttendance,
    });

    // Send email via Resend
    const { error: emailError } = await getResend().emails.send({
      from: FROM_EMAIL,
      to: preview.facilitatorEmail,
      subject: `CLA Discipleship Report — ${dateFromLabel} to ${dateToLabel}`,
      html,
    });

    if (emailError) {
      return { success: false, error: (emailError as any).message ?? "Failed to send email." };
    }

    // Save snapshot to reports table (use admin client to bypass RLS on INSERT)
    const admin = createAdminClient();
    await admin.from("reports").insert({
      facilitator_id: preview.facilitatorId,
      facilitator_name: preview.facilitatorName,
      facilitator_email: preview.facilitatorEmail,
      date_from: preview.dateFrom,
      date_to: preview.dateTo,
      sent_by: user.id,
      class_names: preview.classes.map((c) => c.name),
      attendance_count: preview.totalAttendance,
      report_html: html,
      metadata: {
        classes_count: preview.classes.length,
        sent_by_email: user.email,
      },
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
    const supabase = createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || user.email !== ADMIN_EMAIL) return [];

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("reports")
      .select(
        "id, facilitator_name, facilitator_email, date_from, date_to, sent_at, class_names, attendance_count, metadata"
      )
      .order("sent_at", { ascending: false })
      .limit(100);

    if (error) return [];
    return data ?? [];
  } catch {
    return [];
  }
}

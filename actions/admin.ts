"use server";

import { createAdminClient } from "@/lib/supabase-admin";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { ADMIN_EMAIL } from "@/lib/config";

async function assertAdmin() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  return user;
}

async function assertSuperAdmin() {
  const user = await assertAdmin();
  if (user.email !== ADMIN_EMAIL) throw new Error("This action requires super admin access.");
  return user;
}

export async function deleteMember(
  id: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await assertAdmin();
    const admin = createAdminClient();
    // Preserve attendance history but unlink from deleted member
    await admin.from("attendance").update({ member_id: null }).eq("member_id", id);
    const { error } = await admin.from("members").delete().eq("id", id);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function deleteClass(
  id: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await assertAdmin();
    const admin = createAdminClient();
    // Unassign members before deleting the class
    await admin.from("members").update({ class_id: null }).eq("class_id", id);
    const { error } = await admin.from("classes").delete().eq("id", id);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function deleteFacilitator(
  id: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await assertAdmin();
    const admin = createAdminClient();
    // Unassign classes before deleting the facilitator
    await admin.from("classes").update({ facilitator_id: null }).eq("facilitator_id", id);
    const { error } = await admin.from("facilitators").delete().eq("id", id);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ── Attendance record actions ────────────────────────────────────────────────

export async function updateAttendanceName(
  id: string,
  newName: string
): Promise<{ success: boolean; error?: string }> {
  await assertAdmin();
  const admin = createAdminClient();
  const { error } = await admin
    .from("attendance")
    .update({ member_name: newName.trim() })
    .eq("id", id);
  return error ? { success: false, error: error.message } : { success: true };
}

export async function deleteAttendanceRecord(
  id: string
): Promise<{ success: boolean; error?: string }> {
  await assertAdmin();
  const admin = createAdminClient();
  const { error } = await admin.from("attendance").delete().eq("id", id);
  return error ? { success: false, error: error.message } : { success: true };
}

function normName(s: string) {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

export async function renameAttendancePerson(
  normKey: string,
  newName: string
): Promise<{ success: boolean; error?: string }> {
  await assertAdmin();
  const admin = createAdminClient();
  // Fetch all ids matching this normalised name key
  const { data, error: fetchErr } = await admin
    .from("attendance")
    .select("id, member_name");
  if (fetchErr) return { success: false, error: fetchErr.message };
  const ids = (data ?? [])
    .filter((r: any) => normName(r.member_name) === normKey)
    .map((r: any) => r.id);
  if (ids.length === 0) return { success: true };
  const { error } = await admin
    .from("attendance")
    .update({ member_name: newName.trim() })
    .in("id", ids);
  return error ? { success: false, error: error.message } : { success: true };
}

export async function deleteAttendancePerson(
  normKey: string
): Promise<{ success: boolean; error?: string }> {
  await assertAdmin();
  const admin = createAdminClient();
  const { data, error: fetchErr } = await admin
    .from("attendance")
    .select("id, member_name");
  if (fetchErr) return { success: false, error: fetchErr.message };
  const ids = (data ?? [])
    .filter((r: any) => normName(r.member_name) === normKey)
    .map((r: any) => r.id);
  if (ids.length === 0) return { success: true };
  const { error } = await admin
    .from("attendance")
    .delete()
    .in("id", ids);
  return error ? { success: false, error: error.message } : { success: true };
}

export async function eraseAllData(): Promise<{ success: boolean; error?: string }> {
  try {
    await assertSuperAdmin();
    const admin = createAdminClient();
    const { error: attErr } = await admin
      .from("attendance")
      .delete()
      .not("id", "is", null);
    if (attErr) return { success: false, error: `Attendance: ${attErr.message}` };
    const { error: memErr } = await admin
      .from("members")
      .delete()
      .not("id", "is", null);
    if (memErr) return { success: false, error: `Members: ${memErr.message}` };
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

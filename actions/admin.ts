"use server";

import { createAdminClient } from "@/lib/supabase-admin";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { assertFullAdmin } from "@/lib/assert-admin";

async function assertAdmin() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  return user;
}

export async function updateMember(
  id: string,
  fields: {
    first_name: string;
    last_name: string;
    other_name?: string;
    phone: string;
    email?: string;
    preferred_slot: string;
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    await assertAdmin();
    const admin = createAdminClient();
    const { error } = await admin
      .from("members")
      .update({
        first_name:     fields.first_name.trim(),
        last_name:      fields.last_name.trim(),
        other_name:     fields.other_name?.trim() || null,
        phone:          fields.phone.trim(),
        email:          fields.email?.trim() || null,
        preferred_slot: fields.preferred_slot,
      })
      .eq("id", id);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
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
    await admin.from("members").update({ class_id: null }).eq("class_id", id);
    const { error } = await admin.from("classes").delete().eq("id", id);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function bulkDeleteClasses(
  ids: string[]
): Promise<{ success: boolean; error?: string }> {
  if (ids.length === 0) return { success: true };
  try {
    await assertAdmin();
    const admin = createAdminClient();
    await admin.from("members").update({ class_id: null }).in("class_id", ids);
    const { error } = await admin.from("classes").delete().in("id", ids);
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
    await admin.from("classes").update({ facilitator_id: null }).eq("facilitator_id", id);
    const { error } = await admin.from("facilitators").delete().eq("id", id);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function bulkDeleteFacilitators(
  ids: string[]
): Promise<{ success: boolean; error?: string }> {
  if (ids.length === 0) return { success: true };
  try {
    await assertAdmin();
    const admin = createAdminClient();
    await admin.from("classes").update({ facilitator_id: null }).in("facilitator_id", ids);
    const { error } = await admin.from("facilitators").delete().in("id", ids);
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
    await assertFullAdmin();
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

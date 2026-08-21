"use server";

import { randomUUID } from "crypto";
import { createAdminClient } from "@/lib/supabase-admin";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { assertFullAdmin } from "@/lib/assert-admin";

type AdminClient = ReturnType<typeof createAdminClient>;

async function assertAdmin() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  return user;
}

async function logAdminAction(actorEmail: string | null | undefined, action: string, details: unknown) {
  const admin = createAdminClient();
  await admin.from("admin_audit_log").insert({ actor_email: actorEmail ?? null, action, details });
}

export interface AuditLogEntry {
  id: string;
  actor_email: string | null;
  action: string;
  details: unknown;
  created_at: string;
}

export async function getAuditLog(limit = 50): Promise<AuditLogEntry[]> {
  await assertAdmin();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("admin_audit_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return [];
  return data as AuditLogEntry[];
}

// ── Recycle bin ────────────────────────────────────────────────────────────

const TRASH_RETENTION_DAYS = 15;

export interface TrashEntry {
  id: string;
  batch_id: string;
  table_name: "members" | "facilitators" | "classes" | "attendance";
  record_id: string;
  data: any;
  related: any;
  deleted_by: string | null;
  action: string;
  deleted_at: string;
  expires_at: string;
}

function buildTrashRow(
  batchId: string,
  tableName: TrashEntry["table_name"],
  recordId: string,
  data: unknown,
  related: unknown,
  actorEmail: string | null | undefined,
  action: string
) {
  return {
    batch_id: batchId,
    table_name: tableName,
    record_id: recordId,
    data,
    related: related ?? null,
    deleted_by: actorEmail ?? null,
    action,
    expires_at: new Date(Date.now() + TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString(),
  };
}

async function insertTrashRows(admin: AdminClient, rows: ReturnType<typeof buildTrashRow>[]) {
  if (rows.length === 0) return;
  await admin.from("trash").insert(rows);
}

export async function getTrash(): Promise<TrashEntry[]> {
  await assertAdmin();
  const admin = createAdminClient();
  // Opportunistically purge anything past its 15-day retention window.
  await admin.from("trash").delete().lt("expires_at", new Date().toISOString());
  const { data, error } = await admin
    .from("trash")
    .select("*")
    .is("restored_at", null)
    .order("deleted_at", { ascending: false });
  if (error) return [];
  return data as TrashEntry[];
}

async function restoreOne(admin: AdminClient, entry: TrashEntry): Promise<{ success: boolean; error?: string }> {
  const { error: insertErr } = await admin.from(entry.table_name).insert(entry.data);
  if (insertErr) return { success: false, error: insertErr.message };

  const related = entry.related ?? {};
  if (entry.table_name === "members" && related.attendance_ids?.length) {
    await admin.from("attendance").update({ member_id: entry.record_id }).in("id", related.attendance_ids).is("member_id", null);
  }
  if (entry.table_name === "facilitators" && related.class_ids?.length) {
    await admin.from("classes").update({ facilitator_id: entry.record_id }).in("id", related.class_ids).is("facilitator_id", null);
  }
  if (entry.table_name === "classes") {
    if (related.member_ids?.length) {
      await admin.from("members").update({ class_id: entry.record_id }).in("id", related.member_ids).is("class_id", null);
    }
    if (related.attendance_ids?.length) {
      await admin.from("attendance").update({ class_id: entry.record_id }).in("id", related.attendance_ids).is("class_id", null);
    }
  }

  await admin.from("trash").update({ restored_at: new Date().toISOString() }).eq("id", entry.id);
  return { success: true };
}

export async function restoreTrashItem(trashId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await assertAdmin();
    const admin = createAdminClient();
    const { data: entry, error: fetchErr } = await admin.from("trash").select("*").eq("id", trashId).maybeSingle();
    if (fetchErr || !entry) return { success: false, error: "Trash entry not found." };
    if (entry.restored_at) return { success: false, error: "Already restored." };

    const result = await restoreOne(admin, entry as TrashEntry);
    if (result.success) {
      await logAdminAction(user.email, "restore_from_trash", { table_name: entry.table_name, record_id: entry.record_id });
    }
    return result;
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function restoreTrashBatch(batchId: string): Promise<{ success: boolean; error?: string; restored?: number }> {
  try {
    const user = await assertAdmin();
    const admin = createAdminClient();
    const { data: entries, error } = await admin.from("trash").select("*").eq("batch_id", batchId).is("restored_at", null);
    if (error) return { success: false, error: error.message };

    // Restore parents (facilitators/classes/members) before attendance rows that reference them.
    const priority: Record<string, number> = { facilitators: 0, classes: 1, members: 2, attendance: 3 };
    const sorted = (entries ?? []).slice().sort((a: any, b: any) => (priority[a.table_name] ?? 9) - (priority[b.table_name] ?? 9));

    let restored = 0;
    for (const entry of sorted) {
      const result = await restoreOne(admin, entry as TrashEntry);
      if (result.success) restored++;
    }
    await logAdminAction(user.email, "restore_batch_from_trash", { batch_id: batchId, restored });
    return { success: true, restored };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function addMember(fields: {
  first_name: string;
  last_name: string;
  other_name?: string;
  phone: string;
  email?: string;
  class_id: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    await assertAdmin();
    const admin = createAdminClient();
    const fn = fields.first_name.trim();
    const ln = fields.last_name.trim();
    const on = (fields.other_name ?? "").trim();

    // Same duplicate-name protection used at public registration
    const { data: nameMatches } = await admin
      .from("members")
      .select("id, other_name")
      .ilike("first_name", fn)
      .ilike("last_name", ln);

    if (nameMatches && nameMatches.length > 0) {
      if (!on) {
        return { success: false, error: "name_taken" };
      }
      const exactDup = nameMatches.some(
        (m) => (m.other_name ?? "").trim().toLowerCase() === on.toLowerCase()
      );
      if (exactDup) {
        return { success: false, error: "already_registered" };
      }
    }

    const { data: cls } = await admin
      .from("classes")
      .select("id, slot, capacity_max")
      .eq("id", fields.class_id)
      .maybeSingle();
    if (!cls) return { success: false, error: "Class not found." };

    const { count } = await admin
      .from("members")
      .select("*", { count: "exact", head: true })
      .eq("class_id", cls.id);
    if ((count ?? 0) >= cls.capacity_max) {
      return { success: false, error: "That class is full." };
    }

    const { error } = await admin.from("members").insert({
      first_name:     fn,
      last_name:      ln,
      other_name:     on || null,
      phone:          fields.phone.trim(),
      email:          fields.email?.trim() || null,
      preferred_slot: cls.slot,
      class_id:       cls.id,
    });
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
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
    const user = await assertAdmin();
    const admin = createAdminClient();
    const { data: member, error: fetchErr } = await admin.from("members").select("*").eq("id", id).maybeSingle();
    if (fetchErr || !member) return { success: false, error: fetchErr?.message ?? "Member not found." };
    const { data: attRows } = await admin.from("attendance").select("id").eq("member_id", id);
    const attendanceIds = (attRows ?? []).map((r: any) => r.id);

    // Preserve attendance history but unlink from deleted member
    await admin.from("attendance").update({ member_id: null }).eq("member_id", id);
    const { error } = await admin.from("members").delete().eq("id", id);
    if (error) return { success: false, error: error.message };

    const batchId = randomUUID();
    await insertTrashRows(admin, [buildTrashRow(batchId, "members", id, member, { attendance_ids: attendanceIds }, user.email, "delete_member")]);
    await logAdminAction(user.email, "delete_member", {
      member_id: id, name: `${member.first_name} ${member.last_name}`, attendance_affected: attendanceIds.length,
    });
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function bulkDeleteMembers(
  ids: string[]
): Promise<{ success: boolean; error?: string }> {
  if (ids.length === 0) return { success: true };
  try {
    const user = await assertAdmin();
    const admin = createAdminClient();
    const { data: membersInfo } = await admin.from("members").select("*").in("id", ids);
    const batchId = randomUUID();
    const trashRows: ReturnType<typeof buildTrashRow>[] = [];
    let totalAttendanceAffected = 0;

    for (const m of membersInfo ?? []) {
      const { data: attRows } = await admin.from("attendance").select("id").eq("member_id", m.id);
      const attendanceIds = (attRows ?? []).map((r: any) => r.id);
      totalAttendanceAffected += attendanceIds.length;
      trashRows.push(buildTrashRow(batchId, "members", m.id, m, { attendance_ids: attendanceIds }, user.email, "bulk_delete_members"));
    }

    await admin.from("attendance").update({ member_id: null }).in("member_id", ids);
    const { error } = await admin.from("members").delete().in("id", ids);
    if (error) return { success: false, error: error.message };

    await insertTrashRows(admin, trashRows);
    await logAdminAction(user.email, "bulk_delete_members", {
      members: (membersInfo ?? []).map((m: any) => ({ id: m.id, name: `${m.first_name} ${m.last_name}` })),
      attendance_affected: totalAttendanceAffected,
    });
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function deleteClass(
  id: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await assertAdmin();
    const admin = createAdminClient();
    const { data: cls, error: fetchErr } = await admin.from("classes").select("*").eq("id", id).maybeSingle();
    if (fetchErr || !cls) return { success: false, error: fetchErr?.message ?? "Class not found." };
    const { data: memberRows } = await admin.from("members").select("id").eq("class_id", id);
    const { data: attRows } = await admin.from("attendance").select("id").eq("class_id", id);
    const memberIds = (memberRows ?? []).map((r: any) => r.id);
    const attendanceIds = (attRows ?? []).map((r: any) => r.id);

    await admin.from("members").update({ class_id: null }).eq("class_id", id);
    const { error } = await admin.from("classes").delete().eq("id", id);
    if (error) return { success: false, error: error.message };

    const batchId = randomUUID();
    await insertTrashRows(admin, [buildTrashRow(batchId, "classes", id, cls, { member_ids: memberIds, attendance_ids: attendanceIds }, user.email, "delete_class")]);
    await logAdminAction(user.email, "delete_class", {
      class_id: id, class_name: cls.name, slot: cls.slot, members_unassigned: memberIds.length,
    });
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
    const user = await assertAdmin();
    const admin = createAdminClient();
    const { data: classesInfo } = await admin.from("classes").select("*").in("id", ids);
    const batchId = randomUUID();
    const trashRows: ReturnType<typeof buildTrashRow>[] = [];
    let totalMembers = 0;

    for (const cls of classesInfo ?? []) {
      const { data: memberRows } = await admin.from("members").select("id").eq("class_id", cls.id);
      const { data: attRows } = await admin.from("attendance").select("id").eq("class_id", cls.id);
      const memberIds = (memberRows ?? []).map((r: any) => r.id);
      totalMembers += memberIds.length;
      trashRows.push(buildTrashRow(batchId, "classes", cls.id, cls, { member_ids: memberIds, attendance_ids: (attRows ?? []).map((r: any) => r.id) }, user.email, "bulk_delete_classes"));
    }

    await admin.from("members").update({ class_id: null }).in("class_id", ids);
    const { error } = await admin.from("classes").delete().in("id", ids);
    if (error) return { success: false, error: error.message };

    await insertTrashRows(admin, trashRows);
    await logAdminAction(user.email, "bulk_delete_classes", {
      classes: (classesInfo ?? []).map((c: any) => ({ id: c.id, name: c.name, slot: c.slot })), members_unassigned: totalMembers,
    });
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function deleteFacilitator(
  id: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await assertAdmin();
    const admin = createAdminClient();
    const { data: fac, error: fetchErr } = await admin.from("facilitators").select("*").eq("id", id).maybeSingle();
    if (fetchErr || !fac) return { success: false, error: fetchErr?.message ?? "Facilitator not found." };
    const { data: classRows } = await admin.from("classes").select("id").eq("facilitator_id", id);
    const classIds = (classRows ?? []).map((r: any) => r.id);

    await admin.from("classes").update({ facilitator_id: null }).eq("facilitator_id", id);
    const { error } = await admin.from("facilitators").delete().eq("id", id);
    if (error) return { success: false, error: error.message };

    const batchId = randomUUID();
    await insertTrashRows(admin, [buildTrashRow(batchId, "facilitators", id, fac, { class_ids: classIds }, user.email, "delete_facilitator")]);
    await logAdminAction(user.email, "delete_facilitator", {
      facilitator_id: id, full_name: fac.full_name, classes_unassigned: classIds.length,
    });
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
    const user = await assertAdmin();
    const admin = createAdminClient();
    const { data: facsInfo } = await admin.from("facilitators").select("*").in("id", ids);
    const batchId = randomUUID();
    const trashRows: ReturnType<typeof buildTrashRow>[] = [];
    let totalClasses = 0;

    for (const fac of facsInfo ?? []) {
      const { data: classRows } = await admin.from("classes").select("id").eq("facilitator_id", fac.id);
      const classIds = (classRows ?? []).map((r: any) => r.id);
      totalClasses += classIds.length;
      trashRows.push(buildTrashRow(batchId, "facilitators", fac.id, fac, { class_ids: classIds }, user.email, "bulk_delete_facilitators"));
    }

    await admin.from("classes").update({ facilitator_id: null }).in("facilitator_id", ids);
    const { error } = await admin.from("facilitators").delete().in("id", ids);
    if (error) return { success: false, error: error.message };

    await insertTrashRows(admin, trashRows);
    await logAdminAction(user.email, "bulk_delete_facilitators", {
      facilitators: (facsInfo ?? []).map((f: any) => ({ id: f.id, full_name: f.full_name })), classes_unassigned: totalClasses,
    });
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
  const user = await assertAdmin();
  const admin = createAdminClient();
  const { data: record, error: fetchErr } = await admin.from("attendance").select("*").eq("id", id).maybeSingle();
  if (fetchErr || !record) return { success: false, error: fetchErr?.message ?? "Record not found." };
  const { error } = await admin.from("attendance").delete().eq("id", id);
  if (error) return { success: false, error: error.message };

  const batchId = randomUUID();
  await insertTrashRows(admin, [buildTrashRow(batchId, "attendance", id, record, null, user.email, "delete_attendance_record")]);
  await logAdminAction(user.email, "delete_attendance_record", { attendance_id: id, member_name: record.member_name, attended_at: record.attended_at });
  return { success: true };
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
  const user = await assertAdmin();
  const admin = createAdminClient();
  const { data, error: fetchErr } = await admin
    .from("attendance")
    .select("*");
  if (fetchErr) return { success: false, error: fetchErr.message };
  const rows = (data ?? []).filter((r: any) => normName(r.member_name) === normKey);
  if (rows.length === 0) return { success: true };
  const ids = rows.map((r: any) => r.id);

  const { error } = await admin
    .from("attendance")
    .delete()
    .in("id", ids);
  if (error) return { success: false, error: error.message };

  const batchId = randomUUID();
  await insertTrashRows(admin, rows.map((row: any) => buildTrashRow(batchId, "attendance", row.id, row, null, user.email, "delete_attendance_person")));
  await logAdminAction(user.email, "delete_attendance_person", { name: rows[0]?.member_name ?? normKey, records_deleted: rows.length });
  return { success: true };
}

export async function eraseAllData(): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await assertFullAdmin();
    const admin = createAdminClient();
    const { data: attRows } = await admin.from("attendance").select("*");
    const { data: memberRows } = await admin.from("members").select("*");

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

    const batchId = randomUUID();
    const trashRows = [
      ...(memberRows ?? []).map((m: any) => buildTrashRow(batchId, "members", m.id, m, null, user.email, "erase_all_data")),
      ...(attRows ?? []).map((a: any) => buildTrashRow(batchId, "attendance", a.id, a, null, user.email, "erase_all_data")),
    ];
    await insertTrashRows(admin, trashRows);
    await logAdminAction(user.email, "erase_all_data", {
      members_deleted: (memberRows ?? []).length, attendance_deleted: (attRows ?? []).length,
    });
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

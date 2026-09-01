"use server";

import { createAdminClient } from "@/lib/supabase-admin";
import { getNowInTimezone, isWithinWindow, type TimeLock } from "@/lib/time-lock";

export async function getTimeLocks(): Promise<TimeLock[]> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("time_locks")
      .select("*")
      .order("day_of_week")
      .order("start_time");
    return (data ?? []) as TimeLock[];
  } catch {
    return [];
  }
}

export async function getTimeLockEnabled(): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("app_settings")
      .select("value")
      .eq("key", "time_lock_enabled")
      .single();
    return data?.value === "true";
  } catch {
    return false;
  }
}

export async function createTimeLock(
  input: Omit<TimeLock, "id">,
): Promise<{ success: boolean; error?: string }> {
  const admin = createAdminClient();
  const { error } = await admin.from("time_locks").insert(input);
  return error ? { success: false, error: error.message } : { success: true };
}

export async function updateTimeLock(
  id: string,
  input: Partial<Omit<TimeLock, "id">>,
): Promise<{ success: boolean; error?: string }> {
  const admin = createAdminClient();
  const { error } = await admin.from("time_locks").update(input).eq("id", id);
  return error ? { success: false, error: error.message } : { success: true };
}

export async function deleteTimeLock(id: string): Promise<{ success: boolean }> {
  const admin = createAdminClient();
  const { error } = await admin.from("time_locks").delete().eq("id", id);
  return { success: !error };
}

export async function isFormLocked(): Promise<{ locked: boolean; retryable?: boolean }> {
  try {
    const admin = createAdminClient();
    const [{ data: enabledRow }, { data: locks }] = await Promise.all([
      admin.from("app_settings").select("value").eq("key", "time_lock_enabled").single(),
      admin.from("time_locks").select("id,day_of_week,start_time,end_time,timezone,is_active").eq("is_active", true),
    ]);

    if (enabledRow?.value !== "true") return { locked: false };
    if (!locks || locks.length === 0) return { locked: false };

    const { dayOfWeek, totalMinutes } = getNowInTimezone("Africa/Kigali");
    const accessible = (locks as TimeLock[]).some((l) =>
      isWithinWindow(l, dayOfWeek, totalMinutes),
    );
    return { locked: !accessible };
  } catch {
    // Let the public form retry transient carrier/database failures instead of
    // silently treating an unavailable check as an unlocked form.
    return { locked: false, retryable: true };
  }
}

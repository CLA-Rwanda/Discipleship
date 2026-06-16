import { createAdminClient } from "@/lib/supabase-admin";

export interface AppSettings {
  total_sessions: number;
  attendance_threshold_pct: number;
  max_members_per_class: number;
  max_classes: number;
  registration_open: boolean;
  class_start_date: string;
}

const DEFAULTS: AppSettings = {
  total_sessions: 21,
  attendance_threshold_pct: 75,
  max_members_per_class: 15,
  max_classes: 32,
  registration_open: true,
  class_start_date: "",
};

export async function getAppSettings(): Promise<AppSettings> {
  try {
    const admin = createAdminClient();
    const { data } = await admin.from("app_settings").select("key, value");
    const map: Record<string, string> = {};
    for (const row of data ?? []) map[row.key] = row.value;
    return {
      total_sessions:           parseInt(map.total_sessions)           || DEFAULTS.total_sessions,
      attendance_threshold_pct: parseInt(map.attendance_threshold_pct) || DEFAULTS.attendance_threshold_pct,
      max_members_per_class:    parseInt(map.max_members_per_class)    || DEFAULTS.max_members_per_class,
      max_classes:              parseInt(map.max_classes)              || DEFAULTS.max_classes,
      registration_open:        map.registration_open !== "false",
      class_start_date:         map.class_start_date ?? "",
    };
  } catch {
    return DEFAULTS;
  }
}

export function calcThreshold(settings: AppSettings): number {
  return Math.ceil((settings.total_sessions * settings.attendance_threshold_pct) / 100);
}

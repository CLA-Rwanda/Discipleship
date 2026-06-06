"use server";

import { createAdminClient } from "@/lib/supabase-admin";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getAppSettings, calcThreshold } from "@/lib/settings";

export interface MissionReadyMember {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  email: string | null;
  class_name: string | null;
  slot: string | null;
  sessions_attended: number;
  sessions_required: number;
}

export interface MissionNotReadyMember {
  id: string;
  first_name: string;
  last_name: string;
  sessions_attended: number;
  sessions_required: number;
  needs: number;
}

export interface MissionsData {
  ready: MissionReadyMember[];
  notReady: MissionNotReadyMember[];
  threshold: number;
  settings: { total_sessions: number; attendance_threshold_pct: number };
}

async function assertAdmin() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  return user;
}

export async function getMissionsData(): Promise<MissionsData> {
  await assertAdmin();
  const admin = createAdminClient();
  const settings = await getAppSettings();
  const threshold = calcThreshold(settings);

  const [{ data: members }, { data: attendanceCounts }] = await Promise.all([
    admin
      .from("members")
      .select("id, first_name, last_name, phone, email, class_id, classes(name, slot)"),
    admin
      .from("attendance")
      .select("member_id")
      .not("member_id", "is", null),
  ]);

  const countById: Record<string, number> = {};
  for (const r of attendanceCounts ?? []) {
    if (r.member_id) countById[r.member_id] = (countById[r.member_id] ?? 0) + 1;
  }

  const ready: MissionReadyMember[] = [];
  const notReady: MissionNotReadyMember[] = [];

  for (const m of members ?? []) {
    const cls = m.classes as any;
    const attended = countById[m.id] ?? 0;

    if (attended >= threshold) {
      ready.push({
        id: m.id,
        first_name: m.first_name,
        last_name: m.last_name,
        phone: m.phone,
        email: m.email ?? null,
        class_name: cls?.name ?? null,
        slot: cls?.slot ?? null,
        sessions_attended: attended,
        sessions_required: threshold,
      });
    } else {
      notReady.push({
        id: m.id,
        first_name: m.first_name,
        last_name: m.last_name,
        sessions_attended: attended,
        sessions_required: threshold,
        needs: threshold - attended,
      });
    }
  }

  ready.sort((a, b) => b.sessions_attended - a.sessions_attended);
  notReady.sort((a, b) => b.sessions_attended - a.sessions_attended);

  return {
    ready,
    notReady,
    threshold,
    settings: {
      total_sessions: settings.total_sessions,
      attendance_threshold_pct: settings.attendance_threshold_pct,
    },
  };
}

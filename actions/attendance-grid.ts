"use server";

import { createAdminClient } from "@/lib/supabase-admin";

export interface GridMember {
  id: string;
  name: string;
  sessions: boolean[];
  attendedCount: number;
  missedCount: number;
  maxConsecutiveMisses: number;
  currentConsecutiveMisses: number;
  flagged: boolean;
}

export interface GridClass {
  id: string;
  name: string;
  slot: string;
  facilitator_name: string | null;
  sundays: string[];
  members: GridMember[];
}

export function getSundaysBetween(startDate: string, endDate?: string): string[] {
  if (!startDate) return [];
  const sundays: string[] = [];
  const cursor = new Date(startDate + "T12:00:00Z");
  const end = endDate ? new Date(endDate + "T23:59:59Z") : new Date();
  while (cursor <= end) {
    sundays.push(cursor.toISOString().split("T")[0]);
    cursor.setUTCDate(cursor.getUTCDate() + 7);
  }
  return sundays;
}

function maxConsec(sessions: boolean[]): number {
  let max = 0, cur = 0;
  for (const s of sessions) {
    cur = s ? 0 : cur + 1;
    if (cur > max) max = cur;
  }
  return max;
}

function trailingMisses(sessions: boolean[]): number {
  let count = 0;
  for (let i = sessions.length - 1; i >= 0; i--) {
    if (!sessions[i]) count++;
    else break;
  }
  return count;
}

export async function getAttendanceGrid(options: {
  startDate: string;
  endDate?: string;
  facilitatorId?: string;
}): Promise<GridClass[]> {
  if (!options.startDate) return [];

  const admin = createAdminClient();
  const sundays = getSundaysBetween(options.startDate, options.endDate);
  if (sundays.length === 0) return [];

  // Fetch classes
  let q = admin
    .from("classes")
    .select("id, name, slot, facilitators(full_name)")
    .eq("is_active", true)
    .order("slot")
    .order("name");
  if (options.facilitatorId) q = q.eq("facilitator_id", options.facilitatorId);

  const { data: classes } = await q;
  if (!classes || classes.length === 0) return [];

  const classIds = classes.map((c: any) => c.id);

  // Fetch all members for those classes
  const { data: members } = await admin
    .from("members")
    .select("id, first_name, last_name, other_name, class_id")
    .in("class_id", classIds)
    .order("last_name");

  if (!members) return [];

  const memberIds = members.map((m: any) => m.id);
  const firstSunday = sundays[0];
  const lastSunday  = sundays[sundays.length - 1];

  // Fetch attendance records in the date range
  const { data: attendance } = memberIds.length > 0
    ? await admin
        .from("attendance")
        .select("member_id, attended_at")
        .in("member_id", memberIds)
        .gte("attended_at", firstSunday + "T00:00:00Z")
        .lte("attended_at", lastSunday  + "T23:59:59Z")
    : { data: [] };

  // Build member_id → attended dates set
  const attendedMap = new Map<string, Set<string>>();
  for (const a of attendance ?? []) {
    if (!a.member_id) continue;
    if (!attendedMap.has(a.member_id)) attendedMap.set(a.member_id, new Set());
    attendedMap.get(a.member_id)!.add((a.attended_at as string).slice(0, 10));
  }

  return classes.map((cls: any) => {
    const clsMembers: GridMember[] = (members as any[])
      .filter((m) => m.class_id === cls.id)
      .map((m) => {
        const dates = attendedMap.get(m.id) ?? new Set<string>();
        const sessions = sundays.map((d) => dates.has(d));
        const mc = maxConsec(sessions);
        const tm = trailingMisses(sessions);
        const name = [m.first_name, m.other_name, m.last_name].filter(Boolean).join(" ");
        return {
          id: m.id,
          name,
          sessions,
          attendedCount: sessions.filter(Boolean).length,
          missedCount:   sessions.filter((s) => !s).length,
          maxConsecutiveMisses:     mc,
          currentConsecutiveMisses: tm,
          flagged: mc >= 3,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    return {
      id:               cls.id,
      name:             cls.name,
      slot:             cls.slot,
      facilitator_name: (cls.facilitators as any)?.full_name ?? null,
      sundays,
      members:          clsMembers,
    };
  });
}

"use client";

import { useState, useEffect, useMemo } from "react";
import { Users, BookOpen, ClipboardList, AlertTriangle, CheckCircle2, ChevronDown } from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";
import { StatCard } from "@/components/ui/Card";
import { createClient } from "@/lib/supabase";

interface DashboardStats {
  totalMembers: number;
  neverAttended: number;
  attendanceThisWeek: number;
  classesAtCapacity: number;
  classesWithOpenSpots: number;
  totalClasses: number;
  slotDistribution: { name: string; value: number }[];
  classFillData: { name: string; count: number; max: number }[];
}

const AMBER       = "#E89A10";
const AMBER_LIGHT = "#F8BA18";
const YELLOW      = "#C8D400";
const PURPLE      = "#5B2D8E";
const PIE_COLORS  = [AMBER, YELLOW, PURPLE, "#4ade80", "#60a5fa"];
const WEEK_OPTIONS = [4, 6, 8, 12, 16];

function dateKeyOf(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

function formatDateShort(key: string): string {
  return new Date(key + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="px-3 py-2 rounded-lg text-sm" style={{ background: "#3e1212", border: "1px solid rgba(228,148,12,0.3)", color: "var(--cla-off-white)" }}>
      <p className="font-bold mb-1" style={{ fontFamily: "Barlow Condensed, sans-serif" }}>{label}</p>
      {payload.map((p: any) => <p key={p.name} style={{ color: p.color }}>{p.name}: {p.value}</p>)}
    </div>
  );
}

export default function DashboardPage() {
  const [stats, setStats]   = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [attendanceDates, setAttendanceDates] = useState<string[]>([]);
  const [weeksToShow, setWeeksToShow] = useState(4);

  useEffect(() => {
    async function fetchStats() {
      const supabase = createClient();
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);

      const [
        { count: totalMembers },
        { count: attendanceThisWeek },
        { data: classes },
        { data: slotRaw },
        { data: attendanceRaw },
        { data: membersWithAttendance },
        { data: settingsRaw },
      ] = await Promise.all([
        supabase.from("members").select("*", { count: "exact", head: true }),
        supabase.from("attendance").select("*", { count: "exact", head: true }).gte("attended_at", weekAgo.toISOString()),
        supabase.from("classes").select("id, name, slot, members(count)").eq("is_active", true).order("name"),
        supabase.from("members").select("preferred_slot"),
        supabase.from("attendance").select("attended_at"),
        supabase.from("attendance").select("member_id").not("member_id", "is", null),
        supabase.from("app_settings").select("key,value"),
      ]);

      const settingsMap: Record<string, string> = {};
      for (const row of settingsRaw ?? []) settingsMap[(row as any).key] = (row as any).value;
      const maxPerClass = parseInt(settingsMap.max_members_per_class) || 15;

      const classFillData = (classes ?? []).map((c: any) => ({
        name: c.name, count: c.members?.[0]?.count ?? 0, max: maxPerClass,
      }));

      const classesAtCapacity   = classFillData.filter((c) => c.count >= c.max).length;
      const classesWithOpenSpots = classFillData.filter((c) => c.count < c.max).length;

      // Dynamic slot distribution — no hardcoded slots
      const slotCounts: Record<string, number> = {};
      (slotRaw ?? []).forEach((m: any) => {
        if (m.preferred_slot) slotCounts[m.preferred_slot] = (slotCounts[m.preferred_slot] ?? 0) + 1;
      });
      const slotDistribution = Object.entries(slotCounts)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([slot, value]) => ({ name: slot.toUpperCase(), value }));

      setAttendanceDates((attendanceRaw ?? []).map((r: any) => r.attended_at as string));

      const attendedIds = new Set((membersWithAttendance ?? []).map((r: any) => r.member_id).filter(Boolean));
      const neverAttended = Math.max(0, (totalMembers ?? 0) - attendedIds.size);

      setStats({
        totalMembers: totalMembers ?? 0,
        neverAttended,
        attendanceThisWeek: attendanceThisWeek ?? 0,
        classesAtCapacity,
        classesWithOpenSpots,
        totalClasses: (classes ?? []).length,
        slotDistribution,
        classFillData,
      });
      setLoading(false);
    }
    fetchStats();
  }, []);

  const availableSessionCount = useMemo(
    () => new Set(attendanceDates.map(dateKeyOf)).size,
    [attendanceDates]
  );

  const attendanceTrend = useMemo(() => {
    const byDate = new Map<string, number>();
    for (const iso of attendanceDates) {
      const key = dateKeyOf(iso);
      byDate.set(key, (byDate.get(key) ?? 0) + 1);
    }
    const sortedDesc = Array.from(byDate.keys()).sort((a, b) => b.localeCompare(a));
    const selected = sortedDesc.slice(0, weeksToShow).reverse(); // oldest → newest, left to right
    return selected.map((date, idx) => ({
      week:  `Week ${idx + 1} · ${formatDateShort(date)}`,
      count: byDate.get(date) ?? 0,
    }));
  }, [attendanceDates, weeksToShow]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="spinner" style={{ width: 32, height: 32, borderTopColor: "var(--cla-amber)", borderColor: "rgba(228,148,12,0.2)" }} />
      </div>
    );
  }

  const s = stats!;

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-extrabold" style={{ fontFamily: "Barlow Condensed, sans-serif" }}>Dashboard</h1>
        <p className="text-sm mt-0.5" style={{ color: "rgba(248,240,230,0.5)" }}>Overview of all discipleship activity</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Members" value={s.totalMembers} sub="registered" accent="amber" icon={<Users size={20} style={{ color: "var(--cla-amber)" }} />} />
        <StatCard label="Never Attended" value={s.neverAttended} sub="need follow-up" accent="red" icon={<ClipboardList size={20} style={{ color: "#ff6b6b" }} />} />
        <StatCard label="Classes Full" value={s.classesAtCapacity} sub={`of ${s.totalClasses} classes`} accent="amber" icon={<AlertTriangle size={20} style={{ color: "var(--cla-amber)" }} />} />
        <StatCard label="Open Classes" value={s.classesWithOpenSpots} sub="accepting members" accent="purple" icon={<CheckCircle2 size={20} style={{ color: "#b47fea" }} />} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="cla-card p-5">
          <div className="flex items-center justify-between gap-3 mb-1 flex-wrap">
            <h2 className="text-lg font-bold" style={{ fontFamily: "Barlow Condensed, sans-serif" }}>Attendance Trend</h2>
            <div className="relative">
              <select
                value={weeksToShow}
                onChange={(e) => setWeeksToShow(Number(e.target.value))}
                className="cla-input appearance-none pr-7 text-sm"
                style={{ width: "auto", minHeight: 34, padding: "6px 28px 6px 10px" }}
              >
                {WEEK_OPTIONS.map((n) => <option key={n} value={n}>Last {n} Sundays</option>)}
              </select>
              <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "rgba(248,240,230,0.4)" }} />
            </div>
          </div>
          {availableSessionCount > 0 && availableSessionCount < weeksToShow && (
            <p className="text-xs mb-3" style={{ color: "rgba(248,240,230,0.4)" }}>
              Only {availableSessionCount} Sunday{availableSessionCount !== 1 ? "s" : ""} recorded so far — showing all of them.
            </p>
          )}
          {attendanceTrend.length === 0 ? (
            <p className="text-center py-16 text-sm" style={{ color: "rgba(248,240,230,0.4)" }}>No attendance recorded yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={attendanceTrend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="week" stroke="rgba(248,240,230,0.3)" tick={{ fill: "rgba(248,240,230,0.5)", fontSize: 10 }} interval={0} angle={-30} textAnchor="end" height={50} />
                <YAxis stroke="rgba(248,240,230,0.3)" tick={{ fill: "rgba(248,240,230,0.5)", fontSize: 12 }} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} />
                <Line type="monotone" dataKey="count" name="Attendance" stroke={AMBER_LIGHT} strokeWidth={2.5} dot={{ fill: AMBER, r: 4 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="cla-card p-5">
          <h2 className="text-lg font-bold mb-4" style={{ fontFamily: "Barlow Condensed, sans-serif" }}>Members by Service Slot</h2>
          {s.slotDistribution.length === 0 ? (
            <p className="text-center py-12 text-sm" style={{ color: "rgba(248,240,230,0.4)" }}>No slot data yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={s.slotDistribution} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={4} dataKey="value">
                  {s.slotDistribution.map((_, idx) => <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
                <Legend formatter={(value) => <span style={{ color: "rgba(248,240,230,0.7)", fontSize: 12 }}>{value}</span>} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="cla-card p-5">
        <h2 className="text-lg font-bold mb-4" style={{ fontFamily: "Barlow Condensed, sans-serif" }}>
          Class Fill Levels — {s.totalClasses} Classes
        </h2>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={s.classFillData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="name" stroke="rgba(248,240,230,0.3)" tick={{ fill: "rgba(248,240,230,0.4)", fontSize: 10 }} interval={0} angle={-45} textAnchor="end" height={50} />
            <YAxis stroke="rgba(248,240,230,0.3)" tick={{ fill: "rgba(248,240,230,0.5)", fontSize: 12 }} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="count" name="Members" fill={AMBER} radius={[3, 3, 0, 0]} />
            <Bar dataKey="max"   name="Capacity" fill="rgba(228,148,12,0.15)" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

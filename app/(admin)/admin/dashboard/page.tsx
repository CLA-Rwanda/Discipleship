"use client";

import { useState, useEffect, useMemo } from "react";
import { Users, BookOpen, ClipboardList, AlertTriangle, CheckCircle2, ChevronDown, Search, Download } from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";
import { StatCard } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { SlotBadge } from "@/components/ui/Badge";
import { createClient } from "@/lib/supabase";
import { downloadXLSX } from "@/lib/xlsx-export";

interface DashboardStats {
  totalMembers: number;
  attendanceThisWeek: number;
  classesAtCapacity: number;
  classesWithOpenSpots: number;
  totalClasses: number;
  slotDistribution: { name: string; value: number }[];
  classFillData: { name: string; count: number; max: number }[];
}

interface NeverAttendedMember {
  id: string;
  first_name: string;
  last_name: string;
  other_name?: string;
  phone: string;
  email?: string;
  preferred_slot: string;
  class_name?: string;
  registered_at: string;
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

function exportNeverAttendedCSV(members: NeverAttendedMember[]) {
  downloadXLSX([
    ["First Name", "Middle Name", "Last Name", "Phone", "Email", "Slot", "Class", "Registered"],
    ...members.map((m) => [
      m.first_name, m.other_name ?? "", m.last_name, m.phone, m.email ?? "",
      m.preferred_slot, m.class_name ?? "",
      new Date(m.registered_at).toLocaleDateString("en-GB"),
    ]),
  ], "cla-never-attended.xlsx");
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
  const [neverAttendedMembers, setNeverAttendedMembers] = useState<NeverAttendedMember[]>([]);
  const [neverAttendedOpen, setNeverAttendedOpen] = useState(false);
  const [neverAttendedSearch, setNeverAttendedSearch] = useState("");

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
        { data: allMembersRaw },
      ] = await Promise.all([
        supabase.from("members").select("*", { count: "exact", head: true }),
        supabase.from("attendance").select("*", { count: "exact", head: true }).gte("attended_at", weekAgo.toISOString()),
        supabase.from("classes").select("id, name, slot, members(count)").eq("is_active", true).order("name"),
        supabase.from("members").select("preferred_slot"),
        supabase.from("attendance").select("attended_at"),
        supabase.from("attendance").select("member_id").not("member_id", "is", null),
        supabase.from("app_settings").select("key,value"),
        supabase.from("members").select("id, first_name, last_name, other_name, phone, email, preferred_slot, registered_at, classes(name)"),
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
      setNeverAttendedMembers(
        (allMembersRaw ?? [])
          .filter((m: any) => !attendedIds.has(m.id))
          .map((m: any) => ({
            id: m.id,
            first_name: m.first_name,
            last_name: m.last_name,
            other_name: m.other_name ?? undefined,
            phone: m.phone,
            email: m.email ?? undefined,
            preferred_slot: m.preferred_slot,
            class_name: m.classes?.name,
            registered_at: m.registered_at,
          }))
      );

      setStats({
        totalMembers: totalMembers ?? 0,
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

  const filteredNeverAttended = neverAttendedMembers.filter((m) => {
    const q = neverAttendedSearch.toLowerCase();
    if (q === "") return true;
    const full = `${m.first_name} ${m.other_name ?? ""} ${m.last_name}`.toLowerCase();
    return full.includes(q) || m.phone.includes(q) || (m.email ?? "").toLowerCase().includes(q);
  });

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-extrabold" style={{ fontFamily: "Barlow Condensed, sans-serif" }}>Dashboard</h1>
        <p className="text-sm mt-0.5" style={{ color: "rgba(248,240,230,0.5)" }}>Overview of all discipleship activity</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Members" value={s.totalMembers} sub="registered" accent="amber" icon={<Users size={20} style={{ color: "var(--cla-amber)" }} />} />
        <StatCard label="Never Attended" value={neverAttendedMembers.length} sub="need follow-up — click to view" accent="red" icon={<ClipboardList size={20} style={{ color: "#ff6b6b" }} />} onClick={() => setNeverAttendedOpen(true)} />
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

      {/* Never Attended Modal */}
      <Modal open={neverAttendedOpen} onClose={() => { setNeverAttendedOpen(false); setNeverAttendedSearch(""); }} title={`Never Attended — ${neverAttendedMembers.length}`} maxWidth="720px">
        <div className="flex flex-col gap-4">
          <p className="text-sm" style={{ color: "rgba(248,240,230,0.55)" }}>
            Registered members with zero attendance records. Reach out before removing anyone.
          </p>
          <div className="flex gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "rgba(248,240,230,0.35)" }} />
              <input type="text" placeholder="Search by name, phone, or email…" value={neverAttendedSearch}
                onChange={(e) => setNeverAttendedSearch(e.target.value)} className="cla-input pl-9 text-sm" />
            </div>
            <button onClick={() => exportNeverAttendedCSV(filteredNeverAttended)} disabled={filteredNeverAttended.length === 0}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all shrink-0"
              style={{ fontFamily: "Barlow Condensed, sans-serif", background: "rgba(228,148,12,0.1)", color: "var(--cla-amber)", border: "1px solid rgba(228,148,12,0.2)", opacity: filteredNeverAttended.length === 0 ? 0.5 : 1 }}>
              <Download size={14} /> Export CSV
            </button>
          </div>

          {filteredNeverAttended.length === 0 ? (
            <p className="text-center py-12 text-sm" style={{ color: "rgba(248,240,230,0.4)" }}>
              {neverAttendedMembers.length === 0 ? "Everyone has attended at least once. 🎉" : "No matches for that search."}
            </p>
          ) : (
            <div className="rounded-xl overflow-hidden" style={{ background: "var(--cla-bg-card)", border: "1px solid rgba(228,148,12,0.15)" }}>
              <div className="overflow-x-auto" style={{ maxHeight: 420, overflowY: "auto" }}>
                <table className="cla-table" style={{ minWidth: "560px" }}>
                  <thead>
                    <tr><th>Name</th><th>Phone</th><th>Email</th><th>Slot</th><th>Class</th><th>Registered</th></tr>
                  </thead>
                  <tbody>
                    {filteredNeverAttended.map((m) => (
                      <tr key={m.id}>
                        <td className="font-semibold">
                          {m.first_name} {m.last_name}
                          {m.other_name && <span className="ml-1.5 font-normal text-xs" style={{ color: "rgba(248,240,230,0.45)" }}>({m.other_name})</span>}
                        </td>
                        <td style={{ color: "rgba(248,240,230,0.7)" }}>{m.phone}</td>
                        <td style={{ color: "rgba(248,240,230,0.55)" }}>{m.email ?? <span style={{ color: "rgba(248,240,230,0.25)" }}>—</span>}</td>
                        <td><SlotBadge slot={m.preferred_slot} /></td>
                        <td style={{ color: "rgba(248,240,230,0.7)" }}>{m.class_name ?? <span style={{ color: "rgba(248,240,230,0.3)" }}>Unassigned</span>}</td>
                        <td className="text-sm" style={{ color: "rgba(248,240,230,0.5)" }}>{new Date(m.registered_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="px-4 py-3 text-xs" style={{ borderTop: "1px solid rgba(255,255,255,0.05)", color: "rgba(248,240,230,0.4)" }}>
                Showing {filteredNeverAttended.length} of {neverAttendedMembers.length}
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}

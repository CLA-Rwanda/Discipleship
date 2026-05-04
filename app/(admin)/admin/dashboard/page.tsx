"use client";

import { useState, useEffect } from "react";
import {
  Users,
  BookOpen,
  ClipboardList,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import { StatCard } from "@/components/ui/Card";
import { createClient } from "@/lib/supabase";

interface DashboardStats {
  totalMembers: number;
  attendanceToday: number;
  attendanceThisWeek: number;
  classesAtCapacity: number;
  classesWithOpenSpots: number;
  slotDistribution: { name: string; value: number }[];
  classFillData: { name: string; count: number; max: number }[];
  attendanceTrend: { week: string; count: number }[];
}

const AMBER = "#D4860A";
const AMBER_LIGHT = "#F0A500";
const YELLOW = "#C8D400";
const PURPLE = "#5B2D8E";
const WINE = "#8B1A1A";

const PIE_COLORS = [AMBER, YELLOW, PURPLE];

function CustomTooltip({ active, payload, label }: any) {
  if (active && payload && payload.length) {
    return (
      <div
        className="px-3 py-2 rounded-lg text-sm"
        style={{
          background: "#2E0A0A",
          border: "1px solid rgba(212,134,10,0.3)",
          color: "var(--cla-off-white)",
        }}
      >
        <p className="font-bold mb-1" style={{ fontFamily: "Barlow Condensed, sans-serif" }}>
          {label}
        </p>
        {payload.map((p: any) => (
          <p key={p.name} style={{ color: p.color }}>
            {p.name}: {p.value}
          </p>
        ))}
      </div>
    );
  }
  return null;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      const supabase = createClient();

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const weekAgo = new Date(today);
      weekAgo.setDate(weekAgo.getDate() - 7);

      const [
        { count: totalMembers },
        { count: attendanceToday },
        { count: attendanceThisWeek },
        { data: classes },
        { data: slotRaw },
        { data: weeklyRaw },
      ] = await Promise.all([
        supabase.from("members").select("*", { count: "exact", head: true }),
        supabase
          .from("attendance")
          .select("*", { count: "exact", head: true })
          .gte("attended_at", today.toISOString()),
        supabase
          .from("attendance")
          .select("*", { count: "exact", head: true })
          .gte("attended_at", weekAgo.toISOString()),
        supabase
          .from("classes")
          .select(
            "id, name, slot, capacity_max, members(count)"
          )
          .eq("is_active", true)
          .order("name"),
        supabase
          .from("members")
          .select("preferred_slot"),
        supabase
          .from("attendance")
          .select("attended_at")
          .gte("attended_at", new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString()),
      ]);

      // Process class fill data
      const classFillData = (classes ?? []).map((c: any) => ({
        name: c.name,
        count: c.members?.[0]?.count ?? 0,
        max: c.capacity_max,
      }));

      const classesAtCapacity = classFillData.filter(
        (c) => c.count >= c.max
      ).length;
      const classesWithOpenSpots = classFillData.filter(
        (c) => c.count < c.max
      ).length;

      // Slot distribution
      const slotCounts: Record<string, number> = {
        "8am": 0,
        "10am": 0,
        "12pm": 0,
      };
      (slotRaw ?? []).forEach((m: any) => {
        if (m.preferred_slot) slotCounts[m.preferred_slot]++;
      });
      const slotDistribution = [
        { name: "8AM", value: slotCounts["8am"] },
        { name: "10AM", value: slotCounts["10am"] },
        { name: "12PM", value: slotCounts["12pm"] },
      ];

      // Weekly attendance trend (last 4 weeks)
      const weeklyBuckets: Record<string, number> = {};
      for (let i = 3; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i * 7);
        const key = `Week ${4 - i}`;
        weeklyBuckets[key] = 0;
      }
      (weeklyRaw ?? []).forEach((r: any) => {
        const d = new Date(r.attended_at);
        const now = new Date();
        const diffWeeks = Math.floor(
          (now.getTime() - d.getTime()) / (7 * 24 * 60 * 60 * 1000)
        );
        if (diffWeeks <= 3) {
          const key = `Week ${4 - diffWeeks}`;
          if (weeklyBuckets[key] !== undefined) weeklyBuckets[key]++;
        }
      });
      const attendanceTrend = Object.entries(weeklyBuckets).map(
        ([week, count]) => ({ week, count })
      );

      setStats({
        totalMembers: totalMembers ?? 0,
        attendanceToday: attendanceToday ?? 0,
        attendanceThisWeek: attendanceThisWeek ?? 0,
        classesAtCapacity,
        classesWithOpenSpots,
        slotDistribution,
        classFillData,
        attendanceTrend,
      });
      setLoading(false);
    }

    fetchStats();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div
          className="spinner"
          style={{
            width: 32,
            height: 32,
            borderTopColor: "var(--cla-amber)",
            borderColor: "rgba(212,134,10,0.2)",
          }}
        />
      </div>
    );
  }

  const s = stats!;

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      {/* Page header */}
      <div>
        <h1
          className="text-3xl font-extrabold"
          style={{ fontFamily: "Barlow Condensed, sans-serif" }}
        >
          Dashboard
        </h1>
        <p className="text-sm mt-0.5" style={{ color: "rgba(232,224,216,0.5)" }}>
          Overview of all discipleship activity
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Members"
          value={s.totalMembers}
          sub="registered"
          accent="amber"
          icon={<Users size={20} style={{ color: "var(--cla-amber)" }} />}
        />
        <StatCard
          label="Attended Today"
          value={s.attendanceToday}
          sub="this session"
          accent="green"
          icon={<ClipboardList size={20} style={{ color: "#C8D400" }} />}
        />
        <StatCard
          label="Classes Full"
          value={s.classesAtCapacity}
          sub={`of 20 classes`}
          accent="red"
          icon={<AlertTriangle size={20} style={{ color: "#ff6b6b" }} />}
        />
        <StatCard
          label="Open Classes"
          value={s.classesWithOpenSpots}
          sub="accepting members"
          accent="purple"
          icon={<CheckCircle2 size={20} style={{ color: "#b47fea" }} />}
        />
      </div>

      {/* Charts row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Attendance trend */}
        <div className="cla-card p-5">
          <h2
            className="text-lg font-bold mb-4"
            style={{ fontFamily: "Barlow Condensed, sans-serif" }}
          >
            Attendance Trend — Last 4 Weeks
          </h2>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={s.attendanceTrend}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(255,255,255,0.05)"
              />
              <XAxis
                dataKey="week"
                stroke="rgba(232,224,216,0.3)"
                tick={{ fill: "rgba(232,224,216,0.5)", fontSize: 12 }}
              />
              <YAxis
                stroke="rgba(232,224,216,0.3)"
                tick={{ fill: "rgba(232,224,216,0.5)", fontSize: 12 }}
              />
              <Tooltip content={<CustomTooltip />} />
              <Line
                type="monotone"
                dataKey="count"
                name="Attendance"
                stroke={AMBER_LIGHT}
                strokeWidth={2.5}
                dot={{ fill: AMBER, r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Slot distribution pie */}
        <div className="cla-card p-5">
          <h2
            className="text-lg font-bold mb-4"
            style={{ fontFamily: "Barlow Condensed, sans-serif" }}
          >
            Members by Service Slot
          </h2>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={s.slotDistribution}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={4}
                dataKey="value"
              >
                {s.slotDistribution.map((_, idx) => (
                  <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
              <Legend
                formatter={(value) => (
                  <span style={{ color: "rgba(232,224,216,0.7)", fontSize: 12 }}>
                    {value}
                  </span>
                )}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Class fill bar chart */}
      <div className="cla-card p-5">
        <h2
          className="text-lg font-bold mb-4"
          style={{ fontFamily: "Barlow Condensed, sans-serif" }}
        >
          Class Fill Levels — All 20 Classes
        </h2>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart
            data={s.classFillData}
            margin={{ top: 0, right: 0, left: -20, bottom: 0 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgba(255,255,255,0.05)"
            />
            <XAxis
              dataKey="name"
              stroke="rgba(232,224,216,0.3)"
              tick={{ fill: "rgba(232,224,216,0.4)", fontSize: 10 }}
              interval={0}
              angle={-45}
              textAnchor="end"
              height={50}
            />
            <YAxis
              stroke="rgba(232,224,216,0.3)"
              tick={{ fill: "rgba(232,224,216,0.5)", fontSize: 12 }}
              domain={[0, 18]}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar
              dataKey="count"
              name="Members"
              fill={AMBER}
              radius={[3, 3, 0, 0]}
            />
            <Bar
              dataKey="max"
              name="Capacity"
              fill="rgba(212,134,10,0.15)"
              radius={[3, 3, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

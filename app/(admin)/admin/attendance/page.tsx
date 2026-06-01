"use client";

import { useState, useEffect, useMemo } from "react";
import { Search, Download, GraduationCap, ClipboardList } from "lucide-react";
import { SlotBadge } from "@/components/ui/Badge";
import { createClient } from "@/lib/supabase";

// ── Types ────────────────────────────────────────────────────────────────────

interface AttendanceRow {
  id: string;
  member_name: string;
  service_slot: string;
  attended_at: string;
  class_name: string | null;
  facilitator_name: string | null;
  is_linked: boolean;
}

interface ProgressRow {
  displayName: string;
  count: number;
  slots: string[];
}

type Tab = "log" | "progress";

// ── Helpers ──────────────────────────────────────────────────────────────────

function normName(s: string) {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function exportCSV(rows: AttendanceRow[], filtered: AttendanceRow[]) {
  const header = ["Name", "Class", "Facilitator", "Slot", "Date", "Linked"];
  const csvRows = filtered.map((r) => [
    r.member_name,
    r.class_name ?? "",
    r.facilitator_name ?? "",
    r.service_slot,
    new Date(r.attended_at).toLocaleDateString("en-GB"),
    r.is_linked ? "Yes" : "No",
  ]);
  const csv = [header, ...csvRows].map((r) => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "cla-attendance.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function exportProgressCSV(progress: ProgressRow[], threshold: number) {
  const header = ["Name", "Sessions", "Status"];
  const csvRows = progress.map((p) => [
    p.displayName,
    p.count,
    p.count >= threshold ? "Ready" : `${threshold - p.count} more needed`,
  ]);
  const csv = [header, ...csvRows].map((r) => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "cla-graduation-progress.csv";
  a.click();
  URL.revokeObjectURL(url);
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AttendancePage() {
  const [tab, setTab] = useState<Tab>("progress");
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterSlot, setFilterSlot] = useState("all");
  const [threshold, setThreshold] = useState(8);
  const [progressSearch, setProgressSearch] = useState("");

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("attendance")
      .select(`id, member_name, service_slot, attended_at, member_id, classes(name, facilitators(full_name))`)
      .order("attended_at", { ascending: false })
      .then(({ data }) => {
        setRows(
          (data ?? []).map((r: any) => ({
            id: r.id,
            member_name: r.member_name,
            service_slot: r.service_slot,
            attended_at: r.attended_at,
            class_name: r.classes?.name ?? null,
            facilitator_name: r.classes?.facilitators?.full_name ?? null,
            is_linked: !!r.member_id,
          }))
        );
        setLoading(false);
      });
  }, []);

  // ── Log tab ────────────────────────────────────────────────────────────────
  const filteredLog = rows.filter((r) => {
    const q = search.toLowerCase();
    const matchSearch =
      q === "" ||
      r.member_name.toLowerCase().includes(q) ||
      (r.class_name ?? "").toLowerCase().includes(q) ||
      (r.facilitator_name ?? "").toLowerCase().includes(q);
    const matchSlot = filterSlot === "all" || r.service_slot === filterSlot;
    return matchSearch && matchSlot;
  });

  // ── Progress tab ───────────────────────────────────────────────────────────
  const progress = useMemo<ProgressRow[]>(() => {
    const map = new Map<string, { displayName: string; count: number; slots: Set<string> }>();
    for (const r of rows) {
      const key = normName(r.member_name);
      if (!map.has(key)) {
        map.set(key, { displayName: r.member_name.trim(), count: 0, slots: new Set() });
      }
      const entry = map.get(key)!;
      entry.count++;
      if (r.service_slot) entry.slots.add(r.service_slot);
    }
    return Array.from(map.values())
      .map((e) => ({ displayName: e.displayName, count: e.count, slots: Array.from(e.slots) }))
      .sort((a, b) => b.count - a.count);
  }, [rows]);

  const filteredProgress = useMemo(() => {
    const q = progressSearch.toLowerCase();
    return q === ""
      ? progress
      : progress.filter((p) => p.displayName.toLowerCase().includes(q));
  }, [progress, progressSearch]);

  const readyCount = progress.filter((p) => p.count >= threshold).length;
  const almostCount = progress.filter((p) => p.count >= threshold - 2 && p.count < threshold).length;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-6 animate-fade-in">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-extrabold" style={{ fontFamily: "Barlow Condensed, sans-serif" }}>
            Attendance
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "rgba(248,240,230,0.5)" }}>
            {rows.length} total records · {progress.length} unique attendees
          </p>
        </div>
        <button
          onClick={() =>
            tab === "log"
              ? exportCSV(rows, filteredLog)
              : exportProgressCSV(filteredProgress, threshold)
          }
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all"
          style={{
            fontFamily: "Barlow Condensed, sans-serif",
            background: "rgba(228,148,12,0.1)",
            color: "var(--cla-amber)",
            border: "1px solid rgba(228,148,12,0.2)",
          }}
        >
          <Download size={14} />
          Export CSV
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl w-fit" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(228,148,12,0.1)" }}>
        {([
          { key: "progress", label: "Graduation Progress", icon: GraduationCap },
          { key: "log",      label: "Attendance Log",      icon: ClipboardList },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all"
            style={{
              fontFamily: "Barlow Condensed, sans-serif",
              background: tab === key ? "linear-gradient(135deg,#E89A10,#F8BA18)" : "transparent",
              color: tab === key ? "#200909" : "rgba(248,240,230,0.5)",
            }}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="spinner" style={{ width: 28, height: 28, borderTopColor: "var(--cla-amber)", borderColor: "rgba(228,148,12,0.2)" }} />
        </div>
      ) : (
        <>
          {/* ── PROGRESS TAB ────────────────────────────────────────────── */}
          {tab === "progress" && (
            <div className="flex flex-col gap-5">

              {/* Threshold + stats */}
              <div className="flex flex-wrap gap-4 items-center">
                {/* Threshold input */}
                <div
                  className="flex items-center gap-3 px-4 py-3 rounded-xl"
                  style={{ background: "var(--cla-bg-card)", border: "1px solid rgba(228,148,12,0.15)" }}
                >
                  <GraduationCap size={16} style={{ color: "var(--cla-amber)" }} />
                  <span className="text-sm font-bold" style={{ fontFamily: "Barlow Condensed, sans-serif" }}>
                    Graduation threshold
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={52}
                    value={threshold}
                    onChange={(e) => setThreshold(Math.max(1, parseInt(e.target.value) || 1))}
                    className="cla-input text-center font-bold"
                    style={{ width: 64, padding: "4px 8px", fontSize: "1rem" }}
                  />
                  <span className="text-sm" style={{ color: "rgba(248,240,230,0.45)" }}>sessions</span>
                </div>

                {/* Stat chips */}
                <div className="flex gap-3 flex-wrap">
                  <div className="px-4 py-2 rounded-xl text-sm font-bold" style={{ background: "rgba(200,212,0,0.1)", border: "1px solid rgba(200,212,0,0.25)", color: "#C8D400" }}>
                    {readyCount} ready to graduate
                  </div>
                  <div className="px-4 py-2 rounded-xl text-sm font-bold" style={{ background: "rgba(228,148,12,0.1)", border: "1px solid rgba(228,148,12,0.25)", color: "var(--cla-amber)" }}>
                    {almostCount} almost there
                  </div>
                  <div className="px-4 py-2 rounded-xl text-sm font-bold" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(248,240,230,0.5)" }}>
                    {progress.length - readyCount - almostCount} in progress
                  </div>
                </div>
              </div>

              {/* Search */}
              <div className="relative max-w-sm">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "rgba(248,240,230,0.35)" }} />
                <input
                  type="text"
                  placeholder="Search by name…"
                  value={progressSearch}
                  onChange={(e) => setProgressSearch(e.target.value)}
                  className="cla-input pl-9 text-sm"
                />
              </div>

              {/* Progress table */}
              <div className="rounded-xl overflow-hidden" style={{ background: "var(--cla-bg-card)", border: "1px solid rgba(228,148,12,0.15)" }}>
                <div className="overflow-x-auto">
                  <table className="cla-table" style={{ minWidth: "480px" }}>
                    <thead>
                      <tr>
                        <th style={{ width: 40 }}>#</th>
                        <th>Name</th>
                        <th style={{ width: 80 }}>Sessions</th>
                        <th>Progress</th>
                        <th style={{ width: 110 }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredProgress.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="text-center py-12" style={{ color: "rgba(248,240,230,0.35)" }}>
                            No attendees found.
                          </td>
                        </tr>
                      ) : (
                        filteredProgress.map((p, idx) => {
                          const pct     = Math.min((p.count / threshold) * 100, 100);
                          const isReady = p.count >= threshold;
                          const isClose = !isReady && p.count >= threshold - 2;
                          const color   = isReady ? "#C8D400" : isClose ? "var(--cla-amber)" : "rgba(228,148,12,0.4)";

                          return (
                            <tr key={p.displayName}>
                              <td className="text-sm" style={{ color: "rgba(248,240,230,0.3)" }}>{idx + 1}</td>
                              <td className="font-semibold">{p.displayName}</td>
                              <td>
                                <span className="font-bold text-base" style={{ color }}>{p.count}</span>
                              </td>
                              <td style={{ width: 200 }}>
                                <div className="flex items-center gap-2">
                                  <div
                                    className="flex-1 rounded-full overflow-hidden"
                                    style={{ height: 6, background: "rgba(255,255,255,0.07)" }}
                                  >
                                    <div
                                      className="h-full rounded-full transition-all"
                                      style={{
                                        width: `${pct}%`,
                                        background: isReady
                                          ? "linear-gradient(90deg,#a8c000,#C8D400)"
                                          : isClose
                                          ? "linear-gradient(90deg,#E89A10,#F8BA18)"
                                          : "rgba(228,148,12,0.4)",
                                      }}
                                    />
                                  </div>
                                  <span className="text-xs shrink-0" style={{ color: "rgba(248,240,230,0.3)", minWidth: 32 }}>
                                    {Math.round(pct)}%
                                  </span>
                                </div>
                              </td>
                              <td>
                                {isReady ? (
                                  <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: "rgba(200,212,0,0.12)", color: "#C8D400", border: "1px solid rgba(200,212,0,0.3)" }}>
                                    ✓ Ready
                                  </span>
                                ) : isClose ? (
                                  <span className="text-xs font-bold" style={{ color: "var(--cla-amber)" }}>
                                    {threshold - p.count} more
                                  </span>
                                ) : (
                                  <span className="text-xs" style={{ color: "rgba(248,240,230,0.3)" }}>
                                    {threshold - p.count} to go
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="px-4 py-3 text-xs" style={{ borderTop: "1px solid rgba(255,255,255,0.05)", color: "rgba(248,240,230,0.4)" }}>
                  {filteredProgress.length} attendees · sorted by sessions (highest first)
                </div>
              </div>
            </div>
          )}

          {/* ── LOG TAB ─────────────────────────────────────────────────── */}
          {tab === "log" && (
            <div className="flex flex-col gap-5">
              {/* Filters */}
              <div className="flex gap-3 flex-wrap">
                <div className="relative flex-1 min-w-[200px]">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "rgba(248,240,230,0.35)" }} />
                  <input
                    type="text"
                    placeholder="Search by name, class, or facilitator…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="cla-input pl-9 text-sm"
                  />
                </div>
                {["all", "8am", "10am", "12pm"].map((s) => (
                  <button
                    key={s}
                    onClick={() => setFilterSlot(s)}
                    className="px-3 py-2 rounded-full text-sm font-bold transition-all"
                    style={{
                      fontFamily: "Barlow Condensed, sans-serif",
                      background: filterSlot === s ? "linear-gradient(135deg,#E89A10,#F8BA18)" : "rgba(255,255,255,0.05)",
                      color: filterSlot === s ? "#200909" : "rgba(248,240,230,0.6)",
                      border: filterSlot === s ? "none" : "1px solid rgba(228,148,12,0.2)",
                    }}
                  >
                    {s === "all" ? "All Slots" : s}
                  </button>
                ))}
              </div>

              {/* Table */}
              <div className="rounded-xl overflow-hidden" style={{ background: "var(--cla-bg-card)", border: "1px solid rgba(228,148,12,0.15)" }}>
                <div className="overflow-x-auto">
                  <table className="cla-table" style={{ minWidth: "620px" }}>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Name</th>
                        <th>Class</th>
                        <th>Facilitator</th>
                        <th>Slot</th>
                        <th>Date</th>
                        <th>Linked</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredLog.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="text-center py-12" style={{ color: "rgba(248,240,230,0.35)" }}>
                            No attendance records found.
                          </td>
                        </tr>
                      ) : (
                        filteredLog.map((r, idx) => (
                          <tr key={r.id}>
                            <td className="text-sm" style={{ color: "rgba(248,240,230,0.35)" }}>{idx + 1}</td>
                            <td className="font-semibold">{r.member_name}</td>
                            <td style={{ color: "rgba(248,240,230,0.7)" }}>
                              {r.class_name ?? <span style={{ color: "rgba(248,240,230,0.25)" }}>—</span>}
                            </td>
                            <td style={{ color: "rgba(248,240,230,0.6)" }}>
                              {r.facilitator_name ?? <span style={{ color: "rgba(248,240,230,0.25)" }}>—</span>}
                            </td>
                            <td><SlotBadge slot={r.service_slot as any} /></td>
                            <td className="text-sm" style={{ color: "rgba(248,240,230,0.5)" }}>
                              {new Date(r.attended_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                            </td>
                            <td>
                              <span className="text-xs font-bold" style={{ color: r.is_linked ? "#C8D400" : "rgba(248,240,230,0.25)" }}>
                                {r.is_linked ? "Yes" : "No"}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                {filteredLog.length > 0 && (
                  <div className="px-4 py-3 text-xs" style={{ borderTop: "1px solid rgba(255,255,255,0.05)", color: "rgba(248,240,230,0.4)" }}>
                    Showing {filteredLog.length} of {rows.length} records
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

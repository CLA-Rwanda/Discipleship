"use client";

import { useState, useEffect, useMemo, Fragment } from "react";
import { Search, Download, ClipboardList, GraduationCap, Pencil, Trash2, Check, X, CalendarCheck, ChevronRight, AlertTriangle, Wand2 } from "lucide-react";
import { SlotBadge } from "@/components/ui/Badge";
import {
  updateAttendanceName,
  deleteAttendanceRecord,
  renameAttendancePerson,
  deleteAttendancePerson,
  snapAttendanceToSunday,
  setMemberAttendanceStatus,
} from "@/actions/admin";
import { getAllAttendanceForAdmin } from "@/actions/attendance";
import { createClient } from "@/lib/supabase";
import { downloadXLSX } from "@/lib/xlsx-export";
import { snapToSunday } from "@/lib/dates";

// ── Types ────────────────────────────────────────────────────────────────────

interface AttendanceRow {
  id: string;
  member_name: string;
  service_slot: string;
  attended_at: string;
  class_id: string | null;
  class_name: string | null;
  facilitator_name: string | null;
  member_id: string | null;
  is_linked: boolean;
}

interface ProgressRow {
  normKey: string;
  displayName: string;
  count: number;
}

interface RosterMember {
  id: string;
  first_name: string;
  last_name: string;
  other_name: string | null;
}

interface ClassRosterInfo {
  id: string;
  name: string;
  slot: string;
  facilitator_name: string | null;
  member_count: number;
  members: RosterMember[];
}

interface SnapshotClassRow {
  classId: string | null;
  name: string;
  slot: string;
  facilitator: string | null;
  count: number;
  rosterSize: number;
}

type Tab = "snapshot" | "progress" | "log";

// ── Helpers ──────────────────────────────────────────────────────────────────

function normName(s: string) {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function dateKeyOf(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

function formatDateLabel(key: string): string {
  return new Date(key + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short", year: "numeric" });
}

function formatDateShort(key: string): string {
  return new Date(key + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function memberDisplayName(m: RosterMember): string {
  return m.other_name ? `${m.first_name} ${m.other_name} ${m.last_name}` : `${m.first_name} ${m.last_name}`;
}

// Per-student detail: for a single Sunday, who attended/was absent and when;
// for All Time, one column per Sunday plus a running total — same shape as
// what the expandable class rows already show on screen, just exportable.
function exportSnapshotCSV(
  classes: SnapshotClassRow[],
  classRoster: ClassRosterInfo[],
  rows: AttendanceRow[],
  availableDates: string[],
  selectedDate: string
) {
  if (selectedDate === "all") {
    const header = ["Class", "Facilitator", "Slot", "Student", ...availableDates.map((d) => formatDateShort(d)), "Sessions Attended", "Total Sessions"];
    const dataRows: (string | number)[][] = [];

    for (const c of classes) {
      const roster = classRoster.find((cr) => cr.id === c.classId)?.members ?? [];
      if (roster.length > 0) {
        for (const m of roster) {
          const memberRows = rows.filter((r) => r.class_id === c.classId && r.member_id === m.id);
          const count = memberRows.length;
          const perDate = availableDates.map((d) => (memberRows.some((r) => dateKeyOf(r.attended_at) === d) ? "Yes" : "No"));
          dataRows.push([c.name, c.facilitator ?? "", c.slot, memberDisplayName(m), ...perDate, count, availableDates.length]);
        }
      } else if (c.classId === null) {
        // Stray/unlinked check-ins with no fixed roster to compare against
        const strayRows = rows.filter((r) => !r.class_id && (r.class_name ?? "Unassigned") === c.name);
        const byName = new Map<string, AttendanceRow[]>();
        for (const r of strayRows) {
          if (!byName.has(r.member_name)) byName.set(r.member_name, []);
          byName.get(r.member_name)!.push(r);
        }
        for (const [name, memberRows] of Array.from(byName.entries())) {
          const count = memberRows.length;
          const perDate = availableDates.map((d) => (memberRows.some((r: AttendanceRow) => dateKeyOf(r.attended_at) === d) ? "Yes" : "No"));
          dataRows.push([c.name, c.facilitator ?? "", c.slot, name, ...perDate, count, availableDates.length]);
        }
      }
    }
    downloadXLSX([header, ...dataRows], "cla-attendance-snapshot-all-time.xlsx");
  } else {
    const header = ["Class", "Facilitator", "Slot", "Student", "Status", "Checked In At"];
    const dataRows: (string | number)[][] = [];

    for (const c of classes) {
      const roster = classRoster.find((cr) => cr.id === c.classId)?.members ?? [];
      if (roster.length > 0) {
        for (const m of roster) {
          const record = rows.find((r) => r.class_id === c.classId && r.member_id === m.id && dateKeyOf(r.attended_at) === selectedDate);
          dataRows.push([
            c.name, c.facilitator ?? "", c.slot, memberDisplayName(m),
            record ? "Attended" : "Absent",
            record ? new Date(record.attended_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "",
          ]);
        }
      } else if (c.classId === null) {
        const strayRows = rows.filter((r) => !r.class_id && (r.class_name ?? "Unassigned") === c.name && dateKeyOf(r.attended_at) === selectedDate);
        for (const r of strayRows) {
          dataRows.push([c.name, c.facilitator ?? "", c.slot, r.member_name, "Attended", new Date(r.attended_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })]);
        }
      }
    }
    downloadXLSX([header, ...dataRows], `cla-attendance-snapshot-${selectedDate}.xlsx`);
  }
}

function exportLogCSV(rows: AttendanceRow[]) {
  downloadXLSX([
    ["Name", "Class", "Facilitator", "Slot", "Date", "Linked"],
    ...rows.map((r) => [
      r.member_name,
      r.class_name ?? "",
      r.facilitator_name ?? "",
      r.service_slot,
      new Date(r.attended_at).toLocaleDateString("en-GB"),
      r.is_linked ? "Yes" : "No",
    ]),
  ], "cla-attendance.xlsx");
}

function exportProgressCSV(rows: ProgressRow[], threshold: number) {
  downloadXLSX([
    ["Name", "Sessions Attended", "Sessions Required", "Status"],
    ...rows.map((p) => [
      p.displayName,
      p.count,
      threshold,
      p.count >= threshold ? "Ready" : `${threshold - p.count} more needed`,
    ]),
  ], "cla-graduation-progress.xlsx");
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AttendancePage() {
  const [tab, setTab] = useState<Tab>("snapshot");
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [classRoster, setClassRoster] = useState<ClassRosterInfo[]>([]);

  // Snapshot tab state
  const [selectedDate, setSelectedDate] = useState<string>("all");
  const [snapshotSearch, setSnapshotSearch] = useState("");
  const [expandedSnapshotClasses, setExpandedSnapshotClasses] = useState<Set<string>>(new Set());
  const [savingSnapshotMemberId, setSavingSnapshotMemberId] = useState<string | null>(null);
  const [snapshotStatusError, setSnapshotStatusError] = useState("");

  // Log tab state
  const [logSearch, setLogSearch] = useState("");
  const [filterSlot, setFilterSlot] = useState("all");
  const [editLogId, setEditLogId] = useState<string | null>(null);
  const [editLogName, setEditLogName] = useState("");
  const [savingLog, setSavingLog] = useState(false);
  const [confirmDeleteLogId, setConfirmDeleteLogId] = useState<string | null>(null);
  const [deletingLog, setDeletingLog] = useState(false);

  // Non-Sunday cleanup utility
  const [snapPanelOpen, setSnapPanelOpen] = useState(false);
  const [snapConfirm, setSnapConfirm]     = useState(false);
  const [snapping, setSnapping]           = useState(false);
  const [snapError, setSnapError]         = useState("");
  const [snapResult, setSnapResult]       = useState<{ updated: number; skipped: number } | null>(null);

  // Progress tab state
  const [threshold, setThreshold] = useState(16);
  const [progressSearch, setProgressSearch] = useState("");
  const [editPersonKey, setEditPersonKey] = useState<string | null>(null);
  const [editPersonName, setEditPersonName] = useState("");
  const [savingPerson, setSavingPerson] = useState(false);
  const [confirmDeletePersonKey, setConfirmDeletePersonKey] = useState<string | null>(null);
  const [deletingPerson, setDeletingPerson] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    Promise.all([
      getAllAttendanceForAdmin(),
      supabase.from("app_settings").select("key,value"),
      supabase.from("classes").select("id, name, slot, facilitators(full_name), members(id, first_name, last_name, other_name)").eq("is_active", true),
    ]).then(([data, { data: settings }, { data: classData }]) => {
      setRows(data);
      if (settings) {
        const map = Object.fromEntries(settings.map((s: { key: string; value: string }) => [s.key, s.value]));
        const totalSessions = parseInt(map.total_sessions) || 21;
        const thresholdPct  = parseInt(map.attendance_threshold_pct) || 75;
        setThreshold(Math.ceil((totalSessions * thresholdPct) / 100));
      }
      setClassRoster((classData ?? []).map((c: any) => ({
        id:               c.id,
        name:             c.name,
        slot:             c.slot,
        facilitator_name: c.facilitators?.full_name ?? null,
        member_count:     (c.members ?? []).length,
        members:          c.members ?? [],
      })));
      setLoading(false);
    });
  }, []);

  // ── Snapshot tab ───────────────────────────────────────────────────────────
  const availableDates = useMemo(
    () => Array.from(new Set(rows.map((r) => dateKeyOf(r.attended_at)))).sort((a, b) => b.localeCompare(a)),
    [rows]
  );

  const snapshotRows = useMemo(
    () => (selectedDate === "all" ? rows : rows.filter((r) => dateKeyOf(r.attended_at) === selectedDate)),
    [rows, selectedDate]
  );

  const snapshotStats = useMemo(() => {
    const uniqueSet = new Set(snapshotRows.map((r) => r.member_id ?? normName(r.member_name)));
    const bySlot: Record<string, number> = {};
    for (const r of snapshotRows) bySlot[r.service_slot] = (bySlot[r.service_slot] ?? 0) + 1;

    // Every active class shows up (even with 0 check-ins that day) so absentees are visible too.
    const classes: SnapshotClassRow[] = classRoster.map((c) => ({
      classId:    c.id,
      name:       c.name,
      slot:       c.slot,
      facilitator: c.facilitator_name,
      count:      snapshotRows.filter((r) => r.class_id === c.id).length,
      rosterSize: c.member_count,
    }));

    // Fold in any check-ins that don't map to a known active class (unlinked or a since-deleted class).
    const knownIds = new Set(classRoster.map((c) => c.id));
    const strayByKey = new Map<string, SnapshotClassRow>();
    for (const r of snapshotRows) {
      if (r.class_id && knownIds.has(r.class_id)) continue;
      const key = r.class_name ?? "Unassigned";
      if (!strayByKey.has(key)) {
        strayByKey.set(key, { classId: null, name: key, slot: r.service_slot, facilitator: r.facilitator_name, count: 0, rosterSize: 0 });
      }
      strayByKey.get(key)!.count++;
    }

    return {
      total: snapshotRows.length,
      unique: uniqueSet.size,
      bySlot,
      classes: [...classes, ...Array.from(strayByKey.values())].sort((a, b) => b.count - a.count),
    };
  }, [snapshotRows, classRoster]);

  const previousDateStats = useMemo(() => {
    if (selectedDate === "all") return null;
    const idx = availableDates.indexOf(selectedDate);
    const prevDate = availableDates[idx + 1];
    if (!prevDate) return null;
    const total = rows.filter((r) => dateKeyOf(r.attended_at) === prevDate).length;
    return { date: prevDate, total };
  }, [selectedDate, availableDates, rows]);

  const filteredSnapshotClasses = useMemo(() => {
    const query = snapshotSearch.trim().toLowerCase();
    if (!query) return snapshotStats.classes;
    return snapshotStats.classes.filter((c) => {
      const roster = classRoster.find((cr) => cr.id === c.classId)?.members ?? [];
      return [c.name, c.slot, c.facilitator ?? "", ...roster.map(memberDisplayName)].some((value) => value.toLowerCase().includes(query));
    });
  }, [snapshotSearch, snapshotStats.classes, classRoster]);

  function snapshotRosterMembers(c: SnapshotClassRow): RosterMember[] {
    const roster = classRoster.find((cr) => cr.id === c.classId)?.members ?? [];
    const query = snapshotSearch.trim().toLowerCase();
    if (!query) return roster;
    const classMatches = [c.name, c.slot, c.facilitator ?? ""].some((value) => value.toLowerCase().includes(query));
    return classMatches ? roster : roster.filter((member) => memberDisplayName(member).toLowerCase().includes(query));
  }

  function toggleSnapshotClass(key: string) {
    setExpandedSnapshotClasses((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  function memberAttendanceOnDate(classId: string | null, memberId: string, date: string): AttendanceRow | null {
    return rows.find((r) => r.class_id === classId && r.member_id === memberId && dateKeyOf(r.attended_at) === date) ?? null;
  }

  function memberAttendanceCount(classId: string | null, memberId: string): number {
    return rows.filter((r) => r.class_id === classId && r.member_id === memberId).length;
  }

  async function setSnapshotAttendance(memberId: string, present: boolean) {
    if (selectedDate === "all") return;
    setSavingSnapshotMemberId(memberId);
    setSnapshotStatusError("");
    const result = await setMemberAttendanceStatus(memberId, selectedDate, present);
    setSavingSnapshotMemberId(null);
    if (!result.success) { setSnapshotStatusError(result.error ?? "Could not update attendance."); return; }
    setRows(await getAllAttendanceForAdmin());
  }

  // ── Non-Sunday cleanup utility ────────────────────────────────────────────
  const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const nonSundayRows = useMemo(
    () => rows.filter((r) => new Date(r.attended_at).getUTCDay() !== 0),
    [rows]
  );

  async function handleSnapAll() {
    setSnapping(true);
    setSnapError("");
    const result = await snapAttendanceToSunday(nonSundayRows.map((r) => r.id));
    setSnapping(false);
    if (result.success) {
      setSnapResult({ updated: result.updated ?? 0, skipped: result.skipped ?? 0 });
      setSnapConfirm(false);
      // Refresh from the server so dates/joins reflect the update
      const fresh = await getAllAttendanceForAdmin();
      setRows(fresh);
    } else {
      setSnapError(result.error ?? "Something went wrong.");
    }
  }

  // ── Log tab ────────────────────────────────────────────────────────────────
  const filteredLog = rows.filter((r) => {
    const q = logSearch.toLowerCase();
    const matchSearch =
      q === "" ||
      r.member_name.toLowerCase().includes(q) ||
      (r.class_name ?? "").toLowerCase().includes(q) ||
      (r.facilitator_name ?? "").toLowerCase().includes(q);
    return matchSearch && (filterSlot === "all" || r.service_slot === filterSlot);
  });

  async function handleSaveLogEdit(id: string) {
    if (!editLogName.trim()) return;
    setSavingLog(true);
    const res = await updateAttendanceName(id, editLogName);
    setSavingLog(false);
    if (res.success) {
      setRows((prev) =>
        prev.map((r) => (r.id === id ? { ...r, member_name: editLogName.trim() } : r))
      );
      setEditLogId(null);
    }
  }

  async function handleDeleteLog(id: string) {
    setDeletingLog(true);
    const res = await deleteAttendanceRecord(id);
    setDeletingLog(false);
    if (res.success) {
      setRows((prev) => prev.filter((r) => r.id !== id));
      setConfirmDeleteLogId(null);
    }
  }

  // ── Progress tab ───────────────────────────────────────────────────────────
  const progress = useMemo<ProgressRow[]>(() => {
    const map = new Map<string, { displayName: string; count: number }>();
    for (const r of rows) {
      const key = normName(r.member_name);
      if (!map.has(key)) map.set(key, { displayName: r.member_name.trim(), count: 0 });
      map.get(key)!.count++;
    }
    return Array.from(map.entries())
      .map(([key, v]) => ({ normKey: key, displayName: v.displayName, count: v.count }))
      .sort((a, b) => b.count - a.count);
  }, [rows]);

  const filteredProgress = useMemo(() => {
    const q = progressSearch.toLowerCase();
    return q === "" ? progress : progress.filter((p) => p.displayName.toLowerCase().includes(q));
  }, [progress, progressSearch]);

  const readyCount  = progress.filter((p) => p.count >= threshold).length;
  const almostCount = progress.filter((p) => p.count >= threshold - 2 && p.count < threshold).length;

  async function handleSavePersonEdit(normKey: string) {
    if (!editPersonName.trim()) return;
    setSavingPerson(true);
    const res = await renameAttendancePerson(normKey, editPersonName);
    setSavingPerson(false);
    if (res.success) {
      const newName = editPersonName.trim();
      setRows((prev) =>
        prev.map((r) => (normName(r.member_name) === normKey ? { ...r, member_name: newName } : r))
      );
      setEditPersonKey(null);
    }
  }

  async function handleDeletePerson(normKey: string) {
    setDeletingPerson(true);
    const res = await deleteAttendancePerson(normKey);
    setDeletingPerson(false);
    if (res.success) {
      setRows((prev) => prev.filter((r) => normName(r.member_name) !== normKey));
      setConfirmDeletePersonKey(null);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const btnStyle = (active: boolean) => ({
    fontFamily: "Barlow Condensed, sans-serif",
    background: active ? "linear-gradient(135deg,#E89A10,#F8BA18)" : "transparent",
    color: active ? "#200909" : "rgba(248,240,230,0.5)",
  });

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
          onClick={() => {
            if (tab === "log") exportLogCSV(filteredLog);
            else if (tab === "progress") exportProgressCSV(filteredProgress, threshold);
            else exportSnapshotCSV(snapshotStats.classes, classRoster, rows, availableDates, selectedDate);
          }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all"
          style={{ fontFamily: "Barlow Condensed, sans-serif", background: "rgba(228,148,12,0.1)", color: "var(--cla-amber)", border: "1px solid rgba(228,148,12,0.2)" }}
        >
          <Download size={14} />
          Export CSV
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl w-full sm:w-fit overflow-x-auto" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(228,148,12,0.1)" }}>
        {([
          { key: "snapshot", label: "Sunday Snapshot",     icon: CalendarCheck },
          { key: "progress", label: "Graduation Progress", icon: GraduationCap },
          { key: "log",      label: "Attendance Log",      icon: ClipboardList  },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all flex-1 sm:flex-none whitespace-nowrap"
            style={{ ...btnStyle(tab === key), minHeight: 44 }}
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
          {/* ══ SNAPSHOT TAB ══════════════════════════════════════════════ */}
          {tab === "snapshot" && (
            <div className="flex flex-col gap-5">
              <div className="relative max-w-md">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "rgba(248,240,230,0.35)" }} />
                <input
                  type="search"
                  placeholder="Search by class, facilitator, or member…"
                  value={snapshotSearch}
                  onChange={(e) => setSnapshotSearch(e.target.value)}
                  className="cla-input pl-9 text-sm w-full"
                  aria-label="Search Sunday Snapshot"
                />
              </div>
              {/* Date selector */}
              <div className="flex gap-2 overflow-x-auto pb-1">
                <button onClick={() => setSelectedDate("all")}
                  className="shrink-0 px-4 py-2 rounded-full text-sm font-bold transition-all"
                  style={{ minHeight: 44, fontFamily: "Barlow Condensed, sans-serif", background: selectedDate === "all" ? "linear-gradient(135deg,#E89A10,#F8BA18)" : "rgba(255,255,255,0.05)", color: selectedDate === "all" ? "#200909" : "rgba(248,240,230,0.6)", border: selectedDate === "all" ? "none" : "1px solid rgba(228,148,12,0.2)" }}>
                  All Time
                </button>
                {availableDates.map((d) => (
                  <button key={d} onClick={() => setSelectedDate(d)}
                    className="shrink-0 px-4 py-2 rounded-full text-sm font-bold transition-all whitespace-nowrap"
                    style={{ minHeight: 44, fontFamily: "Barlow Condensed, sans-serif", background: selectedDate === d ? "linear-gradient(135deg,#E89A10,#F8BA18)" : "rgba(255,255,255,0.05)", color: selectedDate === d ? "#200909" : "rgba(248,240,230,0.6)", border: selectedDate === d ? "none" : "1px solid rgba(228,148,12,0.2)" }}>
                    {formatDateShort(d)}
                  </button>
                ))}
              </div>

              {snapshotStats.total === 0 ? (
                <div className="cla-card p-12 text-center" style={{ color: "rgba(248,240,230,0.35)" }}>
                  No attendance recorded {selectedDate === "all" ? "yet" : `on ${formatDateLabel(selectedDate)}`}.
                </div>
              ) : (
                <>
                  <h2 className="text-xl font-bold" style={{ fontFamily: "Barlow Condensed, sans-serif" }}>
                    {selectedDate === "all" ? "All-Time Summary" : formatDateLabel(selectedDate)}
                  </h2>

                  {/* Stat cards */}
                  <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
                    <div className="p-4 rounded-xl" style={{ background: "rgba(228,148,12,0.08)", border: "1px solid rgba(228,148,12,0.25)" }}>
                      <p className="text-xs uppercase tracking-widest mb-1" style={{ fontFamily: "Barlow Condensed, sans-serif", color: "rgba(248,240,230,0.45)" }}>Total Attendance</p>
                      <p className="text-3xl font-extrabold" style={{ fontFamily: "Barlow Condensed, sans-serif", color: "var(--cla-amber-light)" }}>{snapshotStats.total}</p>
                      {previousDateStats && (
                        <p className="text-xs mt-1 font-semibold" style={{ color: snapshotStats.total >= previousDateStats.total ? "#C8D400" : "#ff6b6b" }}>
                          {snapshotStats.total >= previousDateStats.total ? "▲" : "▼"} {Math.abs(snapshotStats.total - previousDateStats.total)} vs {formatDateShort(previousDateStats.date)}
                        </p>
                      )}
                    </div>
                    <div className="p-4 rounded-xl" style={{ background: "rgba(200,212,0,0.08)", border: "1px solid rgba(200,212,0,0.25)" }}>
                      <p className="text-xs uppercase tracking-widest mb-1" style={{ fontFamily: "Barlow Condensed, sans-serif", color: "rgba(248,240,230,0.45)" }}>Unique Students</p>
                      <p className="text-3xl font-extrabold" style={{ fontFamily: "Barlow Condensed, sans-serif", color: "#C8D400" }}>{snapshotStats.unique}</p>
                    </div>
                    <div className="p-4 rounded-xl" style={{ background: "rgba(91,45,142,0.08)", border: "1px solid rgba(91,45,142,0.25)" }}>
                      <p className="text-xs uppercase tracking-widest mb-1" style={{ fontFamily: "Barlow Condensed, sans-serif", color: "rgba(248,240,230,0.45)" }}>Classes Represented</p>
                      <p className="text-3xl font-extrabold" style={{ fontFamily: "Barlow Condensed, sans-serif", color: "#b47fea" }}>{snapshotStats.classes.length}</p>
                    </div>
                    {Object.entries(snapshotStats.bySlot).sort(([a], [b]) => a.localeCompare(b)).map(([slot, count]) => (
                      <div key={slot} className="p-4 rounded-xl" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                        <p className="text-xs uppercase tracking-widest mb-1" style={{ fontFamily: "Barlow Condensed, sans-serif", color: "rgba(248,240,230,0.45)" }}>{slot.toUpperCase()} Service</p>
                        <p className="text-3xl font-extrabold">{count}</p>
                      </div>
                    ))}
                  </div>

                  {/* Per-class breakdown */}
                  <div className="rounded-xl overflow-hidden" style={{ background: "var(--cla-bg-card)", border: "1px solid rgba(228,148,12,0.15)" }}>
                    <div className="overflow-x-auto">
                      <table className="cla-table" style={{ minWidth: "560px" }}>
                        <thead>
                          <tr><th>Class</th><th>Facilitator</th><th>Slot</th><th>Attended</th></tr>
                        </thead>
                        <tbody>
                          {filteredSnapshotClasses.length === 0 ? (
                            <tr><td colSpan={4} className="text-center py-10" style={{ color: "rgba(248,240,230,0.4)" }}>No classes or members match this search.</td></tr>
                          ) : filteredSnapshotClasses.map((c) => {
                            const key = c.classId ?? c.name;
                            const isExpanded = expandedSnapshotClasses.has(key);
                            const rosterMembers = snapshotRosterMembers(c);
                            return (
                              <Fragment key={key}>
                                <tr>
                                  <td className="font-semibold">
                                    <button onClick={() => toggleSnapshotClass(key)} className="inline-flex items-center gap-1.5"
                                      style={{ background: "none", border: "none", padding: 0, cursor: "pointer", font: "inherit", color: "inherit" }}>
                                      <ChevronRight size={14} style={{ color: "rgba(248,240,230,0.4)", transform: isExpanded ? "rotate(90deg)" : "none", transition: "transform 0.15s", flexShrink: 0 }} />
                                      {c.name}
                                    </button>
                                  </td>
                                  <td style={{ color: "rgba(248,240,230,0.6)" }}>{c.facilitator ?? <span style={{ color: "rgba(248,240,230,0.25)" }}>—</span>}</td>
                                  <td><SlotBadge slot={c.slot as any} /></td>
                                  <td className="font-bold">
                                    {c.count}
                                    {c.rosterSize > 0 && <span style={{ color: "rgba(248,240,230,0.4)", fontWeight: 400 }}> /{c.rosterSize}</span>}
                                  </td>
                                </tr>
                                {isExpanded && (
                                  <tr>
                                    <td colSpan={4} style={{ background: "rgba(255,255,255,0.02)", padding: 0, borderTop: "1px solid rgba(228,148,12,0.1)" }}>
                                      <div className="px-4 py-4">
                                        {rosterMembers.length === 0 ? (
                                          <p className="text-center py-4 text-sm" style={{ color: "rgba(248,240,230,0.4)" }}>No members in this class.</p>
                                        ) : (
                                          <div className="rounded-lg overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
                                            <div className="overflow-x-auto">
                                              <table className="cla-table" style={{ minWidth: "420px" }}>
                                                <thead>
                                                  <tr><th>#</th><th>Name</th><th>{selectedDate === "all" ? "Attendance" : "Status"}</th>{selectedDate !== "all" && <th>Action</th>}</tr>
                                                </thead>
                                                <tbody>
                                                  {rosterMembers.map((m, idx) => (
                                                    <tr key={m.id}>
                                                      <td className="text-sm" style={{ color: "rgba(248,240,230,0.35)" }}>{idx + 1}</td>
                                                      <td className="font-semibold text-sm">
                                                        {m.first_name} {m.last_name}
                                                        {m.other_name && <span className="ml-1.5 font-normal text-xs" style={{ color: "rgba(248,240,230,0.45)" }}>({m.other_name})</span>}
                                                      </td>
                                                      {selectedDate === "all" ? (() => {
                                                        const count = memberAttendanceCount(c.classId, m.id);
                                                        const p = availableDates.length > 0 ? Math.round((count / availableDates.length) * 100) : 0;
                                                        return (
                                                          <td>
                                                            <div className="flex items-center gap-2">
                                                              <span className="text-sm font-bold" style={{ color: p >= 75 ? "#C8D400" : "var(--cla-amber)" }}>{count}/{availableDates.length}</span>
                                                              <div className="rounded-full overflow-hidden" style={{ width: 60, height: 5, background: "rgba(255,255,255,0.07)" }}>
                                                                <div className="h-full rounded-full" style={{ width: `${p}%`, background: p >= 75 ? "linear-gradient(90deg,#a8c000,#C8D400)" : "linear-gradient(90deg,#E89A10,#F8BA18)" }} />
                                                              </div>
                                                            </div>
                                                          </td>
                                                        );
                                                      })() : (() => {
                                                        const record = memberAttendanceOnDate(c.classId, m.id, selectedDate);
                                                        return (
                                                          <><td>{record ? <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: "rgba(200,212,0,0.12)", color: "#C8D400", border: "1px solid rgba(200,212,0,0.3)" }}>✓ Present</span> : <span className="text-xs" style={{ color: "rgba(248,240,230,0.3)" }}>— Absent</span>}</td><td><button onClick={() => setSnapshotAttendance(m.id, !record)} disabled={savingSnapshotMemberId === m.id} className="text-xs px-2.5 py-1 rounded font-bold" style={{ background: record ? "rgba(192,40,40,0.16)" : "rgba(200,212,0,0.12)", color: record ? "#ff6b6b" : "#C8D400", border: `1px solid ${record ? "rgba(192,40,40,0.35)" : "rgba(200,212,0,0.3)"}` }}>{savingSnapshotMemberId === m.id ? "Saving…" : record ? "Mark absent" : "Mark present"}</button></td></>
                                                        );
                                                      })()}
                                                    </tr>
                                                  ))}
                                                </tbody>
                                              </table>
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  {snapshotStatusError && <p className="text-sm" style={{ color: "#ff6b6b" }}>{snapshotStatusError}</p>}
                </>
              )}
            </div>
          )}

          {/* ══ PROGRESS TAB ══════════════════════════════════════════════ */}
          {tab === "progress" && (
            <div className="flex flex-col gap-5">

              {/* Stats */}
              <div className="flex flex-wrap gap-4 items-center">
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
                <input type="text" placeholder="Search by name…" value={progressSearch}
                  onChange={(e) => setProgressSearch(e.target.value)} className="cla-input pl-9 text-sm" />
              </div>

              {/* Progress table */}
              <div className="rounded-xl overflow-hidden" style={{ background: "var(--cla-bg-card)", border: "1px solid rgba(228,148,12,0.15)" }}>
                <div className="overflow-x-auto">
                  <table className="cla-table" style={{ minWidth: "520px" }}>
                    <thead>
                      <tr>
                        <th style={{ width: 40 }}>#</th>
                        <th>Name</th>
                        <th style={{ width: 72 }}>Sessions</th>
                        <th>Progress</th>
                        <th style={{ width: 100 }}>Status</th>
                        <th style={{ width: 80 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredProgress.length === 0 ? (
                        <tr><td colSpan={6} className="text-center py-12" style={{ color: "rgba(248,240,230,0.35)" }}>No attendees found.</td></tr>
                      ) : (
                        filteredProgress.map((p, idx) => {
                          const pct     = Math.min((p.count / threshold) * 100, 100);
                          const isReady = p.count >= threshold;
                          const isClose = !isReady && p.count >= threshold - 2;
                          const barColor = isReady
                            ? "linear-gradient(90deg,#a8c000,#C8D400)"
                            : isClose ? "linear-gradient(90deg,#E89A10,#F8BA18)"
                            : "rgba(228,148,12,0.4)";
                          const textColor = isReady ? "#C8D400" : isClose ? "var(--cla-amber)" : "rgba(228,148,12,0.5)";
                          const isEditingThis   = editPersonKey   === p.normKey;
                          const isDeletingThis  = confirmDeletePersonKey === p.normKey;

                          return (
                            <tr key={p.normKey}>
                              <td className="text-sm" style={{ color: "rgba(248,240,230,0.3)" }}>{idx + 1}</td>

                              {/* Name — editable */}
                              <td>
                                {isEditingThis ? (
                                  <div className="flex items-center gap-1.5">
                                    <input
                                      autoFocus
                                      className="cla-input text-sm py-1"
                                      style={{ minWidth: 160 }}
                                      value={editPersonName}
                                      onChange={(e) => setEditPersonName(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter") handleSavePersonEdit(p.normKey);
                                        if (e.key === "Escape") setEditPersonKey(null);
                                      }}
                                    />
                                    <button onClick={() => handleSavePersonEdit(p.normKey)} disabled={savingPerson} className="p-1 rounded" style={{ color: "#C8D400" }}>
                                      <Check size={14} />
                                    </button>
                                    <button onClick={() => setEditPersonKey(null)} className="p-1 rounded" style={{ color: "rgba(248,240,230,0.4)" }}>
                                      <X size={14} />
                                    </button>
                                  </div>
                                ) : (
                                  <span className="font-semibold">{p.displayName}</span>
                                )}
                              </td>

                              <td>
                                <span className="font-bold text-base" style={{ color: textColor }}>{p.count}</span>
                              </td>

                              <td>
                                <div className="flex items-center gap-2">
                                  <div className="flex-1 rounded-full overflow-hidden" style={{ height: 6, background: "rgba(255,255,255,0.07)" }}>
                                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: barColor }} />
                                  </div>
                                  <span className="text-xs shrink-0" style={{ color: "rgba(248,240,230,0.3)", minWidth: 32 }}>{Math.round(pct)}%</span>
                                </div>
                              </td>

                              <td>
                                {isReady ? (
                                  <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: "rgba(200,212,0,0.12)", color: "#C8D400", border: "1px solid rgba(200,212,0,0.3)" }}>✓ Ready</span>
                                ) : (
                                  <span className="text-xs" style={{ color: isClose ? "var(--cla-amber)" : "rgba(248,240,230,0.3)" }}>
                                    {threshold - p.count} to go
                                  </span>
                                )}
                              </td>

                              {/* Actions */}
                              <td>
                                {isDeletingThis ? (
                                  <div className="flex items-center gap-1.5 whitespace-nowrap">
                                    <span className="text-xs font-bold" style={{ color: "#ff6b6b" }}>Delete {p.count}?</span>
                                    <button onClick={() => setConfirmDeletePersonKey(null)} className="text-xs px-1.5 py-0.5 rounded" style={{ color: "rgba(248,240,230,0.5)", border: "1px solid rgba(255,255,255,0.1)" }}>No</button>
                                    <button onClick={() => handleDeletePerson(p.normKey)} disabled={deletingPerson} className="text-xs px-1.5 py-0.5 rounded font-bold" style={{ background: "rgba(192,40,40,0.25)", color: "#ff6b6b", border: "1px solid rgba(192,40,40,0.4)" }}>
                                      {deletingPerson ? "…" : "Yes"}
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1">
                                    <button
                                      onClick={() => { setEditPersonKey(p.normKey); setEditPersonName(p.displayName); setConfirmDeletePersonKey(null); }}
                                      className="p-1.5 rounded-lg transition-all"
                                      style={{ color: "rgba(228,148,12,0.5)" }}
                                      title="Rename"
                                    >
                                      <Pencil size={13} />
                                    </button>
                                    <button
                                      onClick={() => { setConfirmDeletePersonKey(p.normKey); setEditPersonKey(null); }}
                                      className="p-1.5 rounded-lg transition-all"
                                      style={{ color: "rgba(192,40,40,0.5)" }}
                                      title="Delete all records"
                                    >
                                      <Trash2 size={13} />
                                    </button>
                                  </div>
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

          {/* ══ LOG TAB ═══════════════════════════════════════════════════ */}
          {tab === "log" && (
            <div className="flex flex-col gap-5">
              {/* Non-Sunday cleanup utility */}
              {nonSundayRows.length > 0 && (
                <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(228,148,12,0.35)" }}>
                  <button onClick={() => setSnapPanelOpen((v) => !v)} className="w-full flex items-center gap-3 px-4 py-3 text-left transition-all"
                    style={{ background: "rgba(228,148,12,0.1)" }}>
                    <AlertTriangle size={18} style={{ color: "var(--cla-amber)", flexShrink: 0 }} />
                    <span className="text-sm font-bold flex-1" style={{ color: "var(--cla-amber-light)" }}>
                      {nonSundayRows.length} attendance record{nonSundayRows.length !== 1 ? "s" : ""} not on a Sunday
                    </span>
                    <ChevronRight size={16} style={{ color: "rgba(248,240,230,0.4)", transform: snapPanelOpen ? "rotate(90deg)" : "none", transition: "transform 0.15s" }} />
                  </button>
                  {snapPanelOpen && (
                    <div className="p-4 flex flex-col gap-3" style={{ background: "rgba(228,148,12,0.04)" }}>
                      <p className="text-sm" style={{ color: "rgba(248,240,230,0.6)" }}>
                        These were submitted late and landed on a weekday instead of the Sunday they belong to. Snapping moves each one back to the Sunday of its own week — the time of day is kept, only the date changes.
                      </p>
                      <div className="rounded-lg overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)", maxHeight: 260, overflowY: "auto" }}>
                        <table className="cla-table" style={{ minWidth: "480px" }}>
                          <thead>
                            <tr><th>Name</th><th>Recorded On</th><th></th><th>Snaps To</th></tr>
                          </thead>
                          <tbody>
                            {nonSundayRows.map((r) => {
                              const from = new Date(r.attended_at);
                              const to = new Date(snapToSunday(r.attended_at));
                              return (
                                <tr key={r.id}>
                                  <td className="font-semibold text-sm">{r.member_name}</td>
                                  <td className="text-sm" style={{ color: "#ff8c8c" }}>
                                    {DAY_NAMES[from.getUTCDay()]}, {from.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}
                                  </td>
                                  <td style={{ color: "rgba(248,240,230,0.3)" }}>→</td>
                                  <td className="text-sm font-semibold" style={{ color: "#C8D400" }}>
                                    Sun, {to.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      {snapResult !== null && !snapConfirm && (
                        <div className="flex flex-col gap-1 p-3 rounded-lg text-sm font-semibold" style={{ background: "rgba(107,122,0,0.12)", border: "1px solid rgba(200,212,0,0.3)", color: "#c8d400" }}>
                          <span>✓ {snapResult.updated} record{snapResult.updated !== 1 ? "s" : ""} snapped to Sunday.</span>
                          {snapResult.skipped > 0 && (
                            <span style={{ color: "var(--cla-amber-light)" }}>
                              ⚠ {snapResult.skipped} skipped — that member already has a record for the target Sunday. Resolve as a duplicate in the log below.
                            </span>
                          )}
                        </div>
                      )}
                      {snapError && <p className="text-sm" style={{ color: "#ff6b6b" }}>{snapError}</p>}

                      {snapConfirm ? (
                        <div className="flex flex-col gap-2 p-3 rounded-lg" style={{ background: "rgba(228,148,12,0.1)", border: "1px solid rgba(228,148,12,0.3)" }}>
                          <p className="text-sm font-bold" style={{ color: "var(--cla-amber-light)" }}>
                            Snap all {nonSundayRows.length} record{nonSundayRows.length !== 1 ? "s" : ""} to their Sunday? This updates the stored date directly — no undo, though nothing is deleted.
                          </p>
                          <div className="flex gap-2">
                            <button onClick={() => setSnapConfirm(false)} className="flex-1 py-2 rounded-lg text-sm font-bold" style={{ border: "1px solid rgba(255,255,255,0.15)", color: "rgba(248,240,230,0.6)" }}>Cancel</button>
                            <button onClick={handleSnapAll} disabled={snapping} className="flex-1 py-2 rounded-lg text-sm font-bold"
                              style={{ background: "linear-gradient(135deg,#E89A10,#F8BA18)", color: "#200909" }}>
                              {snapping ? "Snapping…" : "Yes, snap all"}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button onClick={() => { setSnapConfirm(true); setSnapResult(null); }}
                          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold self-start transition-all"
                          style={{ fontFamily: "Barlow Condensed, sans-serif", background: "linear-gradient(135deg,#E89A10,#F8BA18)", color: "#200909" }}>
                          <Wand2 size={14} /> Snap All to Sunday
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Filters */}
              <div className="flex gap-3 flex-wrap">
                <div className="relative w-full sm:flex-1 sm:min-w-[200px]">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "rgba(248,240,230,0.35)" }} />
                  <input type="text" placeholder="Search by name, class, or facilitator…" value={logSearch}
                    onChange={(e) => setLogSearch(e.target.value)} className="cla-input pl-9 text-sm" />
                </div>
                {(["all"] as string[]).concat(Array.from(new Set(rows.map((r) => r.service_slot))).sort()).map((s) => (
                  <button key={s} onClick={() => setFilterSlot(s)}
                    className="px-3 py-2 rounded-full text-sm font-bold transition-all"
                    style={{ minHeight: 44, fontFamily: "Barlow Condensed, sans-serif", background: filterSlot === s ? "linear-gradient(135deg,#E89A10,#F8BA18)" : "rgba(255,255,255,0.05)", color: filterSlot === s ? "#200909" : "rgba(248,240,230,0.6)", border: filterSlot === s ? "none" : "1px solid rgba(228,148,12,0.2)" }}
                  >
                    {s === "all" ? "All Slots" : s.toUpperCase()}
                  </button>
                ))}
              </div>

              {/* Table */}
              <div className="rounded-xl overflow-hidden" style={{ background: "var(--cla-bg-card)", border: "1px solid rgba(228,148,12,0.15)" }}>
                <div className="overflow-x-auto">
                  <table className="cla-table" style={{ minWidth: "700px" }}>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Name</th>
                        <th>Class</th>
                        <th>Facilitator</th>
                        <th>Slot</th>
                        <th>Date</th>
                        <th>Linked</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredLog.length === 0 ? (
                        <tr><td colSpan={8} className="text-center py-12" style={{ color: "rgba(248,240,230,0.35)" }}>No attendance records found.</td></tr>
                      ) : (
                        filteredLog.map((r, idx) => {
                          const isEditingThis  = editLogId === r.id;
                          const isDeletingThis = confirmDeleteLogId === r.id;

                          return (
                            <tr key={r.id}>
                              <td className="text-sm" style={{ color: "rgba(248,240,230,0.35)" }}>{idx + 1}</td>

                              {/* Name — editable */}
                              <td>
                                {isEditingThis ? (
                                  <div className="flex items-center gap-1.5">
                                    <input
                                      autoFocus
                                      className="cla-input text-sm py-1"
                                      style={{ minWidth: 160 }}
                                      value={editLogName}
                                      onChange={(e) => setEditLogName(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter") handleSaveLogEdit(r.id);
                                        if (e.key === "Escape") setEditLogId(null);
                                      }}
                                    />
                                    <button onClick={() => handleSaveLogEdit(r.id)} disabled={savingLog} className="p-1 rounded" style={{ color: "#C8D400" }}>
                                      <Check size={14} />
                                    </button>
                                    <button onClick={() => setEditLogId(null)} className="p-1 rounded" style={{ color: "rgba(248,240,230,0.4)" }}>
                                      <X size={14} />
                                    </button>
                                  </div>
                                ) : (
                                  <span className="font-semibold">{r.member_name}</span>
                                )}
                              </td>

                              <td style={{ color: "rgba(248,240,230,0.7)" }}>{r.class_name ?? <span style={{ color: "rgba(248,240,230,0.25)" }}>—</span>}</td>
                              <td style={{ color: "rgba(248,240,230,0.6)" }}>{r.facilitator_name ?? <span style={{ color: "rgba(248,240,230,0.25)" }}>—</span>}</td>
                              <td><SlotBadge slot={r.service_slot as any} /></td>
                              <td className="text-sm" style={{ color: "rgba(248,240,230,0.5)" }}>
                                {new Date(r.attended_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                              </td>
                              <td>
                                <span className="text-xs font-bold" style={{ color: r.is_linked ? "#C8D400" : "rgba(248,240,230,0.25)" }}>
                                  {r.is_linked ? "Yes" : "No"}
                                </span>
                              </td>

                              {/* Actions */}
                              <td>
                                {isDeletingThis ? (
                                  <div className="flex items-center gap-1.5 whitespace-nowrap">
                                    <span className="text-xs font-bold" style={{ color: "#ff6b6b" }}>Sure?</span>
                                    <button onClick={() => setConfirmDeleteLogId(null)} className="text-xs px-1.5 py-0.5 rounded" style={{ color: "rgba(248,240,230,0.5)", border: "1px solid rgba(255,255,255,0.1)" }}>No</button>
                                    <button onClick={() => handleDeleteLog(r.id)} disabled={deletingLog} className="text-xs px-1.5 py-0.5 rounded font-bold" style={{ background: "rgba(192,40,40,0.25)", color: "#ff6b6b", border: "1px solid rgba(192,40,40,0.4)" }}>
                                      {deletingLog ? "…" : "Yes"}
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1">
                                    <button
                                      onClick={() => { setEditLogId(r.id); setEditLogName(r.member_name); setConfirmDeleteLogId(null); }}
                                      className="p-1.5 rounded-lg transition-all"
                                      style={{ color: "rgba(228,148,12,0.5)" }}
                                      title="Edit name"
                                    >
                                      <Pencil size={13} />
                                    </button>
                                    <button
                                      onClick={() => { setConfirmDeleteLogId(r.id); setEditLogId(null); }}
                                      className="p-1.5 rounded-lg transition-all"
                                      style={{ color: "rgba(192,40,40,0.5)" }}
                                      title="Delete record"
                                    >
                                      <Trash2 size={13} />
                                    </button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })
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

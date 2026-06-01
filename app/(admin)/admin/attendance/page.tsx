"use client";

import { useState, useEffect, useMemo } from "react";
import { Search, Download, GraduationCap, ClipboardList, Pencil, Trash2, Check, X } from "lucide-react";
import { SlotBadge } from "@/components/ui/Badge";
import { createClient } from "@/lib/supabase";
import {
  updateAttendanceName,
  deleteAttendanceRecord,
  renameAttendancePerson,
  deleteAttendancePerson,
} from "@/actions/admin";

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
  normKey: string;
  displayName: string;
  count: number;
}

type Tab = "progress" | "log";

// ── Helpers ──────────────────────────────────────────────────────────────────

function normName(s: string) {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function exportLogCSV(rows: AttendanceRow[]) {
  const csv = [
    ["Name", "Class", "Facilitator", "Slot", "Date", "Linked"].join(","),
    ...rows.map((r) =>
      [
        r.member_name,
        r.class_name ?? "",
        r.facilitator_name ?? "",
        r.service_slot,
        new Date(r.attended_at).toLocaleDateString("en-GB"),
        r.is_linked ? "Yes" : "No",
      ].join(",")
    ),
  ].join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = "cla-attendance.csv";
  a.click();
}

function exportProgressCSV(rows: ProgressRow[], threshold: number) {
  const csv = [
    ["Name", "Sessions", "Status"].join(","),
    ...rows.map((p) =>
      [
        p.displayName,
        p.count,
        p.count >= threshold ? "Ready" : `${threshold - p.count} more needed`,
      ].join(",")
    ),
  ].join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = "cla-graduation-progress.csv";
  a.click();
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AttendancePage() {
  const [tab, setTab] = useState<Tab>("progress");
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Log tab state
  const [logSearch, setLogSearch] = useState("");
  const [filterSlot, setFilterSlot] = useState("all");
  const [editLogId, setEditLogId] = useState<string | null>(null);
  const [editLogName, setEditLogName] = useState("");
  const [savingLog, setSavingLog] = useState(false);
  const [confirmDeleteLogId, setConfirmDeleteLogId] = useState<string | null>(null);
  const [deletingLog, setDeletingLog] = useState(false);

  // Progress tab state
  const [threshold, setThreshold] = useState(8);
  const [progressSearch, setProgressSearch] = useState("");
  const [editPersonKey, setEditPersonKey] = useState<string | null>(null);
  const [editPersonName, setEditPersonName] = useState("");
  const [savingPerson, setSavingPerson] = useState(false);
  const [confirmDeletePersonKey, setConfirmDeletePersonKey] = useState<string | null>(null);
  const [deletingPerson, setDeletingPerson] = useState(false);

  useEffect(() => {
    createClient()
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
          onClick={() =>
            tab === "log"
              ? exportLogCSV(filteredLog)
              : exportProgressCSV(filteredProgress, threshold)
          }
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all"
          style={{ fontFamily: "Barlow Condensed, sans-serif", background: "rgba(228,148,12,0.1)", color: "var(--cla-amber)", border: "1px solid rgba(228,148,12,0.2)" }}
        >
          <Download size={14} />
          Export CSV
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl w-fit" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(228,148,12,0.1)" }}>
        {([
          { key: "progress", label: "Graduation Progress", icon: GraduationCap },
          { key: "log",      label: "Attendance Log",      icon: ClipboardList  },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all"
            style={btnStyle(tab === key)}
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
          {/* ══ PROGRESS TAB ══════════════════════════════════════════════ */}
          {tab === "progress" && (
            <div className="flex flex-col gap-5">

              {/* Threshold + stats */}
              <div className="flex flex-wrap gap-4 items-center">
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl" style={{ background: "var(--cla-bg-card)", border: "1px solid rgba(228,148,12,0.15)" }}>
                  <GraduationCap size={16} style={{ color: "var(--cla-amber)" }} />
                  <span className="text-sm font-bold" style={{ fontFamily: "Barlow Condensed, sans-serif" }}>Graduation threshold</span>
                  <input
                    type="number" min={1} max={52} value={threshold}
                    onChange={(e) => setThreshold(Math.max(1, parseInt(e.target.value) || 1))}
                    className="cla-input text-center font-bold"
                    style={{ width: 64, padding: "4px 8px", fontSize: "1rem" }}
                  />
                  <span className="text-sm" style={{ color: "rgba(248,240,230,0.45)" }}>sessions</span>
                </div>
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
              {/* Filters */}
              <div className="flex gap-3 flex-wrap">
                <div className="relative flex-1 min-w-[200px]">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "rgba(248,240,230,0.35)" }} />
                  <input type="text" placeholder="Search by name, class, or facilitator…" value={logSearch}
                    onChange={(e) => setLogSearch(e.target.value)} className="cla-input pl-9 text-sm" />
                </div>
                {["all", "8am", "10am", "12pm"].map((s) => (
                  <button key={s} onClick={() => setFilterSlot(s)}
                    className="px-3 py-2 rounded-full text-sm font-bold transition-all"
                    style={{ fontFamily: "Barlow Condensed, sans-serif", background: filterSlot === s ? "linear-gradient(135deg,#E89A10,#F8BA18)" : "rgba(255,255,255,0.05)", color: filterSlot === s ? "#200909" : "rgba(248,240,230,0.6)", border: filterSlot === s ? "none" : "1px solid rgba(228,148,12,0.2)" }}
                  >
                    {s === "all" ? "All Slots" : s}
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

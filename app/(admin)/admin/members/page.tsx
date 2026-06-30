"use client";

import { useState, useEffect, useCallback } from "react";
import { Search, Download, Trash2, ArrowUpDown, Clock, CheckCircle, XCircle, ChevronRight, AlertTriangle } from "lucide-react";
import { SlotBadge } from "@/components/ui/Badge";
import { createClient } from "@/lib/supabase";
import { deleteMember } from "@/actions/admin";
import {
  getPendingMembers,
  updatePendingStatus,
  promotePendingMember,
  clearWaitlist,
  type PendingMember,
} from "@/actions/register";
import { downloadXLSX } from "@/lib/xlsx-export";
import type { Member } from "@/lib/types";

interface MemberWithClass extends Member {
  class_name?: string;
  facilitator_name?: string;
  attendance_count: number;
}

type Tab = "members" | "waitlist";

const SLOT_LABELS: Record<string, string> = { "8am": "8 AM", "10am": "10 AM" };

export default function MembersPage() {
  const [tab, setTab] = useState<Tab>("members");

  // ── Members state ─────────────────────────────────────────
  const [members, setMembers]           = useState<MemberWithClass[]>([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [search, setSearch]             = useState("");
  const [filterSlot, setFilterSlot]     = useState<string>("all");
  const [sortByAttendance, setSortByAttendance] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId]   = useState<string | null>(null);
  const [deleting, setDeleting]         = useState(false);
  const [gradThreshold, setGradThreshold] = useState(16);

  // ── Waitlist state ────────────────────────────────────────
  const [pending, setPending]           = useState<PendingMember[]>([]);
  const [pendingLoading, setPendingLoading] = useState(true);
  const [promotingId, setPromotingId]   = useState<string | null>(null);
  const [dismissingId, setDismissingId] = useState<string | null>(null);
  const [pendingFeedback, setPendingFeedback] = useState<{ id: string; msg: string; ok: boolean } | null>(null);
  const [promoteSlots, setPromoteSlots]       = useState<Record<string, string>>({});
  const [clearingWaitlist, setClearingWaitlist] = useState(false);
  const [confirmClearWaitlist, setConfirmClearWaitlist] = useState(false);

  // ── Load members ──────────────────────────────────────────
  useEffect(() => {
    const supabase = createClient();
    Promise.all([
      supabase.from("members").select("*, classes(name, facilitators(full_name))").order("registered_at", { ascending: false }),
      supabase.from("attendance").select("member_id").not("member_id", "is", null),
      supabase.from("app_settings").select("key, value"),
    ]).then(([{ data: memberData }, { data: attData }, { data: settingsData }]) => {
      const settingsMap: Record<string, string> = {};
      for (const row of settingsData ?? []) settingsMap[row.key] = row.value;
      const totalSessions = parseInt(settingsMap.total_sessions) || 21;
      const thresholdPct  = parseInt(settingsMap.attendance_threshold_pct) || 75;
      setGradThreshold(Math.ceil((totalSessions * thresholdPct) / 100));

      const countById: Record<string, number> = {};
      for (const r of attData ?? []) {
        if (r.member_id) countById[r.member_id] = (countById[r.member_id] ?? 0) + 1;
      }
      setMembers((memberData ?? []).map((m: any) => ({
        ...m,
        class_name:       m.classes?.name,
        facilitator_name: m.classes?.facilitators?.full_name,
        attendance_count: countById[m.id] ?? 0,
      })));
      setMembersLoading(false);
    });
  }, []);

  // ── Load waitlist ─────────────────────────────────────────
  const loadPending = useCallback(async () => {
    setPendingLoading(true);
    const rows = await getPendingMembers();
    setPending(rows);
    setPendingLoading(false);
  }, []);

  useEffect(() => { loadPending(); }, [loadPending]);

  // ── Members helpers ───────────────────────────────────────
  const slots = Array.from(new Set(members.map((m) => m.preferred_slot))).sort();
  const filtered = members
    .filter((m) => {
      const q = search.toLowerCase();
      const fullName = `${m.first_name} ${m.last_name}`.toLowerCase();
      const matchSearch = q === "" || fullName.includes(q) || m.phone.includes(q) || (m.email ?? "").toLowerCase().includes(q);
      return matchSearch && (filterSlot === "all" || m.preferred_slot === filterSlot);
    })
    .sort((a, b) => sortByAttendance ? b.attendance_count - a.attendance_count : 0);

  async function handleDeleteMember(id: string) {
    setDeleting(true);
    const result = await deleteMember(id);
    setDeleting(false);
    if (result.success) { setMembers((prev) => prev.filter((m) => m.id !== id)); setConfirmDeleteId(null); }
  }

  function exportCSV() {
    const rows = [
      ["First Name", "Last Name", "Phone", "Email", "Slot", "Class", "Facilitator", "Sessions Attended", "Registered"],
      ...filtered.map((m) => [
        m.first_name, m.last_name, m.phone, m.email ?? "",
        m.preferred_slot, m.class_name ?? "", m.facilitator_name ?? "",
        m.attendance_count,
        new Date(m.registered_at).toLocaleDateString("en-GB"),
      ]),
    ];
    downloadXLSX(rows, "cla-members.xlsx");
  }

  // ── Waitlist helpers ──────────────────────────────────────
  const waitingCount = pending.filter((p) => p.status === "waiting").length;

  async function handlePromote(p: PendingMember, slot: string) {
    if (!slot) return;
    setPromotingId(p.id);
    setPendingFeedback(null);
    const result = await promotePendingMember(p.id, {
      first_name: p.first_name,
      last_name:  p.last_name,
      phone:      p.phone ?? "",
      email:      p.email ?? undefined,
    }, slot);
    setPromotingId(null);
    if (result.success) {
      setPendingFeedback({ id: p.id, msg: `Promoted to ${result.class_name} (${SLOT_LABELS[result.slot!] ?? result.slot})`, ok: true });
      loadPending();
    } else {
      setPendingFeedback({ id: p.id, msg: result.error ?? "Failed to promote.", ok: false });
    }
  }

  async function handleDismiss(id: string) {
    setDismissingId(id);
    await updatePendingStatus(id, "dismissed");
    setDismissingId(null);
    loadPending();
  }

  async function handleClearWaitlist() {
    setClearingWaitlist(true);
    await clearWaitlist();
    setClearingWaitlist(false);
    setConfirmClearWaitlist(false);
    loadPending();
  }

  // ── Tab bar ───────────────────────────────────────────────
  const tabStyle = (active: boolean) => ({
    padding: "0.5rem 1.25rem",
    borderRadius: "0.5rem",
    fontFamily: "Barlow Condensed, sans-serif",
    fontWeight: 700,
    fontSize: "0.95rem",
    cursor: "pointer" as const,
    border: "none",
    transition: "all 0.15s",
    background: active ? "linear-gradient(135deg, #E89A10, #F8BA18)" : "rgba(255,255,255,0.04)",
    color: active ? "#200909" : "rgba(248,240,230,0.55)",
  });

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-extrabold" style={{ fontFamily: "Barlow Condensed, sans-serif" }}>Members</h1>
          <p className="text-sm mt-0.5" style={{ color: "rgba(248,240,230,0.5)" }}>
            {members.length} registered · {waitingCount} on waitlist
          </p>
        </div>
        {tab === "members" && (
          <button
            onClick={exportCSV}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all"
            style={{ fontFamily: "Barlow Condensed, sans-serif", background: "rgba(228,148,12,0.1)", color: "var(--cla-amber)", border: "1px solid rgba(228,148,12,0.2)" }}
          >
            <Download size={14} /> Export CSV
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        <button style={tabStyle(tab === "members")} onClick={() => setTab("members")}>Members</button>
        <button style={tabStyle(tab === "waitlist")} onClick={() => setTab("waitlist")}>
          Waitlist
          {waitingCount > 0 && (
            <span
              className="ml-2 px-1.5 py-0.5 rounded-full text-xs font-bold"
              style={{ background: tab === "waitlist" ? "rgba(32,9,9,0.3)" : "rgba(228,148,12,0.2)", color: tab === "waitlist" ? "#200909" : "var(--cla-amber-light)" }}
            >
              {waitingCount}
            </span>
          )}
        </button>
      </div>

      {/* ── MEMBERS TAB ──────────────────────────────────── */}
      {tab === "members" && (
        <>
          <div className="flex gap-3 flex-wrap">
            <div className="relative w-full sm:flex-1 sm:min-w-[200px]">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "rgba(248,240,230,0.35)" }} />
              <input type="text" placeholder="Search by name, phone, or email…" value={search} onChange={(e) => setSearch(e.target.value)} className="cla-input pl-9 text-sm" />
            </div>
            {["all", ...slots].map((s) => (
              <button key={s} onClick={() => setFilterSlot(s)} className="px-3 py-2 rounded-full text-sm font-bold transition-all"
                style={{ minHeight: 44, fontFamily: "Barlow Condensed, sans-serif", background: filterSlot === s ? "linear-gradient(135deg, #E89A10, #F8BA18)" : "rgba(255,255,255,0.05)", color: filterSlot === s ? "#200909" : "rgba(248,240,230,0.6)", border: filterSlot === s ? "none" : "1px solid rgba(228,148,12,0.2)" }}>
                {s === "all" ? "All Slots" : s.toUpperCase()}
              </button>
            ))}
          </div>

          {membersLoading ? (
            <div className="flex items-center justify-center h-48">
              <div className="spinner" style={{ width: 28, height: 28, borderTopColor: "var(--cla-amber)", borderColor: "rgba(228,148,12,0.2)" }} />
            </div>
          ) : (
            <div className="rounded-xl overflow-hidden" style={{ background: "var(--cla-bg-card)", border: "1px solid rgba(228,148,12,0.15)" }}>
              <div className="overflow-x-auto">
                <table className="cla-table" style={{ minWidth: "700px" }}>
                  <thead>
                    <tr>
                      <th>#</th><th>Name</th><th>Phone</th><th>Email</th><th>Slot</th><th>Class</th>
                      <th>
                        <button onClick={() => setSortByAttendance((v) => !v)} className="flex items-center gap-1 font-bold transition-colors" style={{ color: sortByAttendance ? "var(--cla-amber)" : "inherit" }}>
                          Attended <ArrowUpDown size={11} />
                        </button>
                      </th>
                      <th>Registered</th><th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 ? (
                      <tr><td colSpan={9} className="text-center py-12" style={{ color: "rgba(248,240,230,0.35)" }}>No members found.</td></tr>
                    ) : filtered.map((m, idx) => (
                      <tr key={m.id}>
                        <td className="text-sm" style={{ color: "rgba(248,240,230,0.35)" }}>{idx + 1}</td>
                        <td className="font-semibold">{m.first_name} {m.last_name}</td>
                        <td style={{ color: "rgba(248,240,230,0.7)" }}>{m.phone}</td>
                        <td style={{ color: "rgba(248,240,230,0.55)" }}>{m.email ?? <span style={{ color: "rgba(248,240,230,0.25)" }}>—</span>}</td>
                        <td><SlotBadge slot={m.preferred_slot} /></td>
                        <td style={{ color: "rgba(248,240,230,0.7)" }}>{m.class_name ?? <span style={{ color: "rgba(248,240,230,0.3)" }}>Unassigned</span>}</td>
                        <td>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm tabular-nums" style={{ color: m.attendance_count === 0 ? "rgba(248,240,230,0.25)" : m.attendance_count >= gradThreshold ? "#C8D400" : "var(--cla-amber)", minWidth: 20 }}>{m.attendance_count}</span>
                            {m.attendance_count > 0 && (
                              <div className="rounded-full overflow-hidden" style={{ width: 48, height: 5, background: "rgba(255,255,255,0.07)", flexShrink: 0 }}>
                                <div className="h-full rounded-full" style={{ width: `${Math.min((m.attendance_count / gradThreshold) * 100, 100)}%`, background: m.attendance_count >= gradThreshold ? "linear-gradient(90deg,#a8c000,#C8D400)" : "linear-gradient(90deg,#E89A10,#F8BA18)" }} />
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="text-sm" style={{ color: "rgba(248,240,230,0.5)" }}>{new Date(m.registered_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</td>
                        <td>
                          {confirmDeleteId === m.id ? (
                            <div className="flex items-center gap-2 whitespace-nowrap">
                              <span className="text-xs font-bold" style={{ color: "#ff6b6b" }}>Delete?</span>
                              <button onClick={() => setConfirmDeleteId(null)} className="text-xs px-2 py-1 rounded" style={{ color: "rgba(248,240,230,0.5)", border: "1px solid rgba(255,255,255,0.1)" }}>No</button>
                              <button onClick={() => handleDeleteMember(m.id)} disabled={deleting} className="text-xs px-2 py-1 rounded font-bold" style={{ background: "rgba(192,40,40,0.25)", color: "#ff6b6b", border: "1px solid rgba(192,40,40,0.4)" }}>{deleting ? "…" : "Yes, delete"}</button>
                            </div>
                          ) : (
                            <button onClick={() => setConfirmDeleteId(m.id)} className="p-1.5 rounded-lg transition-all" style={{ color: "rgba(192,40,40,0.5)" }} title="Delete member"><Trash2 size={15} /></button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {filtered.length > 0 && (
                <div className="px-4 py-3 text-xs" style={{ borderTop: "1px solid rgba(255,255,255,0.05)", color: "rgba(248,240,230,0.4)" }}>
                  Showing {filtered.length} of {members.length} members
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ── WAITLIST TAB ──────────────────────────────────── */}
      {tab === "waitlist" && (
        <>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3 p-4 rounded-xl text-sm flex-1" style={{ background: "rgba(228,148,12,0.07)", border: "1px solid rgba(228,148,12,0.2)" }}>
              <Clock size={15} style={{ color: "var(--cla-amber)", flexShrink: 0 }} />
              <span style={{ color: "rgba(248,240,230,0.65)" }}>
                Waitlist is ordered <strong style={{ color: "var(--cla-amber-light)" }}>first-come, first-served</strong> by registration time.
                Promote moves the person directly into an available class slot.
              </span>
            </div>
            {pending.length > 0 && (
              confirmClearWaitlist ? (
                <div className="flex items-center gap-2 shrink-0">
                  <AlertTriangle size={14} style={{ color: "#ff6b6b" }} />
                  <span className="text-xs font-bold" style={{ color: "#ff6b6b" }}>Clear all {pending.length} entries?</span>
                  <button onClick={() => setConfirmClearWaitlist(false)} className="text-xs px-2 py-1 rounded" style={{ color: "rgba(248,240,230,0.5)", border: "1px solid rgba(255,255,255,0.1)" }}>Cancel</button>
                  <button onClick={handleClearWaitlist} disabled={clearingWaitlist} className="text-xs px-3 py-1 rounded font-bold"
                    style={{ background: "rgba(192,40,40,0.25)", color: "#ff6b6b", border: "1px solid rgba(192,40,40,0.4)" }}>
                    {clearingWaitlist ? "Clearing…" : "Yes, clear"}
                  </button>
                </div>
              ) : (
                <button onClick={() => setConfirmClearWaitlist(true)} className="shrink-0 flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-all"
                  style={{ background: "rgba(192,40,40,0.12)", color: "#ff6b6b", border: "1px solid rgba(192,40,40,0.3)" }}>
                  <Trash2 size={13} /> Clear Waitlist
                </button>
              )
            )}
          </div>

          {pendingLoading ? (
            <div className="flex items-center justify-center h-48">
              <div className="spinner" style={{ width: 28, height: 28, borderTopColor: "var(--cla-amber)", borderColor: "rgba(228,148,12,0.2)" }} />
            </div>
          ) : pending.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-20" style={{ color: "rgba(248,240,230,0.3)" }}>
              <CheckCircle size={36} style={{ color: "rgba(200,212,0,0.4)" }} />
              <p className="text-sm">No one on the waitlist.</p>
            </div>
          ) : (
            <div className="rounded-xl overflow-hidden" style={{ background: "var(--cla-bg-card)", border: "1px solid rgba(228,148,12,0.15)" }}>
              <div className="overflow-x-auto">
                <table className="cla-table" style={{ minWidth: "680px" }}>
                  <thead>
                    <tr>
                      <th>Position</th>
                      <th>Name</th>
                      <th>Phone</th>
                      <th>Email</th>
                      <th>Pref. Slot</th>
                      <th>Registered</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pending.map((p, idx) => {
                      const isWaiting   = p.status === "waiting";
                      const isPromoted  = p.status === "promoted";
                      const isDismissed = p.status === "dismissed";
                      const feedback    = pendingFeedback?.id === p.id ? pendingFeedback : null;
                      return (
                        <tr key={p.id} style={{ opacity: isDismissed ? 0.45 : 1 }}>
                          <td className="font-bold tabular-nums" style={{ color: isWaiting ? "var(--cla-amber)" : "rgba(248,240,230,0.3)" }}>
                            #{idx + 1}
                          </td>
                          <td className="font-semibold">{p.first_name} {p.last_name}</td>
                          <td style={{ color: "rgba(248,240,230,0.7)" }}>{p.phone ?? "—"}</td>
                          <td style={{ color: "rgba(248,240,230,0.55)" }}>{p.email ?? <span style={{ color: "rgba(248,240,230,0.25)" }}>—</span>}</td>
                          <td>
                            <span className="badge badge-amber">{SLOT_LABELS[p.preferred_slot ?? ""] ?? p.preferred_slot ?? "—"}</span>
                          </td>
                          <td className="text-sm" style={{ color: "rgba(248,240,230,0.5)" }}>
                            {new Date(p.registered_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                            <div className="text-xs mt-0.5" style={{ color: "rgba(248,240,230,0.3)" }}>
                              {new Date(p.registered_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                            </div>
                          </td>
                          <td>
                            {isWaiting  && <span className="badge badge-amber">Waiting</span>}
                            {isPromoted && (
                              <div>
                                <span className="badge badge-green">Promoted</span>
                                {p.promoted_class && <div className="text-xs mt-0.5" style={{ color: "rgba(248,240,230,0.4)" }}>{p.promoted_class}</div>}
                              </div>
                            )}
                            {isDismissed && <span className="badge badge-gray">Dismissed</span>}
                          </td>
                          <td>
                            {feedback && (
                              <div className="text-xs mb-1.5 flex items-center gap-1" style={{ color: feedback.ok ? "#C8D400" : "#ff6b6b" }}>
                                {feedback.ok ? <CheckCircle size={12} /> : <XCircle size={12} />}
                                {feedback.msg}
                              </div>
                            )}
                            {isWaiting && (
                              <div className="flex flex-col gap-2">
                                <div className="flex gap-1.5 items-center">
                                  <span className="text-xs" style={{ color: "rgba(248,240,230,0.4)" }}>Slot:</span>
                                  {["8am", "10am"].map((s) => (
                                    <button key={s}
                                      onClick={() => setPromoteSlots((prev) => ({ ...prev, [p.id]: s }))}
                                      className="px-2 py-0.5 rounded text-xs font-bold transition-all"
                                      style={{ background: promoteSlots[p.id] === s ? "linear-gradient(135deg,#E89A10,#F8BA18)" : "rgba(255,255,255,0.06)", color: promoteSlots[p.id] === s ? "#200909" : "rgba(248,240,230,0.55)", border: promoteSlots[p.id] === s ? "none" : "1px solid rgba(228,148,12,0.2)" }}
                                    >{SLOT_LABELS[s]}</button>
                                  ))}
                                </div>
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() => { const s = promoteSlots[p.id]; if (s) handlePromote(p, s); }}
                                    disabled={promotingId === p.id || !promoteSlots[p.id]}
                                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
                                    style={{ background: promoteSlots[p.id] ? "linear-gradient(135deg,#E89A10,#F8BA18)" : "rgba(228,148,12,0.15)", color: promoteSlots[p.id] ? "#200909" : "rgba(248,240,230,0.35)", opacity: promotingId === p.id ? 0.6 : 1 }}
                                  >
                                    {promotingId === p.id ? "…" : <><ChevronRight size={12} />Promote</>}
                                  </button>
                                  <button
                                    onClick={() => handleDismiss(p.id)}
                                    disabled={dismissingId === p.id}
                                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
                                    style={{ background: "rgba(192,40,40,0.15)", color: "#ff6b6b", border: "1px solid rgba(192,40,40,0.3)" }}
                                  >
                                    {dismissingId === p.id ? "…" : "Dismiss"}
                                  </button>
                                </div>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="px-4 py-3 text-xs" style={{ borderTop: "1px solid rgba(255,255,255,0.05)", color: "rgba(248,240,230,0.4)" }}>
                {waitingCount} waiting · {pending.filter((p) => p.status === "promoted").length} promoted · {pending.filter((p) => p.status === "dismissed").length} dismissed
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

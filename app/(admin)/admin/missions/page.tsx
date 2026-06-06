"use client";

import { useState, useEffect, useMemo } from "react";
import { Download, Search, Target, CheckCircle2, Clock } from "lucide-react";
import { getMissionsData, type MissionReadyMember, type MissionNotReadyMember } from "@/actions/missions";

type Tab = "ready" | "notReady";

export default function MissionsPage() {
  const [tab, setTab] = useState<Tab>("ready");
  const [ready, setReady] = useState<MissionReadyMember[]>([]);
  const [notReady, setNotReady] = useState<MissionNotReadyMember[]>([]);
  const [threshold, setThreshold] = useState(0);
  const [settings, setSettings] = useState({ total_sessions: 0, attendance_threshold_pct: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    getMissionsData().then((data) => {
      setReady(data.ready);
      setNotReady(data.notReady);
      setThreshold(data.threshold);
      setSettings(data.settings);
      setLoading(false);
    });
  }, []);

  const filteredNotReady = useMemo(() => {
    const q = search.toLowerCase();
    return q === ""
      ? notReady
      : notReady.filter((m) =>
          `${m.first_name} ${m.last_name}`.toLowerCase().includes(q)
        );
  }, [notReady, search]);

  const filteredReady = useMemo(() => {
    const q = search.toLowerCase();
    return q === ""
      ? ready
      : ready.filter((m) =>
          `${m.first_name} ${m.last_name}`.toLowerCase().includes(q)
        );
  }, [ready, search]);

  function downloadCSV(type: "ready" | "notready") {
    window.open(`/admin/missions/export?type=${type}`, "_blank");
  }

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
            Missions Ready
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "rgba(248,240,230,0.5)" }}>
            Threshold: {threshold} of {settings.total_sessions} sessions ({settings.attendance_threshold_pct}%)
          </p>
        </div>
        <button
          onClick={() => downloadCSV(tab === "ready" ? "ready" : "notready")}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all"
          style={{ fontFamily: "Barlow Condensed, sans-serif", background: "rgba(228,148,12,0.1)", color: "var(--cla-amber)", border: "1px solid rgba(228,148,12,0.2)" }}
        >
          <Download size={14} />
          Export CSV
        </button>
      </div>

      {/* Summary chips */}
      {!loading && (
        <div className="flex gap-3 flex-wrap">
          <div className="px-4 py-2 rounded-xl text-sm font-bold" style={{ background: "rgba(200,212,0,0.1)", border: "1px solid rgba(200,212,0,0.25)", color: "#C8D400" }}>
            <CheckCircle2 size={14} className="inline mr-1.5 mb-0.5" />
            {ready.length} missions ready
          </div>
          <div className="px-4 py-2 rounded-xl text-sm font-bold" style={{ background: "rgba(228,148,12,0.1)", border: "1px solid rgba(228,148,12,0.25)", color: "var(--cla-amber)" }}>
            <Clock size={14} className="inline mr-1.5 mb-0.5" />
            {notReady.length} still preparing
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl w-fit" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(228,148,12,0.1)" }}>
        <button onClick={() => { setTab("ready"); setSearch(""); }} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all" style={btnStyle(tab === "ready")}>
          <CheckCircle2 size={15} /> Ready
        </button>
        <button onClick={() => { setTab("notReady"); setSearch(""); }} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all" style={btnStyle(tab === "notReady")}>
          <Clock size={15} /> Not Ready
        </button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "rgba(248,240,230,0.35)" }} />
        <input
          type="text"
          placeholder="Search by name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="cla-input pl-9 text-sm"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="spinner" style={{ width: 28, height: 28, borderTopColor: "var(--cla-amber)", borderColor: "rgba(228,148,12,0.2)" }} />
        </div>
      ) : (
        <>
          {/* ══ READY TAB ════════════════════════════════════════════════ */}
          {tab === "ready" && (
            <div className="rounded-xl overflow-hidden" style={{ background: "var(--cla-bg-card)", border: "1px solid rgba(228,148,12,0.15)" }}>
              <div className="overflow-x-auto">
                <table className="cla-table" style={{ minWidth: "700px" }}>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>First Name</th>
                      <th>Last Name</th>
                      <th>Phone</th>
                      <th>Email</th>
                      <th>Class</th>
                      <th>Slot</th>
                      <th>Sessions</th>
                      <th>Required</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredReady.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="text-center py-12" style={{ color: "rgba(248,240,230,0.35)" }}>
                          {ready.length === 0 ? "No members have reached the threshold yet." : "No results match your search."}
                        </td>
                      </tr>
                    ) : (
                      filteredReady.map((m, idx) => (
                        <tr key={m.id}>
                          <td className="text-sm" style={{ color: "rgba(248,240,230,0.35)" }}>{idx + 1}</td>
                          <td className="font-semibold">{m.first_name}</td>
                          <td className="font-semibold">{m.last_name}</td>
                          <td style={{ color: "rgba(248,240,230,0.7)" }}>{m.phone}</td>
                          <td style={{ color: "rgba(248,240,230,0.55)" }}>
                            {m.email ?? <span style={{ color: "rgba(248,240,230,0.25)" }}>—</span>}
                          </td>
                          <td style={{ color: "rgba(248,240,230,0.7)" }}>
                            {m.class_name ?? <span style={{ color: "rgba(248,240,230,0.3)" }}>—</span>}
                          </td>
                          <td style={{ color: "rgba(248,240,230,0.6)" }}>
                            {m.slot ? m.slot.toUpperCase() : <span style={{ color: "rgba(248,240,230,0.3)" }}>—</span>}
                          </td>
                          <td>
                            <span className="font-bold" style={{ color: "#C8D400" }}>{m.sessions_attended}</span>
                          </td>
                          <td style={{ color: "rgba(248,240,230,0.45)" }}>{m.sessions_required}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              {filteredReady.length > 0 && (
                <div className="px-4 py-3 text-xs" style={{ borderTop: "1px solid rgba(255,255,255,0.05)", color: "rgba(248,240,230,0.4)" }}>
                  {filteredReady.length} member{filteredReady.length !== 1 ? "s" : ""} missions ready
                </div>
              )}
            </div>
          )}

          {/* ══ NOT READY TAB ════════════════════════════════════════════ */}
          {tab === "notReady" && (
            <div className="flex flex-col gap-2">
              {filteredNotReady.length === 0 ? (
                <div className="cla-card p-8 text-center" style={{ color: "rgba(248,240,230,0.35)" }}>
                  {notReady.length === 0 ? "All members have reached the threshold." : "No results match your search."}
                </div>
              ) : (
                filteredNotReady.map((m) => {
                  const pct = Math.min((m.sessions_attended / m.sessions_required) * 100, 100);
                  const isClose = m.needs <= 3;
                  return (
                    <div
                      key={m.id}
                      className="cla-card px-5 py-4 flex items-center gap-4"
                    >
                      {/* Avatar / initials */}
                      <div
                        className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold"
                        style={{ background: "rgba(228,148,12,0.12)", color: "var(--cla-amber)", fontFamily: "Barlow Condensed, sans-serif" }}
                      >
                        {m.first_name[0]}{m.last_name[0]}
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="font-semibold truncate">
                          {m.first_name} {m.last_name}
                        </p>
                        <p className="text-sm mt-0.5" style={{ color: "rgba(248,240,230,0.5)" }}>
                          Attended {m.sessions_attended} of {m.sessions_required} required sessions.{" "}
                          <span style={{ color: isClose ? "var(--cla-amber)" : "rgba(248,240,230,0.35)" }}>
                            Needs {m.needs} more.
                          </span>
                        </p>
                        {/* Progress bar */}
                        <div className="mt-2 rounded-full overflow-hidden" style={{ height: 4, background: "rgba(255,255,255,0.07)" }}>
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${pct}%`,
                              background: isClose
                                ? "linear-gradient(90deg,#E89A10,#F8BA18)"
                                : "rgba(228,148,12,0.35)",
                            }}
                          />
                        </div>
                      </div>

                      <div className="shrink-0 text-right">
                        <span className="text-xl font-bold tabular-nums" style={{ fontFamily: "Barlow Condensed, sans-serif", color: isClose ? "var(--cla-amber)" : "rgba(248,240,230,0.35)" }}>
                          {m.sessions_attended}
                          <span className="text-sm font-normal" style={{ color: "rgba(248,240,230,0.3)" }}>/{m.sessions_required}</span>
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
              {filteredNotReady.length > 0 && (
                <p className="text-xs px-1" style={{ color: "rgba(248,240,230,0.3)" }}>
                  {filteredNotReady.length} member{filteredNotReady.length !== 1 ? "s" : ""} still preparing · sorted by sessions (highest first)
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

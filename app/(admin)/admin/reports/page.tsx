"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Send,
  Eye,
  RefreshCw,
  FileText,
  Clock,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  CheckCircle,
  History,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  getFacilitators,
  getReportPreview,
  sendReport,
  getReportHistory,
  type ReportPreviewData,
  type ReportHistoryRow,
} from "@/actions/reports";
import { ADMIN_EMAIL } from "@/lib/config";
import { createClient } from "@/lib/supabase";

const SLOT_LABELS: Record<string, string> = {
  "8am": "8:00 AM",
  "10am": "10:00 AM",
  "12pm": "12:00 PM",
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function fmtDatetime(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ReportsPage() {
  const [facilitators, setFacilitators] = useState<
    { id: string; full_name: string; email: string | null }[]
  >([]);
  const [facilitatorId, setFacilitatorId] = useState("");
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));

  const [previewing, setPreviewing] = useState(false);
  const [sending, setSending] = useState(false);
  const [preview, setPreview] = useState<ReportPreviewData | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [sendResult, setSendResult] = useState<{ success: boolean; message: string } | null>(null);

  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [history, setHistory] = useState<ReportHistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  // Load facilitators on mount
  useEffect(() => {
    getFacilitators().then(setFacilitators);

    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.email === ADMIN_EMAIL) {
        setIsSuperAdmin(true);
      }
    });
  }, []);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    const rows = await getReportHistory();
    setHistory(rows);
    setHistoryLoading(false);
  }, []);

  useEffect(() => {
    if (isSuperAdmin) loadHistory();
  }, [isSuperAdmin, loadHistory]);

  async function handlePreview() {
    if (!facilitatorId) return;
    setPreviewing(true);
    setPreviewError("");
    setPreview(null);
    setSendResult(null);

    const result = await getReportPreview(facilitatorId, dateFrom, dateTo);
    setPreviewing(false);

    if (result.success) {
      setPreview(result.data);
    } else {
      setPreviewError(result.error);
    }
  }

  async function handleSend() {
    if (!preview) return;
    setSending(true);
    setSendResult(null);

    const result = await sendReport(preview);
    setSending(false);

    if (result.success) {
      setSendResult({
        success: true,
        message: `Report sent to ${preview.facilitatorEmail}. A snapshot has been saved.`,
      });
      if (isSuperAdmin) loadHistory();
    } else {
      setSendResult({
        success: false,
        message: result.error ?? "Failed to send report.",
      });
    }
  }

  const selectedFacilitator = facilitators.find((f) => f.id === facilitatorId);

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1
          className="text-3xl font-extrabold"
          style={{ fontFamily: "Barlow Condensed, sans-serif" }}
        >
          Facilitator Reports
        </h1>
        <p className="text-sm mt-0.5" style={{ color: "rgba(248,240,230,0.5)" }}>
          Preview and email attendance reports to facilitators
        </p>
      </div>

      {/* Builder card */}
      <div
        className="rounded-xl p-6 flex flex-col gap-5"
        style={{ background: "var(--cla-bg-card)", border: "1px solid rgba(228,148,12,0.15)" }}
      >
        <p
          className="text-xs font-bold uppercase tracking-widest"
          style={{ fontFamily: "Barlow Condensed, sans-serif", color: "rgba(228,148,12,0.6)" }}
        >
          Build Report
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Facilitator picker */}
          <div className="flex flex-col gap-1.5">
            <label
              className="text-sm font-semibold"
              style={{ fontFamily: "Barlow Condensed, sans-serif" }}
            >
              Facilitator
            </label>
            <select
              value={facilitatorId}
              onChange={(e) => {
                setFacilitatorId(e.target.value);
                setPreview(null);
                setSendResult(null);
                setPreviewError("");
              }}
              className="cla-input"
            >
              <option value="">— Select facilitator —</option>
              {facilitators.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.full_name}
                  {f.email ? `` : " (no email)"}
                </option>
              ))}
            </select>
            {selectedFacilitator && (
              <p className="text-xs" style={{ color: "rgba(248,240,230,0.4)" }}>
                {selectedFacilitator.email ?? (
                  <span style={{ color: "#ff6b6b" }}>No email — report can be previewed but not sent</span>
                )}
              </p>
            )}
          </div>

          {/* Date from */}
          <div className="flex flex-col gap-1.5">
            <label
              className="text-sm font-semibold"
              style={{ fontFamily: "Barlow Condensed, sans-serif" }}
            >
              From
            </label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                setPreview(null);
                setSendResult(null);
              }}
              className="cla-input"
              style={{ colorScheme: "dark" }}
            />
          </div>

          {/* Date to */}
          <div className="flex flex-col gap-1.5">
            <label
              className="text-sm font-semibold"
              style={{ fontFamily: "Barlow Condensed, sans-serif" }}
            >
              To
            </label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                setPreview(null);
                setSendResult(null);
              }}
              className="cla-input"
              style={{ colorScheme: "dark" }}
            />
          </div>
        </div>

        <div className="flex gap-3">
          <Button
            variant="secondary"
            loading={previewing}
            disabled={!facilitatorId || !dateFrom || !dateTo}
            onClick={handlePreview}
          >
            <Eye size={16} />
            Preview Report
          </Button>
        </div>
      </div>

      {/* Preview error */}
      {previewError && (
        <div
          className="flex items-start gap-3 p-4 rounded-xl text-sm"
          style={{
            background: "rgba(139,26,26,0.15)",
            border: "1px solid rgba(139,26,26,0.3)",
            color: "#ff6b6b",
          }}
        >
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          {previewError}
        </div>
      )}

      {/* Send result feedback */}
      {sendResult && (
        <div
          className="flex items-start gap-3 p-4 rounded-xl text-sm"
          style={{
            background: sendResult.success
              ? "rgba(107,122,0,0.12)"
              : "rgba(139,26,26,0.15)",
            border: `1px solid ${sendResult.success ? "rgba(200,212,0,0.3)" : "rgba(139,26,26,0.3)"}`,
            color: sendResult.success ? "#c8d400" : "#ff6b6b",
          }}
        >
          {sendResult.success ? (
            <CheckCircle size={16} className="shrink-0 mt-0.5" />
          ) : (
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
          )}
          {sendResult.message}
        </div>
      )}

      {/* Preview panel */}
      {preview && (
        <div
          className="rounded-xl overflow-hidden"
          style={{ border: "1px solid rgba(228,148,12,0.2)" }}
        >
          {/* Preview header */}
          <div
            className="px-6 py-4 flex items-center justify-between gap-4 flex-wrap"
            style={{ background: "#200909", borderBottom: "1px solid rgba(228,148,12,0.15)" }}
          >
            <div className="flex items-center gap-3">
              <FileText size={18} style={{ color: "var(--cla-amber)" }} />
              <div>
                <p
                  className="font-bold text-base"
                  style={{ fontFamily: "Barlow Condensed, sans-serif", color: "#F8BA18" }}
                >
                  {preview.facilitatorName}
                </p>
                <p className="text-xs" style={{ color: "rgba(248,240,230,0.5)" }}>
                  {fmtDate(preview.dateFrom)} — {fmtDate(preview.dateTo)} ·{" "}
                  <span style={{ color: "var(--cla-amber)" }}>
                    {preview.classes.reduce((s, c) => s + c.uniqueMembers, 0)} unique members
                  </span>
                  {" · "}{preview.totalAttendance} sessions · {preview.classes.length} {preview.classes.length === 1 ? "class" : "classes"}
                </p>
              </div>
            </div>

            <Button
              variant="primary"
              size="sm"
              loading={sending}
              disabled={!preview.facilitatorEmail || !!sendResult?.success}
              onClick={handleSend}
              title={!preview.facilitatorEmail ? "No email on file" : ""}
            >
              <Send size={15} />
              Send to {preview.facilitatorEmail || "facilitator"}
            </Button>
          </div>

          {/* Class breakdown */}
          <div className="flex flex-col divide-y" style={{ background: "#1e0808", borderColor: "rgba(228,148,12,0.08)" }}>
            {preview.classes.map((cls) => (
              <div key={cls.name} className="px-6 py-4">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <span
                      className="font-bold text-sm"
                      style={{ fontFamily: "Barlow Condensed, sans-serif", color: "#F8BA18" }}
                    >
                      {cls.name}
                    </span>
                    <span
                      className="text-xs px-2 py-0.5 rounded-full"
                      style={{
                        background: "rgba(228,148,12,0.12)",
                        color: "rgba(248,240,230,0.5)",
                      }}
                    >
                      {SLOT_LABELS[cls.slot] ?? cls.slot}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className="text-xs font-bold"
                      style={{
                        fontFamily: "Barlow Condensed, sans-serif",
                        color: cls.uniqueMembers > 0 ? "var(--cla-amber)" : "rgba(248,240,230,0.3)",
                      }}
                    >
                      {cls.uniqueMembers} {cls.uniqueMembers === 1 ? "member" : "members"}
                    </span>
                    <span className="text-xs" style={{ color: "rgba(248,240,230,0.3)" }}>
                      {cls.attendanceCount} sessions
                    </span>
                  </div>
                </div>

                {cls.members.length === 0 ? (
                  <p className="text-xs" style={{ color: "rgba(248,240,230,0.3)" }}>
                    No attendance recorded for this class in the selected period.
                  </p>
                ) : (
                  <div className="rounded-lg overflow-hidden" style={{ border: "1px solid rgba(228,148,12,0.1)" }}>
                    <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ background: "rgba(34,16,16,0.8)", borderBottom: "1px solid rgba(228,148,12,0.1)" }}>
                          <th className="text-left px-3 py-2 text-xs font-bold" style={{ fontFamily: "Barlow Condensed, sans-serif", color: "rgba(248,240,230,0.4)", letterSpacing: "0.05em", width: "40%" }}>
                            NAME
                          </th>
                          <th className="text-center px-3 py-2 text-xs font-bold" style={{ fontFamily: "Barlow Condensed, sans-serif", color: "rgba(248,240,230,0.4)", letterSpacing: "0.05em", width: "15%" }}>
                            SESSIONS
                          </th>
                          <th className="text-left px-3 py-2 text-xs font-bold" style={{ fontFamily: "Barlow Condensed, sans-serif", color: "rgba(248,240,230,0.4)", letterSpacing: "0.05em" }}>
                            DATES
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {cls.members.map((m, i) => (
                          <tr
                            key={m.name}
                            style={{ background: i % 2 === 0 ? "transparent" : "rgba(228,148,12,0.03)" }}
                          >
                            <td className="px-3 py-2 text-sm" style={{ color: "#E8E0D8" }}>{m.name}</td>
                            <td className="px-3 py-2 text-center font-bold text-sm" style={{ fontFamily: "Barlow Condensed, sans-serif", color: m.sessions >= 3 ? "#C8D400" : "var(--cla-amber)" }}>
                              {m.sessions}
                            </td>
                            <td className="px-3 py-2 text-xs" style={{ color: "rgba(248,240,230,0.4)" }}>
                              {m.dates.map((d) => fmtDate(d)).join(" · ")}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Report history — super admin only */}
      {isSuperAdmin && (
        <div
          className="rounded-xl overflow-hidden"
          style={{ background: "var(--cla-bg-card)", border: "1px solid rgba(228,148,12,0.15)" }}
        >
          <div
            className="flex items-center justify-between px-5 py-3"
            style={{ borderBottom: "1px solid rgba(228,148,12,0.1)" }}
          >
            <div className="flex items-center gap-2">
              <History size={15} style={{ color: "rgba(228,148,12,0.6)" }} />
              <p
                className="text-sm font-bold"
                style={{ fontFamily: "Barlow Condensed, sans-serif", color: "rgba(248,240,230,0.6)" }}
              >
                Sent Reports History
              </p>
            </div>
            <button
              onClick={loadHistory}
              className="p-1.5 rounded-lg transition-colors"
              style={{ color: "rgba(248,240,230,0.35)" }}
              title="Refresh"
            >
              <RefreshCw size={14} />
            </button>
          </div>

          {historyLoading ? (
            <div className="flex items-center justify-center h-24">
              <div
                className="spinner"
                style={{
                  width: 24,
                  height: 24,
                  borderTopColor: "var(--cla-amber)",
                  borderColor: "rgba(228,148,12,0.2)",
                }}
              />
            </div>
          ) : history.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm" style={{ color: "rgba(248,240,230,0.3)" }}>
              No reports sent yet.
            </div>
          ) : (
            <div className="divide-y" style={{ borderColor: "rgba(228,148,12,0.08)" }}>
              {history.map((row) => {
                const isExpanded = expandedRow === row.id;
                return (
                  <div key={row.id}>
                    <button
                      className="w-full flex items-center gap-4 px-5 py-3.5 text-left transition-colors hover:bg-white/[0.02]"
                      onClick={() => setExpandedRow(isExpanded ? null : row.id)}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className="font-bold text-sm"
                            style={{ fontFamily: "Barlow Condensed, sans-serif", color: "#F8BA18" }}
                          >
                            {row.facilitator_name}
                          </span>
                          <span className="text-xs" style={{ color: "rgba(248,240,230,0.4)" }}>
                            {row.facilitator_email}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                          <span className="text-xs flex items-center gap-1" style={{ color: "rgba(248,240,230,0.4)" }}>
                            <Clock size={11} />
                            {fmtDate(row.date_from)} — {fmtDate(row.date_to)}
                          </span>
                          <span
                            className="text-xs"
                            style={{ color: "rgba(228,148,12,0.7)" }}
                          >
                            {row.attendance_count} attended
                          </span>
                          <span className="text-xs" style={{ color: "rgba(248,240,230,0.3)" }}>
                            {row.class_names?.length ?? 0} classes
                          </span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs" style={{ color: "rgba(248,240,230,0.3)" }}>
                          {fmtDatetime(row.sent_at)}
                        </p>
                        {row.metadata?.sent_by_email && (
                          <p className="text-xs mt-0.5" style={{ color: "rgba(248,240,230,0.25)" }}>
                            by {row.metadata.sent_by_email}
                          </p>
                        )}
                      </div>
                      {isExpanded ? (
                        <ChevronUp size={14} style={{ color: "rgba(248,240,230,0.3)", flexShrink: 0 }} />
                      ) : (
                        <ChevronDown size={14} style={{ color: "rgba(248,240,230,0.3)", flexShrink: 0 }} />
                      )}
                    </button>

                    {isExpanded && row.class_names && row.class_names.length > 0 && (
                      <div
                        className="px-5 pb-4"
                        style={{ borderTop: "1px solid rgba(228,148,12,0.07)" }}
                      >
                        <p
                          className="text-xs font-bold uppercase tracking-widest mb-2 pt-3"
                          style={{ fontFamily: "Barlow Condensed, sans-serif", color: "rgba(228,148,12,0.5)" }}
                        >
                          Classes in this report
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {row.class_names.map((name) => (
                            <span
                              key={name}
                              className="text-xs px-2.5 py-1 rounded-full"
                              style={{
                                background: "rgba(228,148,12,0.08)",
                                border: "1px solid rgba(228,148,12,0.15)",
                                color: "rgba(248,240,230,0.6)",
                              }}
                            >
                              {name}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

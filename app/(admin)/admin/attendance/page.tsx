"use client";

import { useState, useEffect } from "react";
import { Search, Download } from "lucide-react";
import { SlotBadge } from "@/components/ui/Badge";
import { createClient } from "@/lib/supabase";

interface AttendanceRow {
  id: string;
  member_name: string;
  service_slot: string;
  attended_at: string;
  class_name: string | null;
  facilitator_name: string | null;
  is_linked: boolean;
}

export default function AttendancePage() {
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterSlot, setFilterSlot] = useState("all");

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("attendance")
      .select(`
        id,
        member_name,
        service_slot,
        attended_at,
        member_id,
        classes (
          name,
          facilitators ( full_name )
        )
      `)
      .order("attended_at", { ascending: false })
      .limit(500)
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

  const filtered = rows.filter((r) => {
    const q = search.toLowerCase();
    const matchSearch =
      q === "" ||
      r.member_name.toLowerCase().includes(q) ||
      (r.class_name ?? "").toLowerCase().includes(q) ||
      (r.facilitator_name ?? "").toLowerCase().includes(q);
    const matchSlot = filterSlot === "all" || r.service_slot === filterSlot;
    return matchSearch && matchSlot;
  });

  function exportCSV() {
    const header = ["Name", "Class", "Facilitator", "Slot", "Date", "Matched Member"];
    const csvRows = filtered.map((r) => [
      r.member_name,
      r.class_name ?? "",
      r.facilitator_name ?? "",
      r.service_slot,
      new Date(r.attended_at).toLocaleDateString("en-GB"),
      r.is_linked ? "Yes" : "No",
    ]);
    const csv = [header, ...csvRows].map((row) => row.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "cla-attendance.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-extrabold" style={{ fontFamily: "var(--font-heading)" }}>
            Attendance Log
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "rgba(248,240,230,0.5)" }}>
            {rows.length} records — who attended, which class, which facilitator
          </p>
        </div>
        <button
          onClick={exportCSV}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all"
          style={{
            fontFamily: "var(--font-heading)",
            background: "rgba(228,148,12,0.1)",
            color: "var(--cla-amber)",
            border: "1px solid rgba(228,148,12,0.2)",
          }}
        >
          <Download size={14} />
          Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2"
            style={{ color: "rgba(248,240,230,0.35)" }}
          />
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
              fontFamily: "var(--font-heading)",
              background:
                filterSlot === s
                  ? "linear-gradient(135deg, #E89A10, #F8BA18)"
                  : "rgba(255,255,255,0.05)",
              color: filterSlot === s ? "#200909" : "rgba(248,240,230,0.6)",
              border: filterSlot === s ? "none" : "1px solid rgba(228,148,12,0.2)",
            }}
          >
            {s === "all" ? "All Slots" : s}
          </button>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div
            className="spinner"
            style={{
              width: 28,
              height: 28,
              borderTopColor: "var(--cla-amber)",
              borderColor: "rgba(228,148,12,0.2)",
            }}
          />
        </div>
      ) : (
        <div
          className="rounded-xl overflow-hidden"
          style={{
            background: "var(--cla-bg-card)",
            border: "1px solid rgba(228,148,12,0.15)",
          }}
        >
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
                {filtered.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="text-center py-12"
                      style={{ color: "rgba(248,240,230,0.35)" }}
                    >
                      No attendance records found.
                    </td>
                  </tr>
                ) : (
                  filtered.map((r, idx) => (
                    <tr key={r.id}>
                      <td className="text-sm" style={{ color: "rgba(248,240,230,0.35)" }}>
                        {idx + 1}
                      </td>
                      <td className="font-semibold">{r.member_name}</td>
                      <td style={{ color: "rgba(248,240,230,0.7)" }}>
                        {r.class_name ?? (
                          <span style={{ color: "rgba(248,240,230,0.25)" }}>—</span>
                        )}
                      </td>
                      <td style={{ color: "rgba(248,240,230,0.6)" }}>
                        {r.facilitator_name ?? (
                          <span style={{ color: "rgba(248,240,230,0.25)" }}>—</span>
                        )}
                      </td>
                      <td>
                        <SlotBadge slot={r.service_slot as any} />
                      </td>
                      <td className="text-sm" style={{ color: "rgba(248,240,230,0.5)" }}>
                        {new Date(r.attended_at).toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </td>
                      <td>
                        <span
                          className="text-xs font-bold"
                          style={{
                            color: r.is_linked ? "#C8D400" : "rgba(248,240,230,0.25)",
                          }}
                        >
                          {r.is_linked ? "Yes" : "No"}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {filtered.length > 0 && (
            <div
              className="px-4 py-3 text-xs"
              style={{
                borderTop: "1px solid rgba(255,255,255,0.05)",
                color: "rgba(248,240,230,0.4)",
              }}
            >
              Showing {filtered.length} of {rows.length} records
            </div>
          )}
        </div>
      )}
    </div>
  );
}

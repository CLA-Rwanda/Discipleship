"use client";

import { useState, useEffect } from "react";
import { Search, Download, Trash2 } from "lucide-react";
import { SlotBadge } from "@/components/ui/Badge";
import { createClient } from "@/lib/supabase";
import { deleteMember } from "@/actions/admin";
import type { Member } from "@/lib/types";

interface MemberWithClass extends Member {
  class_name?: string;
  facilitator_name?: string;
  attendance_count: number;
}

export default function MembersPage() {
  const [members, setMembers] = useState<MemberWithClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterSlot, setFilterSlot] = useState<string>("all");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    Promise.all([
      supabase
        .from("members")
        .select("*, classes(name, facilitators(full_name))")
        .order("registered_at", { ascending: false }),
      supabase
        .from("attendance")
        .select("member_id")
        .not("member_id", "is", null),
    ]).then(([{ data: memberData }, { data: attData }]) => {
      const countById: Record<string, number> = {};
      for (const r of attData ?? []) {
        if (r.member_id) countById[r.member_id] = (countById[r.member_id] ?? 0) + 1;
      }
      const enriched = (memberData ?? []).map((m: any) => ({
        ...m,
        class_name: m.classes?.name,
        facilitator_name: m.classes?.facilitators?.full_name,
        attendance_count: countById[m.id] ?? 0,
      }));
      setMembers(enriched);
      setLoading(false);
    });
  }, []);

  const filtered = members.filter((m) => {
    const q = search.toLowerCase();
    const matchSearch =
      q === "" ||
      m.full_name.toLowerCase().includes(q) ||
      m.phone.includes(q) ||
      (m.email ?? "").toLowerCase().includes(q);
    const matchSlot = filterSlot === "all" || m.preferred_slot === filterSlot;
    return matchSearch && matchSlot;
  });

  async function handleDeleteMember(id: string) {
    setDeleting(true);
    const result = await deleteMember(id);
    setDeleting(false);
    if (result.success) {
      setMembers((prev) => prev.filter((m) => m.id !== id));
      setConfirmDeleteId(null);
    }
  }

  function exportCSV() {
    const rows = [
      ["Name", "Phone", "Email", "Slot", "Class", "Facilitator", "Attended", "Registered"],
      ...filtered.map((m) => [
        m.full_name,
        m.phone,
        m.email ?? "",
        m.preferred_slot,
        m.class_name ?? "",
        m.facilitator_name ?? "",
        m.attendance_count,
        new Date(m.registered_at).toLocaleDateString(),
      ]),
    ];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "cla-members.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1
            className="text-3xl font-extrabold"
            style={{ fontFamily: "Barlow Condensed, sans-serif" }}
          >
            Members
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "rgba(248,240,230,0.5)" }}>
            {members.length} total registered members
          </p>
        </div>
        <button
          onClick={exportCSV}
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
            placeholder="Search by name, phone, or email…"
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
              background:
                filterSlot === s
                  ? "linear-gradient(135deg, #E89A10, #F8BA18)"
                  : "rgba(255,255,255,0.05)",
              color: filterSlot === s ? "#200909" : "rgba(248,240,230,0.6)",
              border:
                filterSlot === s ? "none" : "1px solid rgba(228,148,12,0.2)",
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
            <table className="cla-table" style={{ minWidth: "700px" }}>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Name</th>
                  <th>Phone</th>
                  <th>Email</th>
                  <th>Slot</th>
                  <th>Class</th>
                  <th>Attended</th>
                  <th>Registered</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td
                      colSpan={9}
                      className="text-center py-12"
                      style={{ color: "rgba(248,240,230,0.35)" }}
                    >
                      No members found.
                    </td>
                  </tr>
                ) : (
                  filtered.map((m, idx) => (
                    <tr key={m.id}>
                      <td
                        className="text-sm"
                        style={{ color: "rgba(248,240,230,0.35)" }}
                      >
                        {idx + 1}
                      </td>
                      <td className="font-semibold">{m.full_name}</td>
                      <td style={{ color: "rgba(248,240,230,0.7)" }}>
                        {m.phone}
                      </td>
                      <td style={{ color: "rgba(248,240,230,0.55)" }}>
                        {m.email ?? (
                          <span style={{ color: "rgba(248,240,230,0.25)" }}>
                            —
                          </span>
                        )}
                      </td>
                      <td>
                        <SlotBadge slot={m.preferred_slot} />
                      </td>
                      <td style={{ color: "rgba(248,240,230,0.7)" }}>
                        {m.class_name ?? (
                          <span style={{ color: "rgba(248,240,230,0.3)" }}>
                            Unassigned
                          </span>
                        )}
                      </td>
                      <td>
                        <span
                          className="font-bold text-sm"
                          style={{
                            color: m.attendance_count === 0
                              ? "rgba(248,240,230,0.25)"
                              : m.attendance_count >= 8
                              ? "#C8D400"
                              : "var(--cla-amber)",
                          }}
                        >
                          {m.attendance_count}
                        </span>
                        {m.attendance_count === 0 && (
                          <span className="text-xs ml-1" style={{ color: "rgba(248,240,230,0.2)" }}>×</span>
                        )}
                      </td>
                      <td
                        className="text-sm"
                        style={{ color: "rgba(248,240,230,0.5)" }}
                      >
                        {new Date(m.registered_at).toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </td>
                      <td>
                        {confirmDeleteId === m.id ? (
                          <div className="flex items-center gap-2 whitespace-nowrap">
                            <span className="text-xs font-bold" style={{ color: "#ff6b6b" }}>
                              Delete?
                            </span>
                            <button
                              onClick={() => setConfirmDeleteId(null)}
                              className="text-xs px-2 py-1 rounded"
                              style={{ color: "rgba(248,240,230,0.5)", border: "1px solid rgba(255,255,255,0.1)" }}
                            >
                              No
                            </button>
                            <button
                              onClick={() => handleDeleteMember(m.id)}
                              disabled={deleting}
                              className="text-xs px-2 py-1 rounded font-bold"
                              style={{ background: "rgba(192,40,40,0.25)", color: "#ff6b6b", border: "1px solid rgba(192,40,40,0.4)" }}
                            >
                              {deleting ? "…" : "Yes, delete"}
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmDeleteId(m.id)}
                            className="p-1.5 rounded-lg transition-all"
                            style={{ color: "rgba(192,40,40,0.5)" }}
                            title="Delete member"
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
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
              Showing {filtered.length} of {members.length} members
            </div>
          )}
        </div>
      )}
    </div>
  );
}

"use client";

import { useState, useEffect, useCallback } from "react";
import { AlertTriangle, ChevronDown, Edit2, MoveRight, Users } from "lucide-react";
import { Badge, SlotBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { FillBar } from "@/components/ui/FillBar";
import { createClient } from "@/lib/supabase";
import type { Class, Member, Facilitator, Slot } from "@/lib/types";

interface ClassWithDetails extends Omit<Class, "facilitator"> {
  member_count: number;
  members: Member[];
  facilitator: Facilitator | null;
}

const SLOT_LABELS: Record<Slot, string> = {
  "8am": "8:00 AM",
  "10am": "10:00 AM",
  "12pm": "12:00 PM",
};

export default function ClassesPage() {
  const [classes, setClasses] = useState<ClassWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [rosterClass, setRosterClass] = useState<ClassWithDetails | null>(null);
  const [moveState, setMoveState] = useState<{
    member: Member;
    fromClass: ClassWithDetails;
  } | null>(null);
  const [targetClassId, setTargetClassId] = useState("");
  const [movingId, setMovingId] = useState<string | null>(null);
  const [filterSlot, setFilterSlot] = useState<Slot | "all">("all");

  const fetchClasses = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("classes")
      .select(
        `
        *,
        facilitator:facilitators(id, full_name, email, phone, user_id, created_at),
        members(id, full_name, phone, email, preferred_slot, registered_at, class_id)
      `
      )
      .eq("is_active", true)
      .order("name");

    const enriched = (data ?? []).map((c: any) => ({
      ...c,
      member_count: c.members?.length ?? 0,
      members: c.members ?? [],
      facilitator: Array.isArray(c.facilitator)
        ? c.facilitator[0] ?? null
        : c.facilitator ?? null,
    }));

    setClasses(enriched);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchClasses();
  }, [fetchClasses]);

  async function handleMove() {
    if (!moveState || !targetClassId) return;
    setMovingId(moveState.member.id);
    const supabase = createClient();
    await supabase
      .from("members")
      .update({ class_id: targetClassId })
      .eq("id", moveState.member.id);
    setMovingId(null);
    setMoveState(null);
    setTargetClassId("");
    fetchClasses();
  }

  const filtered =
    filterSlot === "all"
      ? classes
      : classes.filter((c) => c.slot === filterSlot);

  const slots: (Slot | "all")[] = ["all", "8am", "10am", "12pm"];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div
          className="spinner"
          style={{
            width: 32,
            height: 32,
            borderTopColor: "var(--cla-amber)",
            borderColor: "rgba(228,148,12,0.2)",
          }}
        />
      </div>
    );
  }

  const fullClasses = classes.filter((c) => c.member_count >= c.capacity_max);
  const slotsFull = (["8am", "10am", "12pm"] as Slot[]).filter((slot) => {
    const slotClasses = classes.filter((c) => c.slot === slot);
    return (
      slotClasses.length > 0 &&
      slotClasses.every((c) => c.member_count >= c.capacity_max)
    );
  });

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1
            className="text-3xl font-extrabold"
            style={{ fontFamily: "Barlow Condensed, sans-serif" }}
          >
            Classes
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "rgba(248,240,230,0.5)" }}>
            {classes.length} active classes · {fullClasses.length} at capacity
          </p>
        </div>

        {/* Slot filter */}
        <div className="flex gap-2">
          {slots.map((s) => (
            <button
              key={s}
              onClick={() => setFilterSlot(s)}
              className="px-3 py-1.5 rounded-full text-sm font-bold transition-all"
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
              {s === "all" ? "All" : s}
            </button>
          ))}
        </div>
      </div>

      {/* Capacity warnings */}
      {slotsFull.length > 0 && (
        <div
          className="flex items-start gap-3 p-4 rounded-xl"
          style={{
            background: "rgba(139,26,26,0.15)",
            border: "1px solid rgba(139,26,26,0.3)",
          }}
        >
          <AlertTriangle size={18} style={{ color: "#ff6b6b", flexShrink: 0, marginTop: 2 }} />
          <p className="text-sm" style={{ color: "#ff6b6b" }}>
            All classes for{" "}
            <strong>{slotsFull.map((s) => SLOT_LABELS[s]).join(", ")}</strong>{" "}
            {slotsFull.length === 1 ? "is" : "are"} at full capacity.
          </p>
        </div>
      )}

      {/* Classes table */}
      <div
        className="rounded-xl overflow-hidden"
        style={{
          background: "var(--cla-bg-card)",
          border: "1px solid rgba(228,148,12,0.15)",
        }}
      >
        <div className="overflow-x-auto">
          <table className="cla-table">
            <thead>
              <tr>
                <th>Class</th>
                <th>Slot</th>
                <th>Facilitator</th>
                <th>Members</th>
                <th>Fill</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((cls) => {
                const pct = (cls.member_count / cls.capacity_max) * 100;
                const isFull = cls.member_count >= cls.capacity_max;
                const isWarning = pct >= 80 && !isFull;

                return (
                  <tr key={cls.id}>
                    <td>
                      <span className="font-bold">{cls.name}</span>
                      {isFull && (
                        <span
                          className="ml-2 text-xs font-bold"
                          style={{ color: "#ff4444" }}
                        >
                          FULL
                        </span>
                      )}
                      {isWarning && (
                        <span
                          className="ml-2 text-xs font-bold"
                          style={{ color: "var(--cla-amber)" }}
                        >
                          NEAR FULL
                        </span>
                      )}
                    </td>
                    <td>
                      <SlotBadge slot={cls.slot} />
                    </td>
                    <td style={{ color: "rgba(248,240,230,0.7)" }}>
                      {cls.facilitator?.full_name ?? (
                        <span style={{ color: "rgba(248,240,230,0.3)" }}>
                          Unassigned
                        </span>
                      )}
                    </td>
                    <td>
                      <span
                        className="font-bold"
                        style={{
                          color: isFull
                            ? "#ff4444"
                            : isWarning
                            ? "var(--cla-amber)"
                            : "var(--cla-off-white)",
                        }}
                      >
                        {cls.member_count}
                      </span>
                      <span style={{ color: "rgba(248,240,230,0.4)" }}>
                        /{cls.capacity_max}
                      </span>
                    </td>
                    <td style={{ width: "120px" }}>
                      <FillBar value={cls.member_count} max={cls.capacity_max} />
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setRosterClass(cls)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all"
                          style={{
                            fontFamily: "Barlow Condensed, sans-serif",
                            background: "rgba(228,148,12,0.1)",
                            color: "var(--cla-amber)",
                            border: "1px solid rgba(228,148,12,0.2)",
                          }}
                        >
                          <Users size={12} />
                          Roster
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Roster Modal */}
      <Modal
        open={!!rosterClass}
        onClose={() => setRosterClass(null)}
        title={rosterClass ? `${rosterClass.name} — Roster` : ""}
        maxWidth="640px"
      >
        {rosterClass && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3 flex-wrap">
              <SlotBadge slot={rosterClass.slot} />
              <span style={{ color: "rgba(248,240,230,0.5)", fontSize: "0.85rem" }}>
                Facilitator: {rosterClass.facilitator?.full_name ?? "Unassigned"}
              </span>
              <span
                className="ml-auto font-bold"
                style={{
                  fontFamily: "Barlow Condensed, sans-serif",
                  color:
                    rosterClass.member_count >= rosterClass.capacity_max
                      ? "#ff4444"
                      : "var(--cla-amber)",
                }}
              >
                {rosterClass.member_count}/{rosterClass.capacity_max}
              </span>
            </div>

            {rosterClass.members.length === 0 ? (
              <p
                className="text-center py-8 text-sm"
                style={{ color: "rgba(248,240,230,0.4)" }}
              >
                No members in this class yet.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {rosterClass.members.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg"
                    style={{
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,255,255,0.06)",
                    }}
                  >
                    <div>
                      <p className="font-semibold text-sm">{member.full_name}</p>
                      <p
                        className="text-xs"
                        style={{ color: "rgba(248,240,230,0.5)" }}
                      >
                        {member.phone}
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        setMoveState({ member, fromClass: rosterClass });
                        setRosterClass(null);
                        setTargetClassId("");
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all shrink-0"
                      style={{
                        fontFamily: "Barlow Condensed, sans-serif",
                        background: "rgba(91,45,142,0.15)",
                        color: "#b47fea",
                        border: "1px solid rgba(91,45,142,0.3)",
                      }}
                    >
                      <MoveRight size={12} />
                      Move
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Move Member Modal */}
      <Modal
        open={!!moveState}
        onClose={() => setMoveState(null)}
        title="Move Member"
      >
        {moveState && (
          <div className="flex flex-col gap-4">
            <div
              className="p-4 rounded-xl"
              style={{
                background: "rgba(228,148,12,0.06)",
                border: "1px solid rgba(228,148,12,0.15)",
              }}
            >
              <p className="font-bold">{moveState.member.full_name}</p>
              <p
                className="text-sm"
                style={{ color: "rgba(248,240,230,0.55)" }}
              >
                Currently in{" "}
                <span style={{ color: "var(--cla-amber)" }}>
                  {moveState.fromClass.name}
                </span>{" "}
                ({moveState.fromClass.slot})
              </p>
            </div>

            <div>
              <label
                className="text-sm font-bold block mb-2"
                style={{ fontFamily: "Barlow Condensed, sans-serif" }}
              >
                Move to Class
              </label>
              <div className="relative">
                <select
                  value={targetClassId}
                  onChange={(e) => setTargetClassId(e.target.value)}
                  className="cla-input appearance-none pr-8"
                >
                  <option value="" disabled>
                    Select a class…
                  </option>
                  {classes
                    .filter(
                      (c) =>
                        c.id !== moveState.fromClass.id &&
                        c.member_count < c.capacity_max
                    )
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.slot}) — {c.member_count}/{c.capacity_max}
                      </option>
                    ))}
                </select>
                <ChevronDown
                  size={16}
                  className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ color: "rgba(248,240,230,0.4)" }}
                />
              </div>
            </div>

            <div className="flex gap-3 mt-2">
              <Button
                variant="secondary"
                onClick={() => setMoveState(null)}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                loading={!!movingId}
                disabled={!targetClassId}
                onClick={handleMove}
                className="flex-1"
              >
                <MoveRight size={16} />
                Confirm Move
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

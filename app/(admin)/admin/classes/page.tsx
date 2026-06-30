"use client";

import { useState, useEffect, useCallback } from "react";
import { AlertTriangle, ChevronDown, Download, MoveRight, Plus, Trash2, Users } from "lucide-react";
import { SlotBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { FillBar } from "@/components/ui/FillBar";
import { createClient } from "@/lib/supabase";
import { deleteClass, bulkDeleteClasses } from "@/actions/admin";
import { getAppSettings } from "@/actions/settings";
import { downloadXLSX } from "@/lib/xlsx-export";
import type { Class, Member, Facilitator } from "@/lib/types";

interface ClassWithDetails extends Omit<Class, "facilitator"> {
  member_count: number;
  members: Member[];
  facilitator: Facilitator | null;
}

function nextClassName(existingNames: string[]): string {
  const nums = existingNames
    .map((n) => { const m = n.match(/^Class\s+(\d+)$/i); return m ? parseInt(m[1]) : 0; })
    .filter((n) => n > 0);
  const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
  return `Class ${String(next).padStart(2, "0")}`;
}

export default function ClassesPage() {
  const [classes, setClasses]           = useState<ClassWithDetails[]>([]);
  const [loading, setLoading]           = useState(true);
  const [rosterClass, setRosterClass]   = useState<ClassWithDetails | null>(null);
  const [moveState, setMoveState]       = useState<{ member: Member; fromClass: ClassWithDetails } | null>(null);
  const [targetClassId, setTargetClassId] = useState("");
  const [movingId, setMovingId]         = useState<string | null>(null);
  const [filterSlot, setFilterSlot]     = useState<string>("all");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting]         = useState(false);
  const [selectedIds, setSelectedIds]   = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [confirmBulk, setConfirmBulk]   = useState(false);

  // Add class modal
  const [addOpen, setAddOpen]           = useState(false);
  const [addSlot, setAddSlot]           = useState("");
  const [newSlotInput, setNewSlotInput] = useState("");
  const [addSaving, setAddSaving]       = useState(false);
  const [addError, setAddError]         = useState("");
  const [maxClasses, setMaxClasses]     = useState(16);
  const [existingSlots, setExistingSlots] = useState<string[]>([]);

  const fetchClasses = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("classes")
      .select("*, facilitator:facilitators(id, full_name, email, phone, user_id, created_at), members(id, first_name, last_name, phone, email, preferred_slot, registered_at, class_id)")
      .eq("is_active", true)
      .order("name");

    const enriched = (data ?? []).map((c: any) => ({
      ...c,
      member_count: c.members?.length ?? 0,
      members: c.members ?? [],
      facilitator: Array.isArray(c.facilitator) ? c.facilitator[0] ?? null : c.facilitator ?? null,
    }));

    setClasses(enriched);
    setLoading(false);

    // Derive slots from loaded classes
    const slots = Array.from(new Set(enriched.map((c: any) => c.slot as string))).sort();
    setExistingSlots(slots);
  }, []);

  useEffect(() => {
    fetchClasses();
    getAppSettings().then((s) => setMaxClasses(s.max_classes));
  }, [fetchClasses]);

  async function handleDeleteClass(id: string) {
    setDeleting(true);
    const result = await deleteClass(id);
    setDeleting(false);
    if (result.success) {
      setClasses((prev) => prev.filter((c) => c.id !== id));
      setConfirmDeleteId(null);
    }
  }

  async function handleBulkDelete() {
    setBulkDeleting(true);
    const ids = Array.from(selectedIds);
    const result = await bulkDeleteClasses(ids);
    setBulkDeleting(false);
    if (result.success) {
      setClasses((prev) => prev.filter((c) => !selectedIds.has(c.id)));
      setSelectedIds(new Set());
      setConfirmBulk(false);
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((c) => c.id)));
    }
  }

  async function handleMove() {
    if (!moveState || !targetClassId) return;
    setMovingId(moveState.member.id);
    const supabase = createClient();
    await supabase.from("members").update({ class_id: targetClassId }).eq("id", moveState.member.id);
    setMovingId(null);
    setMoveState(null);
    setTargetClassId("");
    fetchClasses();
  }

  async function handleAddClass() {
    setAddError("");
    const chosenSlot = addSlot === "__new__" ? newSlotInput.trim() : addSlot.trim();

    if (!chosenSlot) { setAddError("Please select or enter a slot."); return; }

    if (classes.length >= maxClasses) {
      setAddError(`Maximum number of classes reached (${maxClasses}). Update the limit in Settings if needed.`);
      return;
    }

    const newName = nextClassName(classes.map((c) => c.name));
    setAddSaving(true);
    const supabase = createClient();
    const { error } = await supabase.from("classes").insert({
      name: newName,
      slot: chosenSlot.toLowerCase(),
      is_active: true,
      capacity_min: 15,
      capacity_max: 15,
    });
    setAddSaving(false);
    if (error) { setAddError(error.message); return; }
    setAddOpen(false);
    setAddSlot("");
    setNewSlotInput("");
    fetchClasses();
    // Refresh settings in case max_classes changed
    getAppSettings().then((s) => setMaxClasses(s.max_classes));
  }

  // CSV download for a class roster (includes sessions attended per member)
  async function downloadRosterCSV(cls: ClassWithDetails) {
    if (cls.members.length === 0) return;
    const supabase = createClient();
    const memberIds = cls.members.map((m: any) => m.id);
    const { data: attData } = await supabase
      .from("attendance")
      .select("member_id")
      .in("member_id", memberIds);

    const countById: Record<string, number> = {};
    for (const r of attData ?? []) {
      if (r.member_id) countById[r.member_id] = (countById[r.member_id] ?? 0) + 1;
    }

    const rows = [
      ["First Name", "Last Name", "Phone", "Email", "Class", "Slot", "Sessions Attended"],
      ...cls.members.map((m: any) => [
        m.first_name,
        m.last_name,
        m.phone ?? "",
        m.email ?? "",
        cls.name,
        cls.slot,
        countById[m.id] ?? 0,
      ]),
    ];
    downloadXLSX(rows, `${cls.name.replace(/\s+/g, "-")}-roster.xlsx`);
  }

  const filtered = filterSlot === "all" ? classes : classes.filter((c) => c.slot === filterSlot);
  const allSlots = Array.from(new Set(classes.map((c) => c.slot))).sort();
  const fullClasses = classes.filter((c) => c.member_count >= c.capacity_max);

  const slotsFull = allSlots.filter((slot) => {
    const sc = classes.filter((c) => c.slot === slot);
    return sc.length > 0 && sc.every((c) => c.member_count >= c.capacity_max);
  });

  const atCap = classes.length >= maxClasses;
  const nextName = nextClassName(classes.map((c) => c.name));

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="spinner" style={{ width: 32, height: 32, borderTopColor: "var(--cla-amber)", borderColor: "rgba(228,148,12,0.2)" }} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-extrabold" style={{ fontFamily: "Barlow Condensed, sans-serif" }}>Classes</h1>
          <p className="text-sm mt-0.5" style={{ color: "rgba(248,240,230,0.5)" }}>
            {classes.length} active classes · {fullClasses.length} at capacity · limit {maxClasses}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Slot filter */}
          <div className="flex gap-2 flex-wrap">
            {(["all", ...allSlots] as string[]).map((s) => (
              <button key={s} onClick={() => setFilterSlot(s)} className="px-3 py-2 rounded-full text-sm font-bold transition-all"
                style={{ minHeight: 44, fontFamily: "Barlow Condensed, sans-serif", background: filterSlot === s ? "linear-gradient(135deg, #E89A10, #F8BA18)" : "rgba(255,255,255,0.05)", color: filterSlot === s ? "#200909" : "rgba(248,240,230,0.6)", border: filterSlot === s ? "none" : "1px solid rgba(228,148,12,0.2)" }}>
                {s === "all" ? "All" : s}
              </button>
            ))}
          </div>
          <Button variant="primary" size="sm" onClick={() => { setAddError(""); setAddSlot(""); setNewSlotInput(""); setAddOpen(true); }}>
            <Plus size={16} /> Add Class
          </Button>
        </div>
      </div>

      {/* Bulk delete bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl" style={{ background: "rgba(192,40,40,0.12)", border: "1px solid rgba(192,40,40,0.3)" }}>
          <span className="text-sm font-bold" style={{ color: "#ff6b6b" }}>
            {selectedIds.size} class{selectedIds.size > 1 ? "es" : ""} selected
          </span>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={() => setSelectedIds(new Set())} className="text-xs px-3 py-1.5 rounded-lg"
              style={{ color: "rgba(248,240,230,0.5)", border: "1px solid rgba(255,255,255,0.1)" }}>
              Cancel
            </button>
            {confirmBulk ? (
              <>
                <span className="text-xs font-bold" style={{ color: "#ff6b6b" }}>Delete {selectedIds.size} classes?</span>
                <button onClick={() => setConfirmBulk(false)} className="text-xs px-3 py-1.5 rounded-lg"
                  style={{ color: "rgba(248,240,230,0.5)", border: "1px solid rgba(255,255,255,0.1)" }}>No</button>
                <button onClick={handleBulkDelete} disabled={bulkDeleting} className="text-xs px-3 py-1.5 rounded-lg font-bold"
                  style={{ background: "rgba(192,40,40,0.3)", color: "#ff6b6b", border: "1px solid rgba(192,40,40,0.5)" }}>
                  {bulkDeleting ? "Deleting…" : "Yes, delete all"}
                </button>
              </>
            ) : (
              <button onClick={() => setConfirmBulk(true)} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-bold"
                style={{ background: "rgba(192,40,40,0.25)", color: "#ff6b6b", border: "1px solid rgba(192,40,40,0.4)" }}>
                <Trash2 size={12} /> Delete selected
              </button>
            )}
          </div>
        </div>
      )}

      {/* Cap warning */}
      {atCap && (
        <div className="flex items-start gap-3 p-4 rounded-xl" style={{ background: "rgba(228,148,12,0.08)", border: "1px solid rgba(228,148,12,0.25)" }}>
          <AlertTriangle size={18} style={{ color: "var(--cla-amber)", flexShrink: 0, marginTop: 2 }} />
          <p className="text-sm" style={{ color: "var(--cla-amber)" }}>
            Maximum number of classes reached ({maxClasses}). Update the limit in <strong>Settings</strong> to add more.
          </p>
        </div>
      )}

      {/* Slot-full warnings */}
      {slotsFull.length > 0 && (
        <div className="flex items-start gap-3 p-4 rounded-xl" style={{ background: "rgba(139,26,26,0.15)", border: "1px solid rgba(139,26,26,0.3)" }}>
          <AlertTriangle size={18} style={{ color: "#ff6b6b", flexShrink: 0, marginTop: 2 }} />
          <p className="text-sm" style={{ color: "#ff6b6b" }}>
            All classes for <strong>{slotsFull.join(", ")}</strong> {slotsFull.length === 1 ? "is" : "are"} at full capacity.
          </p>
        </div>
      )}

      {/* Classes table */}
      <div className="rounded-xl overflow-hidden" style={{ background: "var(--cla-bg-card)", border: "1px solid rgba(228,148,12,0.15)" }}>
        <div className="overflow-x-auto">
          <table className="cla-table" style={{ minWidth: "560px" }}>
            <thead>
              <tr>
                <th style={{ width: 36 }}>
                  <input type="checkbox"
                    checked={filtered.length > 0 && selectedIds.size === filtered.length}
                    onChange={toggleSelectAll}
                    style={{ accentColor: "var(--cla-amber)", cursor: "pointer" }}
                  />
                </th>
                <th>Class</th><th>Slot</th><th>Facilitator</th><th>Members</th><th>Fill</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((cls) => {
                const pct       = (cls.member_count / cls.capacity_max) * 100;
                const isFull    = cls.member_count >= cls.capacity_max;
                const isWarning = pct >= 80 && !isFull;
                const isChecked = selectedIds.has(cls.id);
                return (
                  <tr key={cls.id} style={isChecked ? { background: "rgba(192,40,40,0.06)" } : undefined}>
                    <td>
                      <input type="checkbox" checked={isChecked} onChange={() => toggleSelect(cls.id)}
                        style={{ accentColor: "var(--cla-amber)", cursor: "pointer" }} />
                    </td>
                    <td>
                      <span className="font-bold">{cls.name}</span>
                      {isFull    && <span className="ml-2 text-xs font-bold" style={{ color: "#ff4444" }}>FULL</span>}
                      {isWarning && <span className="ml-2 text-xs font-bold" style={{ color: "var(--cla-amber)" }}>NEAR FULL</span>}
                    </td>
                    <td><SlotBadge slot={cls.slot} /></td>
                    <td style={{ color: "rgba(248,240,230,0.7)" }}>
                      {cls.facilitator?.full_name ?? <span style={{ color: "rgba(248,240,230,0.3)" }}>Unassigned</span>}
                    </td>
                    <td>
                      <span className="font-bold" style={{ color: isFull ? "#ff4444" : isWarning ? "var(--cla-amber)" : "var(--cla-off-white)" }}>{cls.member_count}</span>
                      <span style={{ color: "rgba(248,240,230,0.4)" }}>/{cls.capacity_max}</span>
                    </td>
                    <td style={{ width: "120px" }}>
                      <FillBar value={cls.member_count} max={cls.capacity_max} />
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <button onClick={() => setRosterClass(cls)} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all"
                          style={{ fontFamily: "Barlow Condensed, sans-serif", background: "rgba(228,148,12,0.1)", color: "var(--cla-amber)", border: "1px solid rgba(228,148,12,0.2)" }}>
                          <Users size={12} /> Roster
                        </button>
                        {confirmDeleteId === cls.id ? (
                          <div className="flex items-center gap-1.5 whitespace-nowrap">
                            <span className="text-xs font-bold" style={{ color: "#ff6b6b" }}>Sure?</span>
                            <button onClick={() => setConfirmDeleteId(null)} className="text-xs px-2 py-1 rounded" style={{ color: "rgba(248,240,230,0.5)", border: "1px solid rgba(255,255,255,0.1)" }}>No</button>
                            <button onClick={() => handleDeleteClass(cls.id)} disabled={deleting} className="text-xs px-2 py-1 rounded font-bold"
                              style={{ background: "rgba(192,40,40,0.25)", color: "#ff6b6b", border: "1px solid rgba(192,40,40,0.4)" }}>
                              {deleting ? "…" : "Delete"}
                            </button>
                          </div>
                        ) : (
                          <button onClick={() => setConfirmDeleteId(cls.id)} className="p-1.5 rounded-lg transition-all" style={{ color: "rgba(192,40,40,0.5)" }} title="Delete class">
                            <Trash2 size={14} />
                          </button>
                        )}
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
      <Modal open={!!rosterClass} onClose={() => setRosterClass(null)} title={rosterClass ? `${rosterClass.name} — Roster` : ""} maxWidth="640px">
        {rosterClass && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3 flex-wrap">
              <SlotBadge slot={rosterClass.slot} />
              <span style={{ color: "rgba(248,240,230,0.5)", fontSize: "0.85rem" }}>
                Facilitator: {rosterClass.facilitator?.full_name ?? "Unassigned"}
              </span>
              <span className="ml-auto font-bold" style={{ fontFamily: "Barlow Condensed, sans-serif", color: rosterClass.member_count >= rosterClass.capacity_max ? "#ff4444" : "var(--cla-amber)" }}>
                {rosterClass.member_count}/{rosterClass.capacity_max}
              </span>
            </div>

            {rosterClass.members.length > 0 && (
              <button onClick={() => downloadRosterCSV(rosterClass)} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold self-start transition-all"
                style={{ fontFamily: "Barlow Condensed, sans-serif", background: "rgba(228,148,12,0.1)", color: "var(--cla-amber)", border: "1px solid rgba(228,148,12,0.2)" }}>
                <Download size={13} /> Download Class List
              </button>
            )}

            {rosterClass.members.length === 0 ? (
              <p className="text-center py-8 text-sm" style={{ color: "rgba(248,240,230,0.4)" }}>No members in this class yet.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {rosterClass.members.map((member: any) => (
                  <div key={member.id} className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
                    <div>
                      <p className="font-semibold text-sm">{member.first_name} {member.last_name}</p>
                      <p className="text-xs" style={{ color: "rgba(248,240,230,0.5)" }}>{member.phone}</p>
                    </div>
                    <button onClick={() => { setMoveState({ member, fromClass: rosterClass }); setRosterClass(null); setTargetClassId(""); }}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all shrink-0"
                      style={{ fontFamily: "Barlow Condensed, sans-serif", background: "rgba(91,45,142,0.15)", color: "#b47fea", border: "1px solid rgba(91,45,142,0.3)" }}>
                      <MoveRight size={12} /> Move
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Move Member Modal */}
      <Modal open={!!moveState} onClose={() => setMoveState(null)} title="Move Member">
        {moveState && (
          <div className="flex flex-col gap-4">
            <div className="p-4 rounded-xl" style={{ background: "rgba(228,148,12,0.06)", border: "1px solid rgba(228,148,12,0.15)" }}>
              <p className="font-bold">{(moveState.member as any).first_name} {(moveState.member as any).last_name}</p>
              <p className="text-sm" style={{ color: "rgba(248,240,230,0.55)" }}>
                Currently in <span style={{ color: "var(--cla-amber)" }}>{moveState.fromClass.name}</span> ({moveState.fromClass.slot})
              </p>
            </div>
            <div>
              <label className="text-sm font-bold block mb-2" style={{ fontFamily: "Barlow Condensed, sans-serif" }}>Move to Class</label>
              <div className="relative">
                <select value={targetClassId} onChange={(e) => setTargetClassId(e.target.value)} className="cla-input appearance-none pr-8">
                  <option value="" disabled>Select a class…</option>
                  {classes.filter((c) => c.id !== moveState.fromClass.id && c.member_count < c.capacity_max).map((c) => (
                    <option key={c.id} value={c.id}>{c.name} ({c.slot}) — {c.member_count}/{c.capacity_max}</option>
                  ))}
                </select>
                <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "rgba(248,240,230,0.4)" }} />
              </div>
            </div>
            <div className="flex gap-3 mt-2">
              <Button variant="secondary" onClick={() => setMoveState(null)} className="flex-1">Cancel</Button>
              <Button variant="primary" loading={!!movingId} disabled={!targetClassId} onClick={handleMove} className="flex-1">
                <MoveRight size={16} /> Confirm Move
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Add Class Modal */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add New Class">
        <div className="flex flex-col gap-4">
          <div className="p-3 rounded-lg" style={{ background: "rgba(228,148,12,0.07)", border: "1px solid rgba(228,148,12,0.2)" }}>
            <p className="text-xs uppercase tracking-widest mb-1" style={{ fontFamily: "Barlow Condensed, sans-serif", color: "rgba(248,240,230,0.45)" }}>Class Name (auto-generated)</p>
            <p className="text-2xl font-extrabold" style={{ fontFamily: "Barlow Condensed, sans-serif", color: "var(--cla-amber-light)" }}>{nextName}</p>
            <p className="text-xs mt-1" style={{ color: "rgba(248,240,230,0.4)" }}>Names are assigned sequentially. You only choose the slot.</p>
          </div>

          <div>
            <label className="text-sm font-bold block mb-2" style={{ fontFamily: "Barlow Condensed, sans-serif" }}>Service Slot</label>
            <div className="relative">
              <select value={addSlot} onChange={(e) => { setAddSlot(e.target.value); setNewSlotInput(""); }}
                className="cla-input appearance-none pr-8">
                <option value="">Choose a slot…</option>
                {existingSlots.map((s) => <option key={s} value={s}>{s}</option>)}
                <option value="__new__">+ Enter a new slot time…</option>
              </select>
              <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "rgba(248,240,230,0.4)" }} />
            </div>
          </div>

          {addSlot === "__new__" && (
            <div>
              <label className="text-sm font-bold block mb-2" style={{ fontFamily: "Barlow Condensed, sans-serif" }}>New Slot Time</label>
              <input type="text" value={newSlotInput} onChange={(e) => setNewSlotInput(e.target.value)}
                placeholder="e.g. 12pm, 2pm, 4pm"
                className="cla-input" />
              <p className="text-xs mt-1.5" style={{ color: "rgba(248,240,230,0.4)" }}>
                Once saved, this slot will appear everywhere slots are listed — registration, attendance, dashboard, and classes.
              </p>
            </div>
          )}

          {addError && (
            <div className="p-3 rounded-lg text-sm" style={{ background: "rgba(139,26,26,0.15)", border: "1px solid rgba(139,26,26,0.3)", color: "#ff6b6b" }}>
              {addError}
            </div>
          )}

          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => setAddOpen(false)} className="flex-1">Cancel</Button>
            <Button variant="primary" loading={addSaving} onClick={handleAddClass} className="flex-1" disabled={atCap}>
              Add {nextName}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

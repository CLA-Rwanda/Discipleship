"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, Edit2, BookOpen, BookMarked, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { SlotBadge } from "@/components/ui/Badge";
import { createClient } from "@/lib/supabase";
import type { Facilitator, Slot } from "@/lib/types";

interface FacilitatorWithClasses extends Facilitator {
  classes_count: number;
}

interface ClassOption {
  id: string;
  name: string;
  slot: Slot;
  facilitator_id: string | null;
}

const EMPTY_FORM = { full_name: "", email: "", phone: "" };

export default function FacilitatorsPage() {
  const [facilitators, setFacilitators] = useState<FacilitatorWithClasses[]>([]);
  const [loading, setLoading] = useState(true);

  // Add / edit modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<FacilitatorWithClasses | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Assign classes modal
  const [assignTarget, setAssignTarget] = useState<FacilitatorWithClasses | null>(null);
  const [allClasses, setAllClasses] = useState<ClassOption[]>([]);
  const [facilitatorNamesById, setFacilitatorNamesById] = useState<Record<string, string>>({});
  const [selectedClassIds, setSelectedClassIds] = useState<Set<string>>(new Set());
  const [classesLoading, setClassesLoading] = useState(false);
  const [assignSaving, setAssignSaving] = useState(false);
  // Confirmation step when replacing existing facilitators
  const [pendingReplacements, setPendingReplacements] = useState<
    { classId: string; className: string; currentName: string }[]
  >([]);
  const [showConfirm, setShowConfirm] = useState(false);
  const [activeSlotTab, setActiveSlotTab] = useState<Slot>("8am");

  const fetchFacilitators = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("facilitators")
      .select("*, classes(count)")
      .order("full_name");

    const enriched = (data ?? []).map((f: any) => ({
      ...f,
      classes_count: f.classes?.[0]?.count ?? 0,
    }));
    setFacilitators(enriched);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchFacilitators();
  }, [fetchFacilitators]);

  function openAdd() {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setErrors({});
    setModalOpen(true);
  }

  function openEdit(f: FacilitatorWithClasses) {
    setEditTarget(f);
    setForm({ full_name: f.full_name, email: f.email ?? "", phone: f.phone ?? "" });
    setErrors({});
    setModalOpen(true);
  }

  async function openAssign(f: FacilitatorWithClasses) {
    setAssignTarget(f);
    setShowConfirm(false);
    setPendingReplacements([]);
    setActiveSlotTab("8am");
    setClassesLoading(true);
    const supabase = createClient();

    const [{ data: classData }, { data: facData }] = await Promise.all([
      supabase
        .from("classes")
        .select("id, name, slot, facilitator_id")
        .eq("is_active", true)
        .order("name"),
      supabase.from("facilitators").select("id, full_name"),
    ]);

    const classes = (classData ?? []) as ClassOption[];
    setAllClasses(classes);

    const namesMap: Record<string, string> = {};
    for (const fac of facData ?? []) namesMap[fac.id] = fac.full_name;
    setFacilitatorNamesById(namesMap);

    setSelectedClassIds(
      new Set(classes.filter((c) => c.facilitator_id === f.id).map((c) => c.id))
    );
    setClassesLoading(false);
  }

  function toggleClass(classId: string) {
    setSelectedClassIds((prev) => {
      const next = new Set(prev);
      if (next.has(classId)) next.delete(classId);
      else next.add(classId);
      return next;
    });
  }

  function handleAssignRequest() {
    if (!assignTarget) return;

    const prevIds = new Set(
      allClasses.filter((c) => c.facilitator_id === assignTarget.id).map((c) => c.id)
    );
    const toAssign = Array.from(selectedClassIds).filter((id) => !prevIds.has(id));

    // Find any newly-selected class that already has a different facilitator
    const replacements = toAssign
      .map((id) => allClasses.find((c) => c.id === id))
      .filter((c) => c && c.facilitator_id && c.facilitator_id !== assignTarget.id)
      .map((c) => ({
        classId: c!.id,
        className: c!.name,
        currentName: facilitatorNamesById[c!.facilitator_id!] ?? "another facilitator",
      }));

    if (replacements.length > 0) {
      setPendingReplacements(replacements);
      setShowConfirm(true);
    } else {
      doAssignSave();
    }
  }

  async function doAssignSave() {
    if (!assignTarget) return;
    setAssignSaving(true);
    setShowConfirm(false);
    const supabase = createClient();

    const prevIds = new Set(
      allClasses.filter((c) => c.facilitator_id === assignTarget.id).map((c) => c.id)
    );
    const toAssign = Array.from(selectedClassIds).filter((id) => !prevIds.has(id));
    const toUnassign = Array.from(prevIds).filter((id) => !selectedClassIds.has(id));

    if (toAssign.length) {
      await supabase
        .from("classes")
        .update({ facilitator_id: assignTarget.id })
        .in("id", toAssign);
    }
    if (toUnassign.length) {
      await supabase
        .from("classes")
        .update({ facilitator_id: null })
        .in("id", toUnassign);
    }
    setAssignSaving(false);
    setAssignTarget(null);
    fetchFacilitators();
  }

  function validate() {
    const e: Record<string, string> = {};
    if (!form.full_name.trim()) e.full_name = "Name is required";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSave() {
    if (!validate()) return;
    setSaving(true);
    const supabase = createClient();

    if (editTarget) {
      await supabase
        .from("facilitators")
        .update({
          full_name: form.full_name.trim(),
          email: form.email.trim() || null,
          phone: form.phone.trim() || null,
        })
        .eq("id", editTarget.id);
    } else {
      await supabase.from("facilitators").insert({
        full_name: form.full_name.trim(),
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
      });
    }

    setSaving(false);
    setModalOpen(false);
    fetchFacilitators();
  }

  async function handleDelete(id: string) {
    if (!confirm("Remove this facilitator? Their classes will become unassigned.")) return;
    const supabase = createClient();
    await supabase.from("facilitators").delete().eq("id", id);
    fetchFacilitators();
  }



  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1
            className="text-3xl font-extrabold"
            style={{ fontFamily: "Barlow Condensed, sans-serif" }}
          >
            Facilitators
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "rgba(248,240,230,0.5)" }}>
            {facilitators.length} facilitators
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={openAdd}>
          <Plus size={16} />
          Add Facilitator
        </Button>
      </div>

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
        <div className="grid gap-3">
          {facilitators.map((f) => (
            <div
              key={f.id}
              className="cla-card p-4 flex items-center justify-between gap-4 flex-wrap"
            >
              <div className="flex items-center gap-4">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 font-bold"
                  style={{
                    fontFamily: "Barlow Condensed, sans-serif",
                    background: "rgba(228,148,12,0.15)",
                    color: "var(--cla-amber)",
                    fontSize: "1rem",
                  }}
                >
                  {f.full_name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="font-bold">{f.full_name}</p>
                  <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                    {f.email && (
                      <p className="text-xs" style={{ color: "rgba(248,240,230,0.55)" }}>
                        {f.email}
                      </p>
                    )}
                    {f.phone && (
                      <p className="text-xs" style={{ color: "rgba(248,240,230,0.55)" }}>
                        {f.phone}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <div
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold"
                  style={{
                    fontFamily: "Barlow Condensed, sans-serif",
                    background: "rgba(228,148,12,0.08)",
                    color: "var(--cla-amber)",
                    border: "1px solid rgba(228,148,12,0.2)",
                  }}
                >
                  <BookOpen size={12} />
                  {f.classes_count} {f.classes_count === 1 ? "class" : "classes"}
                </div>

                <button
                  onClick={() => openAssign(f)}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition-all"
                  style={{
                    fontFamily: "Barlow Condensed, sans-serif",
                    background: "rgba(91,45,142,0.12)",
                    color: "#b47fea",
                    border: "1px solid rgba(91,45,142,0.25)",
                  }}
                >
                  <BookMarked size={12} />
                  Assign Classes
                </button>

                <button
                  onClick={() => openEdit(f)}
                  className="p-2 rounded-lg transition-all"
                  style={{ color: "rgba(248,240,230,0.45)" }}
                >
                  <Edit2 size={16} />
                </button>

                <button
                  onClick={() => handleDelete(f.id)}
                  className="p-2 rounded-lg transition-all"
                  style={{ color: "rgba(139,26,26,0.7)" }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}

          {facilitators.length === 0 && (
            <div className="cla-card p-12 text-center">
              <p
                className="text-lg font-bold mb-2"
                style={{ fontFamily: "Barlow Condensed, sans-serif" }}
              >
                No facilitators yet
              </p>
              <p className="text-sm mb-6" style={{ color: "rgba(248,240,230,0.45)" }}>
                Add your first facilitator to get started.
              </p>
              <Button variant="primary" size="sm" onClick={openAdd}>
                <Plus size={16} />
                Add Facilitator
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Add / Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editTarget ? "Edit Facilitator" : "Add Facilitator"}
      >
        <div className="flex flex-col gap-4">
          <Input
            label="Full Name"
            placeholder="e.g. Pastor Emmanuel"
            value={form.full_name}
            onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
            error={errors.full_name}
          />
          <Input
            label="Email (Optional)"
            type="email"
            placeholder="pastor@claonline.org"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          />
          <Input
            label="Phone (Optional)"
            type="tel"
            placeholder="0812 345 6789"
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
          />
          <div className="flex gap-3 mt-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)} className="flex-1">
              Cancel
            </Button>
            <Button variant="primary" loading={saving} onClick={handleSave} className="flex-1">
              {editTarget ? "Save Changes" : "Add Facilitator"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Assign Classes Modal */}
      <Modal
        open={!!assignTarget}
        onClose={() => setAssignTarget(null)}
        title={assignTarget ? `Assign Classes — ${assignTarget.full_name}` : ""}
        maxWidth="520px"
      >
        {assignTarget && (
          <div className="flex flex-col gap-5">
            <p className="text-sm" style={{ color: "rgba(248,240,230,0.55)" }}>
              Select any classes. A facilitator can be assigned across multiple classes and service times.
            </p>

            {classesLoading ? (
              <div className="flex items-center justify-center py-8">
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
            ) : (
              <div className="flex flex-col gap-3">
                {/* Slot tabs */}
                <div
                  className="flex rounded-lg overflow-hidden"
                  style={{ border: "1px solid rgba(228,148,12,0.2)" }}
                >
                  {(["8am", "10am", "12pm"] as Slot[]).map((slot) => {
                    const count = allClasses.filter(
                      (c) => c.slot === slot && selectedClassIds.has(c.id)
                    ).length;
                    const isActive = activeSlotTab === slot;
                    return (
                      <button
                        key={slot}
                        onClick={() => setActiveSlotTab(slot)}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-bold transition-all"
                        style={{
                          fontFamily: "Barlow Condensed, sans-serif",
                          background: isActive
                            ? "linear-gradient(135deg,#E89A10,#F8BA18)"
                            : "transparent",
                          color: isActive ? "#200909" : "rgba(248,240,230,0.55)",
                        }}
                      >
                        {slot}
                        {count > 0 && (
                          <span
                            className="text-xs rounded-full px-1.5 py-0.5 font-bold"
                            style={{
                              background: isActive ? "rgba(26,5,5,0.25)" : "rgba(228,148,12,0.2)",
                              color: isActive ? "#200909" : "#F8BA18",
                              lineHeight: 1,
                            }}
                          >
                            {count}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Classes for active tab */}
                <div className="flex flex-col gap-1.5 max-h-64 overflow-y-auto pr-1">
                  {allClasses
                    .filter((c) => c.slot === activeSlotTab)
                    .map((cls) => {
                      const isChecked = selectedClassIds.has(cls.id);
                      const takenByOther =
                        cls.facilitator_id !== null &&
                        cls.facilitator_id !== assignTarget.id;
                      const currentFacName = takenByOther
                        ? (facilitatorNamesById[cls.facilitator_id!] ?? "another facilitator")
                        : null;

                      return (
                        <label
                          key={cls.id}
                          className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all"
                          style={{
                            background: isChecked
                              ? "rgba(228,148,12,0.1)"
                              : "rgba(255,255,255,0.03)",
                            border: `1px solid ${isChecked ? "rgba(228,148,12,0.3)" : "rgba(255,255,255,0.06)"}`,
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleClass(cls.id)}
                            className="accent-amber-500 w-4 h-4 shrink-0"
                          />
                          <span
                            className="flex-1 text-sm font-semibold"
                            style={{ color: isChecked ? "#F8BA18" : "#E8E0D8" }}
                          >
                            {cls.name}
                          </span>
                          {currentFacName && (
                            <span
                              className="text-xs shrink-0 max-w-[120px] truncate"
                              style={{ color: "rgba(248,240,230,0.4)" }}
                              title={`Currently: ${currentFacName}`}
                            >
                              {currentFacName}
                            </span>
                          )}
                        </label>
                      );
                    })}
                </div>
              </div>
            )}

            <div
              className="flex items-center justify-between text-xs"
              style={{ color: "rgba(248,240,230,0.4)" }}
            >
              <span>{selectedClassIds.size} selected</span>
              <button
                onClick={() => setSelectedClassIds(new Set())}
                className="underline"
                style={{ color: "rgba(248,240,230,0.35)" }}
              >
                Clear all
              </button>
            </div>

            {/* Replacement confirmation */}
            {showConfirm && (
              <div
                className="flex flex-col gap-3 p-4 rounded-xl"
                style={{
                  background: "rgba(212,100,10,0.1)",
                  border: "1px solid rgba(212,100,10,0.3)",
                }}
              >
                <div className="flex items-start gap-2">
                  <AlertTriangle size={15} style={{ color: "#F8BA18", flexShrink: 0, marginTop: 1 }} />
                  <p className="text-sm font-semibold" style={{ color: "#F8BA18" }}>
                    This will replace the current facilitator for:
                  </p>
                </div>
                <ul className="flex flex-col gap-1 pl-5">
                  {pendingReplacements.map((r) => (
                    <li key={r.classId} className="text-sm" style={{ color: "rgba(248,240,230,0.75)" }}>
                      <span style={{ color: "#E8E0D8", fontWeight: 600 }}>{r.className}</span>
                      {" "}— currently{" "}
                      <span style={{ color: "rgba(248,240,230,0.55)" }}>{r.currentName}</span>
                    </li>
                  ))}
                </ul>
                <p className="text-xs" style={{ color: "rgba(248,240,230,0.45)" }}>
                  They will be unlinked from {pendingReplacements.length === 1 ? "that class" : "those classes"}. Confirm to proceed.
                </p>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={() => setShowConfirm(false)} className="flex-1">
                    Go Back
                  </Button>
                  <Button variant="primary" size="sm" loading={assignSaving} onClick={doAssignSave} className="flex-1">
                    Yes, Replace
                  </Button>
                </div>
              </div>
            )}

            {!showConfirm && (
              <div className="flex gap-3">
                <Button variant="secondary" onClick={() => setAssignTarget(null)} className="flex-1">
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  loading={assignSaving}
                  onClick={handleAssignRequest}
                  className="flex-1"
                >
                  Save Assignments
                </Button>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

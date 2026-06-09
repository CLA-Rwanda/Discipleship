"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Plus, Trash2, Edit2, BookOpen, BookMarked, AlertTriangle, Upload, MessageSquare, Copy, Check, Download } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { SlotBadge } from "@/components/ui/Badge";
import { createClient } from "@/lib/supabase";
import { deleteFacilitator } from "@/actions/admin";
import type { Facilitator } from "@/lib/types";

interface FacilitatorWithClasses extends Facilitator {
  classes_count: number;
}

interface ClassOption {
  id: string;
  name: string;
  slot: string;
  facilitator_id: string | null;
}

interface BulkRow { full_name: string; email: string; phone: string }

const EMPTY_FORM = { full_name: "", email: "", phone: "" };

// ── Parsers ──────────────────────────────────────────────────

function parseCSVText(text: string): BulkRow[] {
  const lines = text.trim().split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return [];

  const header = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/["']/g, ""));
  const firstIdx  = header.findIndex((h) => h === "first_name" || h === "firstname");
  const lastIdx   = header.findIndex((h) => h === "last_name"  || h === "lastname");
  const emailIdx  = header.findIndex((h) => h === "email");
  const phoneIdx  = header.findIndex((h) => h === "phone");

  const rows: BulkRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.trim().replace(/^["']|["']$/g, ""));
    const firstName = firstIdx >= 0 ? (cols[firstIdx] ?? "") : "";
    const lastName  = lastIdx  >= 0 ? (cols[lastIdx]  ?? "") : "";
    const full_name = [firstName, lastName].filter(Boolean).join(" ") || (cols[0] ?? "");
    const email     = emailIdx >= 0 ? (cols[emailIdx] ?? "") : "";
    const phone     = phoneIdx >= 0 ? (cols[phoneIdx] ?? "") : "";
    if (full_name.trim()) rows.push({ full_name: full_name.trim(), email: email.trim(), phone: phone.trim() });
  }
  return rows;
}

function parsePasteText(text: string): BulkRow[] {
  const lines = text.trim().split(/\r?\n/).filter((l) => l.trim());
  return lines.map((line) => {
    const parts = line.split(/[,\t]+/).map((p) => p.trim());
    // Try to detect email
    const emailIdx = parts.findIndex((p) => p.includes("@"));
    const email    = emailIdx >= 0 ? parts.splice(emailIdx, 1)[0] : "";
    const full_name = parts.slice(0, 2).join(" ").trim();
    const phone = parts[2] ?? "";
    return { full_name, email, phone };
  }).filter((r) => r.full_name);
}

// ── Component ────────────────────────────────────────────────

export default function FacilitatorsPage() {
  const [facilitators, setFacilitators] = useState<FacilitatorWithClasses[]>([]);
  const [loading, setLoading]           = useState(true);

  // Add/edit modal
  const [modalOpen, setModalOpen]   = useState(false);
  const [editTarget, setEditTarget] = useState<FacilitatorWithClasses | null>(null);
  const [form, setForm]             = useState(EMPTY_FORM);
  const [saving, setSaving]         = useState(false);
  const [errors, setErrors]         = useState<Record<string, string>>({});

  // Assign classes modal
  const [assignTarget, setAssignTarget]   = useState<FacilitatorWithClasses | null>(null);
  const [allClasses, setAllClasses]       = useState<ClassOption[]>([]);
  const [facilitatorNamesById, setFacilitatorNamesById] = useState<Record<string, string>>({});
  const [selectedClassIds, setSelectedClassIds]         = useState<Set<string>>(new Set());
  const [classesLoading, setClassesLoading] = useState(false);
  const [assignSaving, setAssignSaving]   = useState(false);
  const [pendingReplacements, setPendingReplacements] = useState<{ classId: string; className: string; currentName: string }[]>([]);
  const [slotDisplacements, setSlotDisplacements]     = useState<{ oldName: string; newName: string; slot: string }[]>([]);
  const [existingSlotConflicts, setExistingSlotConflicts] = useState<{ slot: string; names: string[] }[]>([]);
  const [showConfirm, setShowConfirm]     = useState(false);
  const [activeSlotTab, setActiveSlotTab] = useState<string>("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting]           = useState(false);

  // Bulk upload modal
  const [bulkOpen, setBulkOpen]         = useState(false);
  const [bulkTab, setBulkTab]           = useState<"csv" | "paste">("csv");
  const [bulkRows, setBulkRows]         = useState<BulkRow[]>([]);
  const [bulkPaste, setBulkPaste]       = useState("");
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkResult, setBulkResult]     = useState<{ added: number; skipped: number } | null>(null);
  const [bulkError, setBulkError]       = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // SMS export modal
  const [smsTarget, setSmsTarget]       = useState<FacilitatorWithClasses | null>(null);
  const [smsClasses, setSmsClasses]     = useState<{ name: string; slot: string; members: any[] }[]>([]);
  const [smsLoading, setSmsLoading]     = useState(false);
  const [smsCopied, setSmsCopied]       = useState(false);

  const fetchFacilitators = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("facilitators")
      .select("*, classes(count)")
      .order("full_name");
    const enriched = (data ?? []).map((f: any) => ({ ...f, classes_count: f.classes?.[0]?.count ?? 0 }));
    setFacilitators(enriched);
    setLoading(false);
  }, []);

  useEffect(() => { fetchFacilitators(); }, [fetchFacilitators]);

  function openAdd()  { setEditTarget(null); setForm(EMPTY_FORM); setErrors({}); setModalOpen(true); }
  function openEdit(f: FacilitatorWithClasses) { setEditTarget(f); setForm({ full_name: f.full_name, email: f.email ?? "", phone: f.phone ?? "" }); setErrors({}); setModalOpen(true); }

  async function openAssign(f: FacilitatorWithClasses) {
    setAssignTarget(f);
    setShowConfirm(false);
    setPendingReplacements([]);
    setSlotDisplacements([]);
    setExistingSlotConflicts([]);
    setClassesLoading(true);
    const supabase = createClient();
    const [{ data: classData }, { data: facData }] = await Promise.all([
      supabase.from("classes").select("id, name, slot, facilitator_id").eq("is_active", true).order("name"),
      supabase.from("facilitators").select("id, full_name"),
    ]);
    const classes = (classData ?? []) as ClassOption[];
    setAllClasses(classes);
    const namesMap: Record<string, string> = {};
    for (const fac of facData ?? []) namesMap[fac.id] = fac.full_name;
    setFacilitatorNamesById(namesMap);
    const myClasses = classes.filter((c) => c.facilitator_id === f.id);
    setSelectedClassIds(new Set(myClasses.map((c) => c.id)));

    // Detect existing same-slot duplicates in DB
    const bySlot = new Map<string, string[]>();
    for (const c of myClasses) {
      if (!bySlot.has(c.slot)) bySlot.set(c.slot, []);
      bySlot.get(c.slot)!.push(c.name);
    }
    const conflicts = Array.from(bySlot.entries())
      .filter(([, names]) => names.length > 1)
      .map(([slot, names]) => ({ slot, names }));
    setExistingSlotConflicts(conflicts);

    const slots = Array.from(new Set(classes.map((c) => c.slot))).sort();
    setActiveSlotTab(slots[0] ?? "");
    setClassesLoading(false);
  }

  async function openSmsExport(f: FacilitatorWithClasses) {
    setSmsTarget(f);
    setSmsLoading(true);
    setSmsClasses([]);
    const supabase = createClient();
    const { data: classData } = await supabase
      .from("classes")
      .select("name, slot, members(id, first_name, last_name, phone)")
      .eq("facilitator_id", f.id)
      .eq("is_active", true)
      .order("name");
    setSmsClasses((classData ?? []).map((c: any) => ({ name: c.name, slot: c.slot, members: c.members ?? [] })));
    setSmsLoading(false);
  }

  const smsText = smsClasses
    .flatMap((cls) => cls.members)
    .map((m: any) => `${m.first_name} ${m.last_name} — ${m.phone || "(no phone)"}`)
    .join("\n");

  async function copySms() {
    await navigator.clipboard.writeText(smsText);
    setSmsCopied(true);
    setTimeout(() => setSmsCopied(false), 2000);
  }

  function toggleClass(classId: string) {
    const cls = allClasses.find((c) => c.id === classId);
    if (!cls) return;
    setSelectedClassIds((prev) => {
      const next = new Set(prev);
      if (next.has(classId)) {
        next.delete(classId);
      } else {
        // Enforce one class per slot — auto-deselect any other class at the same slot
        allClasses
          .filter((c) => c.slot === cls.slot && c.id !== classId)
          .forEach((c) => next.delete(c.id));
        next.add(classId);
      }
      return next;
    });
  }

  function handleAssignRequest() {
    if (!assignTarget) return;
    const prevIds  = new Set(allClasses.filter((c) => c.facilitator_id === assignTarget.id).map((c) => c.id));
    const toAssign = Array.from(selectedClassIds).filter((id) => !prevIds.has(id));

    // Classes newly selected that already belong to a different facilitator
    const replacements = toAssign
      .map((id) => allClasses.find((c) => c.id === id))
      .filter((c) => c && c.facilitator_id && c.facilitator_id !== assignTarget.id)
      .map((c) => ({ classId: c!.id, className: c!.name, currentName: facilitatorNamesById[c!.facilitator_id!] ?? "another facilitator" }));

    // Classes the facilitator currently holds that will be dropped because a
    // different class at the same slot is now selected
    const displacements = Array.from(prevIds)
      .filter((id) => !selectedClassIds.has(id))
      .map((id) => allClasses.find((c) => c.id === id))
      .filter((old): old is ClassOption => {
        if (!old) return false;
        return Array.from(selectedClassIds).some((newId) => {
          const nc = allClasses.find((c) => c.id === newId);
          return nc?.slot === old.slot && !prevIds.has(newId);
        });
      })
      .map((old) => {
        const newCls = allClasses.find((c) => selectedClassIds.has(c.id) && c.slot === old.slot && !prevIds.has(c.id));
        return { oldName: old.name, newName: newCls?.name ?? "another class", slot: old.slot };
      });

    setSlotDisplacements(displacements);
    setPendingReplacements(replacements);
    if (replacements.length > 0 || displacements.length > 0) setShowConfirm(true);
    else doAssignSave();
  }

  async function doAssignSave() {
    if (!assignTarget) return;
    setAssignSaving(true);
    setShowConfirm(false);
    const supabase = createClient();
    const prevIds   = new Set(allClasses.filter((c) => c.facilitator_id === assignTarget.id).map((c) => c.id));
    const toAssign  = Array.from(selectedClassIds).filter((id) => !prevIds.has(id));
    const toUnassign = Array.from(prevIds).filter((id) => !selectedClassIds.has(id));
    if (toAssign.length)   await supabase.from("classes").update({ facilitator_id: assignTarget.id }).in("id", toAssign);
    if (toUnassign.length) await supabase.from("classes").update({ facilitator_id: null }).in("id", toUnassign);
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
    const payload = { full_name: form.full_name.trim(), email: form.email.trim() || null, phone: form.phone.trim() || null };
    if (editTarget) await supabase.from("facilitators").update(payload).eq("id", editTarget.id);
    else             await supabase.from("facilitators").insert(payload);
    setSaving(false);
    setModalOpen(false);
    fetchFacilitators();
  }

  async function handleDelete(id: string) {
    setDeleting(true);
    const result = await deleteFacilitator(id);
    setDeleting(false);
    if (result.success) { setConfirmDeleteId(null); fetchFacilitators(); }
  }

  // ── Bulk upload ──────────────────────────────────────────────

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setBulkRows(parseCSVText(text));
      setBulkError("");
      setBulkResult(null);
    };
    reader.readAsText(file);
  }

  function handlePasteParse() {
    const parsed = parsePasteText(bulkPaste);
    setBulkRows(parsed);
    setBulkError("");
    setBulkResult(null);
    if (parsed.length === 0) setBulkError("No names could be parsed from that text.");
  }

  async function handleBulkInsert() {
    if (bulkRows.length === 0) return;
    setBulkUploading(true);
    setBulkError("");
    const supabase = createClient();
    // Fetch existing emails to detect duplicates
    const { data: existing } = await supabase.from("facilitators").select("email");
    const existingEmails = new Set((existing ?? []).map((r: any) => (r.email ?? "").toLowerCase()));

    let added = 0; let skipped = 0;
    for (const row of bulkRows) {
      if (row.email && existingEmails.has(row.email.toLowerCase())) { skipped++; continue; }
      const { error } = await supabase.from("facilitators").insert({
        full_name: row.full_name,
        email:     row.email || null,
        phone:     row.phone || null,
      });
      if (error) skipped++;
      else { added++; if (row.email) existingEmails.add(row.email.toLowerCase()); }
    }

    setBulkUploading(false);
    setBulkResult({ added, skipped });
    setBulkRows([]);
    setBulkPaste("");
    fetchFacilitators();
  }

  function closeBulk() {
    setBulkOpen(false);
    setBulkRows([]);
    setBulkPaste("");
    setBulkResult(null);
    setBulkError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const assignSlots = Array.from(new Set(allClasses.map((c) => c.slot))).sort();

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold" style={{ fontFamily: "Barlow Condensed, sans-serif" }}>Facilitators</h1>
          <p className="text-sm mt-0.5" style={{ color: "rgba(248,240,230,0.5)" }}>{facilitators.length} facilitators</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => { setBulkOpen(true); setBulkTab("csv"); setBulkResult(null); }}>
            <Upload size={15} /> Add Multiple
          </Button>
          <Button variant="primary" size="sm" onClick={openAdd}>
            <Plus size={16} /> Add Facilitator
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="spinner" style={{ width: 28, height: 28, borderTopColor: "var(--cla-amber)", borderColor: "rgba(228,148,12,0.2)" }} />
        </div>
      ) : (
        <div className="grid gap-3">
          {facilitators.map((f) => (
            <div key={f.id} className="cla-card p-4 flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 font-bold"
                  style={{ fontFamily: "Barlow Condensed, sans-serif", background: "rgba(228,148,12,0.15)", color: "var(--cla-amber)", fontSize: "1rem" }}>
                  {f.full_name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="font-bold">{f.full_name}</p>
                  <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                    {f.email && <p className="text-xs" style={{ color: "rgba(248,240,230,0.55)" }}>{f.email}</p>}
                    {f.phone && <p className="text-xs" style={{ color: "rgba(248,240,230,0.55)" }}>{f.phone}</p>}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold"
                  style={{ fontFamily: "Barlow Condensed, sans-serif", background: "rgba(228,148,12,0.08)", color: "var(--cla-amber)", border: "1px solid rgba(228,148,12,0.2)" }}>
                  <BookOpen size={12} />{f.classes_count} {f.classes_count === 1 ? "class" : "classes"}
                </div>
                <button onClick={() => openAssign(f)} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition-all"
                  style={{ fontFamily: "Barlow Condensed, sans-serif", background: "rgba(91,45,142,0.12)", color: "#b47fea", border: "1px solid rgba(91,45,142,0.25)" }}>
                  <BookMarked size={12} /> Assign Classes
                </button>
                {f.classes_count > 0 && (
                  <button onClick={() => openSmsExport(f)} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition-all"
                    style={{ fontFamily: "Barlow Condensed, sans-serif", background: "rgba(34,197,94,0.08)", color: "#4ade80", border: "1px solid rgba(34,197,94,0.2)" }}>
                    <MessageSquare size={12} /> Export for Messaging
                  </button>
                )}
                <button onClick={() => openEdit(f)} className="p-2 rounded-lg transition-all" style={{ color: "rgba(248,240,230,0.45)" }}>
                  <Edit2 size={16} />
                </button>
                {confirmDeleteId === f.id ? (
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold" style={{ color: "#ff6b6b" }}>Delete?</span>
                    <button onClick={() => setConfirmDeleteId(null)} className="text-xs px-2 py-1 rounded" style={{ color: "rgba(248,240,230,0.5)", border: "1px solid rgba(255,255,255,0.1)" }}>No</button>
                    <button onClick={() => handleDelete(f.id)} disabled={deleting} className="text-xs px-2 py-1 rounded font-bold"
                      style={{ background: "rgba(192,40,40,0.25)", color: "#ff6b6b", border: "1px solid rgba(192,40,40,0.4)" }}>
                      {deleting ? "…" : "Yes, delete"}
                    </button>
                  </div>
                ) : (
                  <button onClick={() => setConfirmDeleteId(f.id)} className="p-2 rounded-lg transition-all" style={{ color: "rgba(192,40,40,0.5)" }} title="Delete facilitator">
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </div>
          ))}
          {facilitators.length === 0 && (
            <div className="cla-card p-12 text-center">
              <p className="text-lg font-bold mb-2" style={{ fontFamily: "Barlow Condensed, sans-serif" }}>No facilitators yet</p>
              <p className="text-sm mb-6" style={{ color: "rgba(248,240,230,0.45)" }}>Add your first facilitator to get started.</p>
              <Button variant="primary" size="sm" onClick={openAdd}><Plus size={16} /> Add Facilitator</Button>
            </div>
          )}
        </div>
      )}

      {/* Add / Edit Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editTarget ? "Edit Facilitator" : "Add Facilitator"}>
        <div className="flex flex-col gap-4">
          <Input label="Full Name" placeholder="e.g. Pastor Emmanuel" value={form.full_name}
            onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} error={errors.full_name} />
          <Input label="Email (Optional)" type="email" placeholder="pastor@claonline.org" value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
          <Input label="Phone (Optional)" type="tel" placeholder="0812 345 6789" value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
          <div className="flex gap-3 mt-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)} className="flex-1">Cancel</Button>
            <Button variant="primary" loading={saving} onClick={handleSave} className="flex-1">
              {editTarget ? "Save Changes" : "Add Facilitator"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Assign Classes Modal */}
      <Modal open={!!assignTarget} onClose={() => setAssignTarget(null)} title={assignTarget ? `Assign Classes — ${assignTarget.full_name}` : ""} maxWidth="520px">
        {assignTarget && (
          <div className="flex flex-col gap-5">
            <p className="text-sm" style={{ color: "rgba(248,240,230,0.55)" }}>
              Select one class per service time. A facilitator cannot lead two classes happening at the same time.
            </p>
            {existingSlotConflicts.length > 0 && (
              <div className="flex flex-col gap-2 p-3 rounded-xl" style={{ background: "rgba(192,40,40,0.12)", border: "1px solid rgba(192,40,40,0.35)" }}>
                <div className="flex items-center gap-2">
                  <AlertTriangle size={14} style={{ color: "#ff6b6b", flexShrink: 0 }} />
                  <span className="text-sm font-bold" style={{ color: "#ff6b6b" }}>Slot conflict detected</span>
                </div>
                {existingSlotConflicts.map(({ slot, names }) => (
                  <p key={slot} className="text-xs" style={{ color: "rgba(248,240,230,0.65)" }}>
                    <span style={{ fontWeight: 600 }}>{slot}</span>: {names.join(", ")} — select only one.
                  </p>
                ))}
              </div>
            )}
            {classesLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="spinner" style={{ width: 24, height: 24, borderTopColor: "var(--cla-amber)", borderColor: "rgba(228,148,12,0.2)" }} />
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex rounded-lg overflow-hidden" style={{ border: "1px solid rgba(228,148,12,0.2)" }}>
                  {assignSlots.map((slot) => {
                    const count = allClasses.filter((c) => c.slot === slot && selectedClassIds.has(c.id)).length;
                    const isActive = activeSlotTab === slot;
                    return (
                      <button key={slot} onClick={() => setActiveSlotTab(slot)} className="flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-bold transition-all"
                        style={{ fontFamily: "Barlow Condensed, sans-serif", background: isActive ? "linear-gradient(135deg,#E89A10,#F8BA18)" : "transparent", color: isActive ? "#200909" : "rgba(248,240,230,0.55)" }}>
                        {slot}
                        {count > 0 && <span className="text-xs rounded-full px-1.5 py-0.5 font-bold" style={{ background: isActive ? "rgba(26,5,5,0.25)" : "rgba(228,148,12,0.2)", color: isActive ? "#200909" : "#F8BA18", lineHeight: 1 }}>{count}</span>}
                      </button>
                    );
                  })}
                </div>
                <div className="flex flex-col gap-1.5 max-h-64 overflow-y-auto pr-1">
                  {allClasses.filter((c) => c.slot === activeSlotTab).map((cls) => {
                    const isChecked      = selectedClassIds.has(cls.id);
                    const takenByOther   = cls.facilitator_id !== null && cls.facilitator_id !== assignTarget.id;
                    const currentFacName = takenByOther ? (facilitatorNamesById[cls.facilitator_id!] ?? "another facilitator") : null;
                    // Another class at this slot is already selected
                    const slotTaken = !isChecked && allClasses.some(
                      (c) => c.slot === cls.slot && c.id !== cls.id && selectedClassIds.has(c.id)
                    );
                    return (
                      <label key={cls.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all"
                        style={{
                          background: isChecked ? "rgba(228,148,12,0.1)" : slotTaken ? "rgba(255,255,255,0.015)" : "rgba(255,255,255,0.03)",
                          border: `1px solid ${isChecked ? "rgba(228,148,12,0.3)" : "rgba(255,255,255,0.06)"}`,
                          opacity: slotTaken ? 0.45 : 1,
                        }}>
                        <input type="checkbox" checked={isChecked} onChange={() => toggleClass(cls.id)} className="accent-amber-500 w-4 h-4 shrink-0" />
                        <span className="flex-1 text-sm font-semibold" style={{ color: isChecked ? "#F8BA18" : "#E8E0D8" }}>{cls.name}</span>
                        {slotTaken && <span className="text-xs shrink-0" style={{ color: "rgba(248,240,230,0.35)" }}>slot taken</span>}
                        {!slotTaken && currentFacName && <span className="text-xs shrink-0 max-w-[120px] truncate" style={{ color: "rgba(248,240,230,0.4)" }} title={`Currently: ${currentFacName}`}>{currentFacName}</span>}
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="flex items-center justify-between text-xs" style={{ color: "rgba(248,240,230,0.4)" }}>
              <span>{selectedClassIds.size} selected</span>
              <button onClick={() => setSelectedClassIds(new Set())} className="underline" style={{ color: "rgba(248,240,230,0.35)" }}>Clear all</button>
            </div>
            {showConfirm && (
              <div className="flex flex-col gap-3 p-4 rounded-xl" style={{ background: "rgba(212,100,10,0.1)", border: "1px solid rgba(212,100,10,0.3)" }}>
                <div className="flex items-start gap-2">
                  <AlertTriangle size={15} style={{ color: "#F8BA18", flexShrink: 0, marginTop: 1 }} />
                  <p className="text-sm font-semibold" style={{ color: "#F8BA18" }}>Please confirm these changes:</p>
                </div>
                {slotDisplacements.length > 0 && (
                  <ul className="flex flex-col gap-1 pl-5">
                    {slotDisplacements.map((d, i) => (
                      <li key={i} className="text-sm" style={{ color: "rgba(248,240,230,0.75)" }}>
                        <span style={{ fontWeight: 600, color: "#E8E0D8" }}>{assignTarget!.full_name}</span> will be moved from{" "}
                        <span style={{ fontWeight: 600, color: "#F8BA18" }}>{d.oldName}</span> to{" "}
                        <span style={{ fontWeight: 600, color: "#F8BA18" }}>{d.newName}</span>{" "}
                        <span style={{ color: "rgba(248,240,230,0.45)" }}>({d.slot})</span>
                      </li>
                    ))}
                  </ul>
                )}
                {pendingReplacements.length > 0 && (
                  <>
                    <p className="text-xs font-semibold pl-1" style={{ color: "rgba(248,240,230,0.5)" }}>Also replacing current facilitator on:</p>
                    <ul className="flex flex-col gap-1 pl-5">
                      {pendingReplacements.map((r) => (
                        <li key={r.classId} className="text-sm" style={{ color: "rgba(248,240,230,0.75)" }}>
                          <span style={{ color: "#E8E0D8", fontWeight: 600 }}>{r.className}</span>{" "}— currently{" "}
                          <span style={{ color: "rgba(248,240,230,0.55)" }}>{r.currentName}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={() => setShowConfirm(false)} className="flex-1">Go Back</Button>
                  <Button variant="primary" size="sm" loading={assignSaving} onClick={doAssignSave} className="flex-1">Confirm</Button>
                </div>
              </div>
            )}
            {!showConfirm && (
              <div className="flex gap-3">
                <Button variant="secondary" onClick={() => setAssignTarget(null)} className="flex-1">Cancel</Button>
                <Button variant="primary" loading={assignSaving} onClick={handleAssignRequest} className="flex-1">Save Assignments</Button>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Bulk Upload Modal */}
      <Modal open={bulkOpen} onClose={closeBulk} title="Add Multiple Facilitators" maxWidth="580px">
        <div className="flex flex-col gap-5">
          {bulkResult ? (
            <div className="flex flex-col gap-4">
              <div className="p-4 rounded-xl" style={{ background: "rgba(107,122,0,0.1)", border: "1px solid rgba(200,212,0,0.25)" }}>
                <p className="font-bold" style={{ color: "#C8D400" }}>{bulkResult.added} facilitator{bulkResult.added !== 1 ? "s" : ""} added.</p>
                {bulkResult.skipped > 0 && <p className="text-sm mt-1" style={{ color: "rgba(248,240,230,0.5)" }}>{bulkResult.skipped} skipped (duplicate email or error).</p>}
              </div>
              <Button variant="primary" onClick={closeBulk} className="w-full">Done</Button>
            </div>
          ) : (
            <>
              {/* Tab */}
              <div className="flex gap-1 p-1 rounded-xl w-fit" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(228,148,12,0.1)" }}>
                {([{ key: "csv", label: "CSV File" }, { key: "paste", label: "Paste Names" }] as const).map(({ key, label }) => (
                  <button key={key} onClick={() => { setBulkTab(key); setBulkRows([]); setBulkError(""); }}
                    className="px-4 py-2 rounded-lg text-sm font-bold transition-all"
                    style={{ fontFamily: "Barlow Condensed, sans-serif", background: bulkTab === key ? "linear-gradient(135deg,#E89A10,#F8BA18)" : "transparent", color: bulkTab === key ? "#200909" : "rgba(248,240,230,0.5)" }}>
                    {label}
                  </button>
                ))}
              </div>

              {bulkTab === "csv" && (
                <div className="flex flex-col gap-3">
                  <p className="text-xs" style={{ color: "rgba(248,240,230,0.5)" }}>
                    CSV must have columns: <code className="px-1 rounded" style={{ background: "rgba(255,255,255,0.07)" }}>first_name</code>, <code className="px-1 rounded" style={{ background: "rgba(255,255,255,0.07)" }}>last_name</code>, <code className="px-1 rounded" style={{ background: "rgba(255,255,255,0.07)" }}>email</code>, <code className="px-1 rounded" style={{ background: "rgba(255,255,255,0.07)" }}>phone</code> (phone optional)
                  </p>
                  <input ref={fileInputRef} type="file" accept=".csv,text/csv" onChange={handleFileChange} className="cla-input text-sm" />
                </div>
              )}

              {bulkTab === "paste" && (
                <div className="flex flex-col gap-3">
                  <p className="text-xs" style={{ color: "rgba(248,240,230,0.5)" }}>
                    One per line. Accepts comma-separated, tab-separated, or plain names. Email is auto-detected by the @ character.
                  </p>
                  <textarea rows={6} value={bulkPaste} onChange={(e) => setBulkPaste(e.target.value)}
                    placeholder={"John Smith, john@example.com\nJane Doe\tjane@example.com, +2348000000\nPastor Emmanuel"}
                    className="cla-input text-sm font-mono resize-y" />
                  <Button variant="secondary" size="sm" onClick={handlePasteParse} disabled={!bulkPaste.trim()}>
                    Parse Names
                  </Button>
                </div>
              )}

              {bulkError && <p className="text-sm" style={{ color: "#ff6b6b" }}>{bulkError}</p>}

              {bulkRows.length > 0 && (
                <div className="flex flex-col gap-2">
                  <p className="text-sm font-bold" style={{ fontFamily: "Barlow Condensed, sans-serif" }}>{bulkRows.length} facilitator{bulkRows.length !== 1 ? "s" : ""} to import — preview:</p>
                  <div className="rounded-lg overflow-hidden max-h-48 overflow-y-auto" style={{ border: "1px solid rgba(228,148,12,0.15)" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
                      <thead>
                        <tr style={{ background: "rgba(228,148,12,0.08)" }}>
                          <th style={{ padding: "6px 10px", textAlign: "left", color: "rgba(248,240,230,0.5)" }}>Name</th>
                          <th style={{ padding: "6px 10px", textAlign: "left", color: "rgba(248,240,230,0.5)" }}>Email</th>
                          <th style={{ padding: "6px 10px", textAlign: "left", color: "rgba(248,240,230,0.5)" }}>Phone</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bulkRows.slice(0, 20).map((r, i) => (
                          <tr key={i} style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                            <td style={{ padding: "5px 10px", color: "#E8E0D8" }}>{r.full_name}</td>
                            <td style={{ padding: "5px 10px", color: "rgba(248,240,230,0.6)" }}>{r.email || "—"}</td>
                            <td style={{ padding: "5px 10px", color: "rgba(248,240,230,0.6)" }}>{r.phone || "—"}</td>
                          </tr>
                        ))}
                        {bulkRows.length > 20 && (
                          <tr><td colSpan={3} style={{ padding: "5px 10px", color: "rgba(248,240,230,0.4)", fontStyle: "italic" }}>…and {bulkRows.length - 20} more</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex gap-3 mt-1">
                    <Button variant="secondary" onClick={() => setBulkRows([])} className="flex-1">Clear</Button>
                    <Button variant="primary" loading={bulkUploading} onClick={handleBulkInsert} className="flex-1">
                      Import {bulkRows.length} Facilitator{bulkRows.length !== 1 ? "s" : ""}
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </Modal>

      {/* SMS Export Modal */}
      <Modal open={!!smsTarget} onClose={() => { setSmsTarget(null); setSmsCopied(false); }} title={smsTarget ? `Export for Messaging — ${smsTarget.full_name}` : ""} maxWidth="480px">
        {smsTarget && (
          <div className="flex flex-col gap-4">
            <p className="text-sm" style={{ color: "rgba(248,240,230,0.55)" }}>
              Copy this list and paste it into your messaging app. One contact per line.
            </p>
            {smsLoading ? (
              <div className="flex items-center justify-center py-6">
                <div className="spinner" style={{ width: 24, height: 24, borderTopColor: "var(--cla-amber)", borderColor: "rgba(228,148,12,0.2)" }} />
              </div>
            ) : smsText ? (
              <>
                <pre className="rounded-lg p-4 text-sm font-mono overflow-auto max-h-64 whitespace-pre-wrap"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(228,148,12,0.15)", color: "#E8E0D8", lineHeight: 1.7 }}>
                  {smsText}
                </pre>
                <Button variant="primary" onClick={copySms} className="w-full">
                  {smsCopied ? <><Check size={16} /> Copied!</> : <><Copy size={16} /> Copy All</>}
                </Button>
              </>
            ) : (
              <p className="text-center py-8 text-sm" style={{ color: "rgba(248,240,230,0.4)" }}>
                No members in this facilitator's classes yet.
              </p>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

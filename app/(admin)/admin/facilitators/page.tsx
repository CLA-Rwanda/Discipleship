"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, Edit2, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { createClient } from "@/lib/supabase";
import type { Facilitator } from "@/lib/types";

interface FacilitatorWithClasses extends Facilitator {
  classes_count: number;
}

const EMPTY_FORM = { full_name: "", email: "", phone: "" };

export default function FacilitatorsPage() {
  const [facilitators, setFacilitators] = useState<FacilitatorWithClasses[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<FacilitatorWithClasses | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

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
          <p className="text-sm mt-0.5" style={{ color: "rgba(232,224,216,0.5)" }}>
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
              borderColor: "rgba(212,134,10,0.2)",
            }}
          />
        </div>
      ) : (
        <div className="grid gap-3">
          {facilitators.map((f) => (
            <div
              key={f.id}
              className="cla-card p-4 flex items-center justify-between gap-4"
            >
              <div className="flex items-center gap-4">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 font-bold text-sm"
                  style={{
                    fontFamily: "Barlow Condensed, sans-serif",
                    background: "rgba(212,134,10,0.15)",
                    color: "var(--cla-amber)",
                    fontSize: "1rem",
                  }}
                >
                  {f.full_name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="font-bold">{f.full_name}</p>
                  <div className="flex items-center gap-3 mt-0.5">
                    {f.email && (
                      <p
                        className="text-xs"
                        style={{ color: "rgba(232,224,216,0.55)" }}
                      >
                        {f.email}
                      </p>
                    )}
                    {f.phone && (
                      <p
                        className="text-xs"
                        style={{ color: "rgba(232,224,216,0.55)" }}
                      >
                        {f.phone}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold"
                  style={{
                    fontFamily: "Barlow Condensed, sans-serif",
                    background: "rgba(212,134,10,0.08)",
                    color: "var(--cla-amber)",
                    border: "1px solid rgba(212,134,10,0.2)",
                  }}
                >
                  <BookOpen size={12} />
                  {f.classes_count} {f.classes_count === 1 ? "class" : "classes"}
                </div>

                <button
                  onClick={() => openEdit(f)}
                  className="p-2 rounded-lg transition-all"
                  style={{ color: "rgba(232,224,216,0.45)" }}
                  title="Edit"
                >
                  <Edit2 size={16} />
                </button>

                <button
                  onClick={() => handleDelete(f.id)}
                  className="p-2 rounded-lg transition-all"
                  style={{ color: "rgba(139,26,26,0.7)" }}
                  title="Delete"
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
              <p
                className="text-sm mb-6"
                style={{ color: "rgba(232,224,216,0.45)" }}
              >
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
            <Button
              variant="secondary"
              onClick={() => setModalOpen(false)}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={saving}
              onClick={handleSave}
              className="flex-1"
            >
              {editTarget ? "Save Changes" : "Add Facilitator"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

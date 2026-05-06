"use client";

import { useState, useEffect } from "react";
import { CheckCircle, ClipboardList } from "lucide-react";
import { CLALogo } from "@/components/ui/CLALogo";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { logAttendance, getClassesForAttendance, type ClassForAttendance } from "@/actions/attendance";
import type { Slot } from "@/lib/types";

const SLOT_LABELS: Record<Slot, string> = {
  "8am": "8 AM",
  "10am": "10 AM",
  "12pm": "Midday",
};

export default function AttendancePage() {
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState("");
  const [allClasses, setAllClasses] = useState<ClassForAttendance[]>([]);
  const [successData, setSuccessData] = useState<{
    name: string;
    slot: Slot;
    class_name: string;
  } | null>(null);

  const [form, setForm] = useState({
    member_name: "",
    slot: "" as Slot | "",
    class_id: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    getClassesForAttendance().then(setAllClasses);
  }, []);

  function handleSlotChange(slot: Slot) {
    setForm((f) => ({ ...f, slot, class_id: "" }));
    setErrors((e) => ({ ...e, slot: "", class_id: "" }));
  }

  const classesForSlot = form.slot
    ? allClasses.filter((c) => c.slot === form.slot)
    : [];

  function validate() {
    const e: Record<string, string> = {};
    if (!form.member_name.trim()) e.member_name = "Full name is required";
    if (!form.slot) e.slot = "Please select your class time";
    if (!form.class_id) e.class_id = "Please select your class";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    setServerError("");

    const result = await logAttendance({
      member_name: form.member_name.trim(),
      class_id: form.class_id,
    });

    setLoading(false);

    if (result.success) {
      setSuccessData({
        name: form.member_name.trim(),
        slot: result.slot!,
        class_name: result.class_name!,
      });
      setSubmitted(true);
    } else {
      setServerError(result.error ?? "Something went wrong. Please try again.");
    }
  }

  // ── SUCCESS ─────────────────────────────────────────────────
  if (submitted && successData) {
    return (
      <div
        className="min-h-dvh flex flex-col items-center justify-center p-6 animate-fade-in"
        style={{ background: "var(--cla-bg-dark)" }}
      >
        <div className="w-full max-w-sm flex flex-col items-center gap-6 text-center">
          <CLALogo size="md" />
          <div className="success-checkmark">
            <CheckCircle size={40} color="#200909" strokeWidth={2.5} />
          </div>
          <div>
            <h1 className="text-3xl font-bold mb-2" style={{ fontFamily: "Barlow Condensed, sans-serif" }}>
              Attendance Recorded!
            </h1>
            <p style={{ color: "rgba(248,240,230,0.7)" }}>
              God bless you, {successData.name.split(" ")[0]}. We're glad you're here today.
            </p>
          </div>
          <div
            className="w-full rounded-xl p-5 text-left flex flex-col gap-3"
            style={{ background: "rgba(228,148,12,0.08)", border: "1px solid rgba(228,148,12,0.25)" }}
          >
            <div>
              <p className="text-xs uppercase tracking-widest mb-0.5" style={{ fontFamily: "Barlow Condensed, sans-serif", color: "rgba(248,240,230,0.45)" }}>Class</p>
              <p className="text-xl font-bold" style={{ fontFamily: "Barlow Condensed, sans-serif", color: "var(--cla-amber-light)" }}>{successData.class_name}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-widest mb-0.5" style={{ fontFamily: "Barlow Condensed, sans-serif", color: "rgba(248,240,230,0.45)" }}>Service Time</p>
              <p className="font-semibold">{SLOT_LABELS[successData.slot]}</p>
            </div>
          </div>
          <Button
            variant="secondary"
            onClick={() => {
              setSubmitted(false);
              setSuccessData(null);
              setForm({ member_name: "", slot: "", class_id: "" });
            }}
          >
            Mark Another Person
          </Button>
        </div>
      </div>
    );
  }

  // ── FORM ────────────────────────────────────────────────────
  return (
    <div className="min-h-dvh flex flex-col" style={{ background: "var(--cla-bg-dark)" }}>
      {/* Hero */}
      <div
        className="grain-overlay relative overflow-hidden"
        style={{ background: "linear-gradient(135deg, #200909 0%, #3e1212 50%, #5c1616 100%)", paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="relative z-10 flex flex-col items-center gap-3 px-6 py-8 text-center">
          <CLALogo size="md" />
          <div>
            <h1 className="text-3xl font-extrabold leading-tight" style={{ fontFamily: "Barlow Condensed, sans-serif" }}>
              Mark Your <span className="text-amber-gradient">Attendance</span>
            </h1>
            <p className="mt-1 text-sm" style={{ color: "rgba(248,240,230,0.6)" }}>
              Sign in for today's discipleship class
            </p>
          </div>
        </div>
        <div className="absolute top-0 left-0 w-40 h-40 rounded-full pointer-events-none" style={{ background: "radial-gradient(circle, rgba(228,148,12,0.1) 0%, transparent 70%)" }} />
      </div>

      {/* Form */}
      <div className="flex-1 flex flex-col items-center px-4 py-6">
        <form onSubmit={handleSubmit} className="w-full max-w-sm flex flex-col gap-5">

          {/* Name */}
          <div className="cla-card p-5">
            <Input
              label="Full Name"
              placeholder="e.g. Amara Johnson"
              value={form.member_name}
              onChange={(e) => setForm((f) => ({ ...f, member_name: e.target.value }))}
              error={errors.member_name}
              required
            />
          </div>

          {/* Class Time */}
          <div className="cla-card p-5 flex flex-col gap-4">
            <div>
              <h2 className="text-lg font-bold" style={{ fontFamily: "Barlow Condensed, sans-serif" }}>Class Time</h2>
              {errors.slot && <p className="text-xs mt-1" style={{ color: "#ff6b6b" }}>{errors.slot}</p>}
            </div>
            <div className="flex flex-col gap-3">
              {(["8am", "10am", "12pm"] as Slot[]).map((slot) => {
                const isSelected = form.slot === slot;
                return (
                  <label key={slot} className={`slot-radio ${isSelected ? "selected" : ""}`} style={{ cursor: "pointer" }}>
                    <input
                      type="radio"
                      name="slot"
                      value={slot}
                      checked={isSelected}
                      onChange={() => handleSlotChange(slot)}
                      className="sr-only"
                    />
                    <div
                      className="w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center transition-all"
                      style={{
                        borderColor: isSelected ? "var(--cla-amber)" : "rgba(228,148,12,0.3)",
                        background: isSelected ? "var(--cla-amber)" : "transparent",
                      }}
                    >
                      {isSelected && <div className="w-2 h-2 rounded-full" style={{ background: "#200909" }} />}
                    </div>
                    <span className="font-bold text-base" style={{ fontFamily: "Barlow Condensed, sans-serif" }}>
                      {SLOT_LABELS[slot]}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Class + Facilitator — revealed after slot is picked */}
          {form.slot && (
            <div className="cla-card p-5 flex flex-col gap-3 animate-fade-in">
              <div>
                <h2 className="text-lg font-bold" style={{ fontFamily: "Barlow Condensed, sans-serif" }}>Class Number and Facilitator</h2>
                {errors.class_id && <p className="text-xs mt-1" style={{ color: "#ff6b6b" }}>{errors.class_id}</p>}
              </div>
              <select
                value={form.class_id}
                onChange={(e) => setForm((f) => ({ ...f, class_id: e.target.value }))}
                className="cla-input"
              >
                <option value="">Choose…</option>
                {classesForSlot.map((cls) => (
                  <option key={cls.id} value={cls.id}>
                    {cls.name}{cls.facilitator_name ? ` — ${cls.facilitator_name}` : ""}
                  </option>
                ))}
              </select>
            </div>
          )}

          {serverError && (
            <div className="p-4 rounded-lg text-sm" style={{ background: "rgba(139,26,26,0.15)", border: "1px solid rgba(139,26,26,0.3)", color: "#ff6b6b" }}>
              {serverError}
            </div>
          )}

          <Button type="submit" variant="primary" size="lg" loading={loading} className="w-full">
            <ClipboardList size={18} />
            Mark Attendance
          </Button>
        </form>
      </div>
    </div>
  );
}

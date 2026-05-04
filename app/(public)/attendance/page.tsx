"use client";

import { useState } from "react";
import { CheckCircle, ClipboardList } from "lucide-react";
import { CLALogo } from "@/components/ui/CLALogo";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { logAttendance } from "@/actions/attendance";
import type { Slot } from "@/lib/types";

const SLOT_LABELS: Record<Slot, string> = {
  "8am": "8:00 AM",
  "10am": "10:00 AM",
  "12pm": "12:00 PM",
};

export default function AttendancePage() {
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState("");
  const [form, setForm] = useState({
    member_name: "",
    phone: "",
    service_slot: "" as Slot | "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  function validate() {
    const e: Record<string, string> = {};
    if (!form.member_name.trim()) e.member_name = "Full name is required";
    if (!form.phone.trim()) e.phone = "Phone number is required";
    if (!form.service_slot) e.service_slot = "Please select your service time";
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
      phone: form.phone.trim(),
      service_slot: form.service_slot as Slot,
    });

    setLoading(false);

    if (result.success) {
      setSubmitted(true);
    } else {
      setServerError(result.error ?? "Something went wrong. Please try again.");
    }
  }

  if (submitted) {
    return (
      <div
        className="min-h-dvh flex flex-col items-center justify-center p-6 animate-fade-in"
        style={{ background: "var(--cla-bg-dark)" }}
      >
        <div className="w-full max-w-sm flex flex-col items-center gap-6 text-center">
          <CLALogo size="md" />

          <div className="success-checkmark">
            <CheckCircle size={40} color="#1A0505" strokeWidth={2.5} />
          </div>

          <div>
            <h1
              className="text-3xl font-bold mb-2"
              style={{ fontFamily: "Barlow Condensed, sans-serif" }}
            >
              Attendance Recorded!
            </h1>
            <p style={{ color: "rgba(232,224,216,0.7)" }}>
              God bless you, {form.member_name.split(" ")[0]}. We're glad you're
              here today.
            </p>
          </div>

          <div
            className="w-full rounded-xl p-4 text-center"
            style={{
              background: "rgba(212,134,10,0.08)",
              border: "1px solid rgba(212,134,10,0.25)",
            }}
          >
            <p
              className="text-xs uppercase tracking-widest mb-1"
              style={{
                fontFamily: "Barlow Condensed, sans-serif",
                color: "rgba(232,224,216,0.45)",
              }}
            >
              Service Time
            </p>
            <p
              className="text-2xl font-bold"
              style={{
                fontFamily: "Barlow Condensed, sans-serif",
                color: "var(--cla-amber-light)",
              }}
            >
              {SLOT_LABELS[form.service_slot as Slot]} Service
            </p>
          </div>

          <Button
            variant="secondary"
            onClick={() => {
              setSubmitted(false);
              setForm({ member_name: "", phone: "", service_slot: "" });
            }}
          >
            Mark Another Person
          </Button>
        </div>
      </div>
    );
  }

  const slots: Slot[] = ["8am", "10am", "12pm"];

  return (
    <div
      className="min-h-dvh flex flex-col"
      style={{ background: "var(--cla-bg-dark)" }}
    >
      {/* Hero header */}
      <div
        className="grain-overlay relative overflow-hidden"
        style={{
          background: "linear-gradient(135deg, #1A0505 0%, #2E0A0A 50%, #4A0A0A 100%)",
          paddingTop: "env(safe-area-inset-top)",
        }}
      >
        <div className="relative z-10 flex flex-col items-center gap-3 px-6 py-8 text-center">
          <CLALogo size="md" />
          <div>
            <h1
              className="text-3xl font-extrabold leading-tight"
              style={{ fontFamily: "Barlow Condensed, sans-serif" }}
            >
              Mark Your{" "}
              <span className="text-amber-gradient">Attendance</span>
            </h1>
            <p
              className="mt-1 text-sm"
              style={{ color: "rgba(232,224,216,0.6)" }}
            >
              Sign in for today's discipleship class
            </p>
          </div>
        </div>
        <div
          className="absolute top-0 left-0 w-40 h-40 rounded-full pointer-events-none"
          style={{
            background:
              "radial-gradient(circle, rgba(212,134,10,0.1) 0%, transparent 70%)",
          }}
        />
      </div>

      {/* Form */}
      <div className="flex-1 flex flex-col items-center px-4 py-6">
        <form
          onSubmit={handleSubmit}
          className="w-full max-w-sm flex flex-col gap-5"
        >
          <div className="cla-card p-5 flex flex-col gap-4">
            <h2
              className="text-lg font-bold"
              style={{ fontFamily: "Barlow Condensed, sans-serif" }}
            >
              Your Details
            </h2>

            <Input
              label="Full Name"
              placeholder="e.g. Amara Johnson"
              value={form.member_name}
              onChange={(e) =>
                setForm((f) => ({ ...f, member_name: e.target.value }))
              }
              error={errors.member_name}
              required
            />

            <Input
              label="Phone Number"
              placeholder="e.g. 0812 345 6789"
              type="tel"
              value={form.phone}
              onChange={(e) =>
                setForm((f) => ({ ...f, phone: e.target.value }))
              }
              error={errors.phone}
              required
            />
          </div>

          <div className="cla-card p-5 flex flex-col gap-4">
            <h2
              className="text-lg font-bold"
              style={{ fontFamily: "Barlow Condensed, sans-serif" }}
            >
              Which Service?
            </h2>

            <div className="flex flex-col gap-3">
              {slots.map((slot) => {
                const isSelected = form.service_slot === slot;
                return (
                  <label
                    key={slot}
                    className={`slot-radio ${isSelected ? "selected" : ""}`}
                  >
                    <input
                      type="radio"
                      name="service_slot"
                      value={slot}
                      checked={isSelected}
                      onChange={() =>
                        setForm((f) => ({ ...f, service_slot: slot }))
                      }
                      className="sr-only"
                    />
                    <div
                      className="w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center transition-all"
                      style={{
                        borderColor: isSelected
                          ? "var(--cla-amber)"
                          : "rgba(212,134,10,0.3)",
                        background: isSelected
                          ? "var(--cla-amber)"
                          : "transparent",
                      }}
                    >
                      {isSelected && (
                        <div className="w-2 h-2 rounded-full bg-cla-bg-dark" />
                      )}
                    </div>
                    <span
                      className="font-bold text-base"
                      style={{ fontFamily: "Barlow Condensed, sans-serif" }}
                    >
                      {SLOT_LABELS[slot]} Service
                    </span>
                  </label>
                );
              })}
            </div>

            {errors.service_slot && (
              <p className="text-xs" style={{ color: "#ff6b6b" }}>
                {errors.service_slot}
              </p>
            )}
          </div>

          {serverError && (
            <div
              className="p-4 rounded-lg text-sm"
              style={{
                background: "rgba(139,26,26,0.15)",
                border: "1px solid rgba(139,26,26,0.3)",
                color: "#ff6b6b",
              }}
            >
              {serverError}
            </div>
          )}

          <Button
            type="submit"
            variant="primary"
            size="lg"
            loading={loading}
            className="w-full"
          >
            <ClipboardList size={18} />
            Mark Attendance
          </Button>
        </form>
      </div>
    </div>
  );
}

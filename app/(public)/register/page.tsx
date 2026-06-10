"use client";

import { useState, useEffect, useRef } from "react";
import { CheckCircle, ChevronRight, Users, AlertCircle, Lock } from "lucide-react";
import { CLALogo } from "@/components/ui/CLALogo";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { SlotPicker } from "@/components/ui/SlotPicker";
import { registerMember, getSlotCapacities, addToPendingList } from "@/actions/register";
import { checkPhoneDuplicate, type DuplicateCheckResult } from "@/actions/check-duplicate";
import { isFormLocked } from "@/actions/time-lock";

type Step = "form" | "slot-conflict" | "success" | "pending";

interface SlotCap {
  slot: string;
  remaining: number;
  total: number;
}

function formatSlotLabel(slot: string): string {
  const labels: Record<string, string> = {
    "8am":  "8:00 AM Class",
    "10am": "10:00 AM Class",
    "12pm": "12:00 PM Class",
    "2pm":  "2:00 PM Class",
    "4pm":  "4:00 PM Class",
  };
  return labels[slot] ?? `${slot} Class`;
}

export default function RegisterPage() {
  const [step, setStep]           = useState<Step>("form");
  const [loading, setLoading]     = useState(false);
  const [slotCaps, setSlotCaps]   = useState<SlotCap[]>([]);
  const [capsLoading, setCapsLoading] = useState(true);
  const [timeLocked, setTimeLocked]   = useState(false);
  const [lockChecked, setLockChecked] = useState(false);

  const [form, setForm] = useState({
    first_name:     "",
    last_name:      "",
    phone:          "",
    email:          "",
    preferred_slot: "",
  });
  const [consent, setConsent]         = useState(false);
  const [errors, setErrors]           = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState("");

  const [dupResult, setDupResult]   = useState<DuplicateCheckResult | null>(null);
  const [dupChecking, setDupChecking] = useState(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [successData, setSuccessData] = useState<{
    first_name: string;
    last_name: string;
    class_name: string;
    slot: string;
    facilitator_name?: string;
  } | null>(null);

  const [altSlots, setAltSlots]             = useState<SlotCap[]>([]);
  const [selectedAlt, setSelectedAlt]       = useState<string>("");

  useEffect(() => {
    Promise.all([isFormLocked(), getSlotCapacities()]).then(([{ locked }, caps]) => {
      setTimeLocked(locked);
      setLockChecked(true);
      setSlotCaps(caps);
      setCapsLoading(false);
    });
  }, []);

  useEffect(() => {
    const phone = form.phone.trim();
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    if (phone.length < 7) { setDupResult(null); setDupChecking(false); return; }
    setDupChecking(true);
    debounceTimer.current = setTimeout(async () => {
      const result = await checkPhoneDuplicate(phone);
      setDupResult(result);
      setDupChecking(false);
    }, 600);
    return () => { if (debounceTimer.current) clearTimeout(debounceTimer.current); };
  }, [form.phone]);

  function validate() {
    const e: Record<string, string> = {};
    if (!form.first_name.trim())     e.first_name     = "First name is required";
    if (!form.last_name.trim())      e.last_name      = "Last name is required";
    if (!form.phone.trim())          e.phone          = "Phone number is required";
    if (!form.preferred_slot)        e.preferred_slot = "Please select a service time";
    if (!consent)                    e.consent        = "You must agree to continue";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    setServerError("");

    const result = await registerMember({
      first_name:     form.first_name.trim(),
      last_name:      form.last_name.trim(),
      phone:          form.phone.trim(),
      email:          form.email.trim() || undefined,
      preferred_slot: form.preferred_slot,
    });

    setLoading(false);

    if (result.success && result.member) {
      setSuccessData(result.member);
      setStep("success");
    } else if (result.error === "slot_full" && result.alternativeSlots) {
      setAltSlots(result.alternativeSlots.filter((s) => s.remaining > 0));
      setStep("slot-conflict");
    } else if (result.error === "all_full") {
      // All classes full — add to waitlist silently, show pending screen
      await addToPendingList({
        first_name:     form.first_name.trim(),
        last_name:      form.last_name.trim(),
        phone:          form.phone.trim(),
        email:          form.email.trim() || undefined,
        preferred_slot: form.preferred_slot,
      });
      setStep("pending");
    } else {
      setServerError(result.error ?? "Something went wrong. Please try again.");
    }
  }

  async function handleAltSubmit() {
    if (!selectedAlt) return;
    setLoading(true);
    setServerError("");

    const result = await registerMember({
      first_name:     form.first_name.trim(),
      last_name:      form.last_name.trim(),
      phone:          form.phone.trim(),
      email:          form.email.trim() || undefined,
      preferred_slot: selectedAlt,
    });

    setLoading(false);

    if (result.success && result.member) {
      setSuccessData(result.member);
      setStep("success");
    } else {
      setServerError(result.error ?? "Something went wrong. Please try again.");
    }
  }

  function resetForm() {
    setStep("form");
    setForm({ first_name: "", last_name: "", phone: "", email: "", preferred_slot: "" });
    setConsent(false);
    setSuccessData(null);
    setDupResult(null);
    setServerError("");
  }

  // ── LOADING ─────────────────────────────────────────────────
  if (!lockChecked) {
    return (
      <div className="min-h-dvh flex items-center justify-center" style={{ background: "var(--cla-bg-dark)" }}>
        <div className="spinner" style={{ width: 32, height: 32, borderTopColor: "var(--cla-amber)", borderColor: "rgba(228,148,12,0.2)" }} />
      </div>
    );
  }

  // ── LOCKED ──────────────────────────────────────────────────
  if (timeLocked) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center p-6 animate-fade-in" style={{ background: "var(--cla-bg-dark)" }}>
        <div className="w-full max-w-sm flex flex-col items-center gap-6 text-center">
          <CLALogo size="md" />
          <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: "rgba(228,148,12,0.08)", border: "1px solid rgba(228,148,12,0.2)" }}>
            <Lock size={30} style={{ color: "rgba(228,148,12,0.55)" }} />
          </div>
          <div>
            <h1 className="text-2xl font-bold" style={{ fontFamily: "Barlow Condensed, sans-serif" }}>
              Registration Closed
            </h1>
            <p className="mt-2 text-sm" style={{ color: "rgba(248,240,230,0.6)" }}>
              Registration is only available during Sunday service hours. Please come back when you're at church.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── SUCCESS ─────────────────────────────────────────────────
  if (step === "success" && successData) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center p-6 animate-fade-in" style={{ background: "var(--cla-bg-dark)" }}>
        <div className="w-full max-w-sm flex flex-col items-center gap-6 text-center">
          <CLALogo size="md" />
          <div className="success-checkmark">
            <CheckCircle size={40} color="#200909" strokeWidth={2.5} />
          </div>
          <div>
            <h1 className="text-3xl font-bold mb-2" style={{ fontFamily: "Barlow Condensed, sans-serif" }}>
              Welcome, {successData.first_name}!
            </h1>
            <p style={{ color: "rgba(248,240,230,0.7)" }}>
              You have been registered for discipleship classes.
            </p>
          </div>
          <div className="w-full rounded-xl p-5 text-left" style={{ background: "rgba(228,148,12,0.08)", border: "1px solid rgba(228,148,12,0.25)" }}>
            <div className="flex flex-col gap-3">
              <div>
                <p className="text-xs uppercase tracking-widest mb-0.5" style={{ fontFamily: "Barlow Condensed, sans-serif", color: "rgba(248,240,230,0.45)" }}>Your Class</p>
                <p className="text-xl font-bold" style={{ fontFamily: "Barlow Condensed, sans-serif", color: "var(--cla-amber-light)" }}>{successData.class_name}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-widest mb-0.5" style={{ fontFamily: "Barlow Condensed, sans-serif", color: "rgba(248,240,230,0.45)" }}>Time</p>
                <p className="font-semibold">{formatSlotLabel(successData.slot)}</p>
              </div>
              {successData.facilitator_name && (
                <div>
                  <p className="text-xs uppercase tracking-widest mb-0.5" style={{ fontFamily: "Barlow Condensed, sans-serif", color: "rgba(248,240,230,0.45)" }}>Facilitator</p>
                  <p className="font-semibold">{successData.facilitator_name}</p>
                </div>
              )}
            </div>
          </div>
          <p className="text-sm text-center" style={{ color: "rgba(248,240,230,0.5)" }}>
            We look forward to seeing you! Your facilitator will guide you through the class.
          </p>
          <Button variant="secondary" onClick={resetForm}>
            Register Another Person
          </Button>
        </div>
      </div>
    );
  }

  // ── PENDING / WAITLIST ───────────────────────────────────────
  if (step === "pending") {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center p-6 animate-fade-in" style={{ background: "var(--cla-bg-dark)" }}>
        <div className="w-full max-w-sm flex flex-col items-center gap-6 text-center">
          <CLALogo size="md" />
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center"
            style={{ background: "rgba(228,148,12,0.12)", border: "1px solid rgba(228,148,12,0.3)" }}
          >
            <Users size={30} style={{ color: "var(--cla-amber)" }} />
          </div>
          <div>
            <h1 className="text-3xl font-bold mb-2" style={{ fontFamily: "Barlow Condensed, sans-serif" }}>
              You're on the Waitlist!
            </h1>
            <p style={{ color: "rgba(248,240,230,0.7)" }}>
              Our discipleship classes are currently full, {form.first_name}. You've been added to the waitlist.
            </p>
          </div>
          <div
            className="w-full rounded-xl p-5 text-left flex flex-col gap-3"
            style={{ background: "rgba(228,148,12,0.08)", border: "1px solid rgba(228,148,12,0.25)" }}
          >
            <p className="text-sm font-semibold" style={{ color: "var(--cla-amber-light)" }}>What happens next?</p>
            <p className="text-sm" style={{ color: "rgba(248,240,230,0.65)", lineHeight: 1.7 }}>
              We will review the waitlist and reach out to you personally if a spot opens. Waitlist spots are offered on a first-come, first-served basis.
            </p>
            {form.phone && (
              <div className="pt-1" style={{ borderTop: "1px solid rgba(228,148,12,0.15)" }}>
                <p className="text-xs" style={{ color: "rgba(248,240,230,0.4)" }}>We'll contact you on</p>
                <p className="text-sm font-semibold mt-0.5" style={{ color: "var(--cla-off-white)" }}>{form.phone}</p>
              </div>
            )}
          </div>
          <Button variant="secondary" onClick={resetForm}>
            Register Another Person
          </Button>
        </div>
      </div>
    );
  }

  // ── SLOT CONFLICT ────────────────────────────────────────────
  if (step === "slot-conflict") {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center p-6" style={{ background: "var(--cla-bg-dark)" }}>
        <div className="w-full max-w-sm flex flex-col gap-6">
          <div className="flex flex-col items-center gap-4 text-center">
            <CLALogo size="sm" />
            <div>
              <h1 className="text-2xl font-bold" style={{ fontFamily: "Barlow Condensed, sans-serif" }}>That class time is fully booked</h1>
              <p className="text-sm mt-1" style={{ color: "rgba(248,240,230,0.6)" }}>
                Choose an available time below for{" "}
                <span style={{ color: "var(--cla-amber)" }}>{form.first_name}</span>
              </p>
            </div>
          </div>
          <div className="cla-card p-5">
            <p className="text-xs uppercase tracking-widest mb-3" style={{ fontFamily: "Barlow Condensed, sans-serif", color: "rgba(248,240,230,0.45)" }}>Available Class Times</p>
            <SlotPicker
              options={altSlots.map((s) => ({ value: s.slot, label: formatSlotLabel(s.slot), remaining: s.remaining, total: s.total }))}
              value={selectedAlt}
              onChange={setSelectedAlt}
            />
            {serverError && (
              <div className="mt-4 p-3 rounded-lg text-sm" style={{ background: "rgba(139,26,26,0.15)", border: "1px solid rgba(139,26,26,0.3)", color: "#ff6b6b" }}>
                {serverError}
              </div>
            )}
          </div>
          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => setStep("form")} className="flex-1">Back</Button>
            <Button variant="primary" loading={loading} disabled={!selectedAlt} onClick={handleAltSubmit} className="flex-1">
              Confirm <ChevronRight size={18} />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── MAIN FORM ────────────────────────────────────────────────
  return (
    <div className="min-h-dvh flex flex-col" style={{ background: "var(--cla-bg-dark)" }}>
      <div className="grain-overlay relative overflow-hidden" style={{ background: "linear-gradient(135deg, #200909 0%, #3e1212 50%, #5c1616 100%)", paddingTop: "env(safe-area-inset-top)" }}>
        <div className="relative z-10 flex flex-col items-center gap-3 px-6 py-8 text-center">
          <CLALogo size="md" />
          <div>
            <h1 className="text-3xl font-extrabold leading-tight" style={{ fontFamily: "Barlow Condensed, sans-serif" }}>
              Join Our <span className="text-amber-gradient">Discipleship</span><br />Classes
            </h1>
            <p className="mt-1 text-sm" style={{ color: "rgba(248,240,230,0.6)" }}>
              Hello there! We're excited to have you join our discipleship classes. Classes happen every Sunday, at 8:00 AM and 10:00 AM. <br /> Please fill out the form below to register, and select your preferred time.
            </p>
          </div>
        </div>
        <div className="absolute top-0 right-0 w-40 h-40 rounded-full pointer-events-none" style={{ background: "radial-gradient(circle, rgba(228,148,12,0.12) 0%, transparent 70%)" }} />
      </div>

      <div className="flex-1 flex flex-col items-center px-4 py-6">
        <form onSubmit={handleSubmit} className="w-full max-w-lg flex flex-col gap-5">
          <div className="cla-card p-5 flex flex-col gap-4">
            <h2 className="text-lg font-bold" style={{ fontFamily: "Barlow Condensed, sans-serif" }}>Your Details</h2>

            <div className="grid grid-cols-2 gap-3">
              <Input
                label="First Name"
                placeholder="e.g. Amara"
                value={form.first_name}
                onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))}
                error={errors.first_name}
                required
              />
              <Input
                label="Last Name"
                placeholder="e.g. Johnson"
                value={form.last_name}
                onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))}
                error={errors.last_name}
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Input
                label="Phone Number"
                placeholder="e.g. 0812 345 6789"
                type="tel"
                value={form.phone}
                onChange={(e) => { setForm((f) => ({ ...f, phone: e.target.value })); setDupResult(null); }}
                error={errors.phone}
                required
              />
              {dupChecking && form.phone.trim().length >= 7 && (
                <div className="flex items-center gap-2 text-xs px-1" style={{ color: "rgba(248,240,230,0.4)" }}>
                  <span className="spinner shrink-0" style={{ width: 12, height: 12, borderWidth: 1.5, borderTopColor: "rgba(228,148,12,0.7)", borderColor: "rgba(228,148,12,0.2)" }} />
                  Checking…
                </div>
              )}
              {!dupChecking && dupResult?.isDuplicate && (
                <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg text-xs" style={{ background: "rgba(228,148,12,0.1)", border: "1px solid rgba(228,148,12,0.3)", color: "var(--cla-amber-light)" }}>
                  <AlertCircle size={14} className="shrink-0 mt-0.5" />
                  <span>
                    <strong>{dupResult.member?.first_name} {dupResult.member?.last_name}</strong> is already registered with this number
                    {dupResult.member?.class_name ? ` (${dupResult.member.class_name}, ${dupResult.member.slot})` : ""}.{" "}
                    If this is a different person, you can still continue.
                  </span>
                </div>
              )}
            </div>

            <Input
              label="Email (Optional)"
              placeholder="e.g. you@example.com"
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
          </div>

          <div className="cla-card p-5 flex flex-col gap-4">
            <div>
              <h2 className="text-lg font-bold" style={{ fontFamily: "Barlow Condensed, sans-serif" }}>Preferred Class Time</h2>
              
            </div>

            {capsLoading ? (
              <div className="flex items-center gap-2 py-4">
                <span className="spinner" style={{ borderTopColor: "var(--cla-amber)" }} />
                <span className="text-sm" style={{ color: "rgba(248,240,230,0.5)" }}>Loading availability…</span>
              </div>
            ) : (
              <SlotPicker
                options={slotCaps.map((s) => ({ value: s.slot, label: formatSlotLabel(s.slot), remaining: s.remaining, total: s.total }))}
                value={form.preferred_slot}
                onChange={(slot) => setForm((f) => ({ ...f, preferred_slot: slot }))}
              />
            )}

            {errors.preferred_slot && (
              <p className="text-xs" style={{ color: "#ff6b6b" }}>{errors.preferred_slot}</p>
            )}
          </div>

          {/* Consent */}
          <label className="flex items-start gap-3 cursor-pointer select-none">
            <div className="relative shrink-0 mt-0.5">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => { setConsent(e.target.checked); setErrors((ev) => ({ ...ev, consent: "" })); }}
                className="sr-only"
              />
              <div
                className="w-5 h-5 rounded flex items-center justify-center transition-all"
                style={{
                  background: consent ? "var(--cla-amber)" : "rgba(255,255,255,0.07)",
                  border: `2px solid ${consent ? "var(--cla-amber)" : errors.consent ? "#c02828" : "rgba(228,148,12,0.4)"}`,
                  boxShadow: errors.consent && !consent ? "0 0 0 3px rgba(192,40,40,0.15)" : "none",
                }}
              >
                {consent && (
                  <svg width="11" height="8" viewBox="0 0 11 8" fill="none">
                    <path d="M1 4L4 7L10 1" stroke="#200909" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-sm" style={{ color: "rgba(248,240,230,0.8)" }}>
                I consent to my personal data (name, phone, email) being shared with the CLA discipleship team for class management and follow-up purposes.
              </span>
              {errors.consent && (
                <span className="text-xs" style={{ color: "#ff6b6b" }}>{errors.consent}</span>
              )}
            </div>
          </label>

          {serverError && (
            <div className="p-4 rounded-lg text-sm" style={{ background: "rgba(139,26,26,0.15)", border: "1px solid rgba(139,26,26,0.3)", color: "#ff6b6b" }}>
              {serverError}
            </div>
          )}

          <Button type="submit" variant="primary" size="lg" loading={loading} className="w-full">
            <Users size={18} />
            Register Now
          </Button>

          <div className="flex items-center gap-2 px-4 py-3 rounded-lg text-xs" style={{ background: "rgba(228,148,12,0.06)", border: "1px solid rgba(228,148,12,0.15)", color: "rgba(248,240,230,0.5)" }}>
            <span style={{ color: "var(--cla-amber)", fontSize: "1rem" }}>ℹ</span>
            You'll receive a confirmation after your registration has been processed.
          </div>
        </form>
      </div>
    </div>
  );
}

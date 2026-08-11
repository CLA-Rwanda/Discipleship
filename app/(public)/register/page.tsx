"use client";

import { useState, useEffect, useRef } from "react";
import { CheckCircle, Users, AlertCircle, Lock, Clock } from "lucide-react";
import { CLALogo } from "@/components/ui/CLALogo";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { registerToReservedClass, addToPendingList, getRegistrationOpen } from "@/actions/register";
import { checkPhoneDuplicate, type DuplicateCheckResult } from "@/actions/check-duplicate";

type Step = "loading" | "closed" | "waitlist-form" | "waitlist-done" | "form" | "success";

function formatSlotLabel(slot: string): string {
  const labels: Record<string, string> = {
    "8am": "8:00 AM Class", "10am": "10:00 AM Class",
    "12pm": "12:00 PM Class", "2pm": "2:00 PM Class", "4pm": "4:00 PM Class",
  };
  return labels[slot] ?? `${slot} Class`;
}

export default function RegisterPage() {
  const [step, setStep]         = useState<Step>("loading");
  const [loading, setLoading]   = useState(false);

  const [form, setForm] = useState({
    first_name: "", last_name: "", other_name: "",
    phone: "", email: "",
  });
  const [nameConflict, setNameConflict] = useState(false);
  const [consent, setConsent]           = useState(false);
  const [errors, setErrors]             = useState<Record<string, string>>({});
  const [serverError, setServerError]   = useState("");

  const [dupResult, setDupResult]     = useState<DuplicateCheckResult | null>(null);
  const [dupChecking, setDupChecking] = useState(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [successData, setSuccessData] = useState<{
    first_name: string; last_name: string; class_name: string; slot: string; facilitator_name?: string;
  } | null>(null);
  // Waitlist form
  const [wlForm, setWlForm]     = useState({ first_name: "", last_name: "", phone: "", email: "" });
  const [wlErrors, setWlErrors] = useState<Record<string, string>>({});
  const [wlLoading, setWlLoading] = useState(false);

  useEffect(() => {
    getRegistrationOpen().then((isOpen) => setStep(isOpen ? "form" : "closed"));
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
    if (!form.first_name.trim())  e.first_name     = "First name is required";
    if (!form.last_name.trim())   e.last_name      = "Last name is required";
    if (!form.phone.trim())       e.phone          = "Phone number is required";
    if (!consent)                 e.consent        = "You must agree to continue";
    if (nameConflict && !form.other_name.trim())
      e.other_name = "Required — someone with this name is already registered.";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    setServerError("");

    const result = await registerToReservedClass({
      first_name: form.first_name.trim(),
      last_name:  form.last_name.trim(),
      other_name: form.other_name.trim() || undefined,
      phone:      form.phone.trim(),
      email:      form.email.trim() || undefined,
    });

    setLoading(false);

    if (result.success && result.member) {
      setSuccessData(result.member);
      setStep("success");
    } else if (result.error === "name_taken") {
      setNameConflict(true);
      setErrors((ev) => ({ ...ev, other_name: "Someone with this name is already registered. Add a middle name or nickname to continue." }));
    } else if (result.error === "already_registered") {
      setServerError("You appear to already be registered. Please check with your facilitator.");
    } else if (result.error === "registration_closed") {
      setStep("closed");
    } else {
      setServerError(result.error ?? "Something went wrong. Please try again.");
    }
  }

  function validateWaitlist() {
    const e: Record<string, string> = {};
    if (!wlForm.first_name.trim()) e.first_name = "First name is required";
    if (!wlForm.last_name.trim())  e.last_name  = "Last name is required";
    if (!wlForm.phone.trim())      e.phone      = "Phone number is required";
    setWlErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleWaitlistSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validateWaitlist()) return;
    setWlLoading(true);
    const result = await addToPendingList({
      first_name: wlForm.first_name.trim(),
      last_name:  wlForm.last_name.trim(),
      phone:      wlForm.phone.trim(),
      email:      wlForm.email.trim() || undefined,
    });
    setWlLoading(false);
    if (result.success) setStep("waitlist-done");
    else setWlErrors({ phone: result.error ?? "Something went wrong. Please try again." });
  }

  function resetForm() {
    setStep("form");
    setForm({ first_name: "", last_name: "", other_name: "", phone: "", email: "" });
    setNameConflict(false);
    setConsent(false);
    setSuccessData(null);
    setDupResult(null);
    setServerError("");
    setErrors({});
  }

  // ── LOADING ──────────────────────────────────────────────────
  if (step === "loading") {
    return (
      <div className="min-h-dvh flex items-center justify-center" style={{ background: "var(--cla-bg-dark)" }}>
        <div className="spinner" style={{ width: 32, height: 32, borderTopColor: "var(--cla-amber)", borderColor: "rgba(228,148,12,0.2)" }} />
      </div>
    );
  }

  // ── CLOSED — prompt to join waitlist ────────────────────────
  if (step === "closed") {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center p-6 animate-fade-in" style={{ background: "var(--cla-bg-dark)" }}>
        <div className="w-full max-w-sm flex flex-col items-center gap-6 text-center">
          <CLALogo size="md" />
          <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: "rgba(228,148,12,0.08)", border: "1px solid rgba(228,148,12,0.2)" }}>
            <Lock size={30} style={{ color: "rgba(228,148,12,0.55)" }} />
          </div>
          <div>
            <h1 className="text-2xl font-bold" style={{ fontFamily: "Barlow Condensed, sans-serif" }}>Registration is Closed</h1>
            <p className="mt-2 text-sm leading-relaxed" style={{ color: "rgba(248,240,230,0.6)" }}>
              We've currently filled our discipleship classes for this cycle. We appreciate your interest and hope to see you next time!
            </p>
          </div>
          <div className="w-full rounded-xl p-5 text-left flex flex-col gap-3" style={{ background: "rgba(228,148,12,0.06)", border: "1px solid rgba(228,148,12,0.2)" }}>
            <p className="text-sm font-semibold" style={{ color: "var(--cla-amber-light)" }}>Still want to be considered?</p>
            <p className="text-sm leading-relaxed" style={{ color: "rgba(248,240,230,0.6)" }}>
              Join our waitlist and we'll reach out personally if a spot opens up. Spots are offered on a first-come, first-served basis.
            </p>
            <Button variant="primary" onClick={() => setStep("waitlist-form")} className="w-full mt-1">
              <Users size={16} /> Join the Waitlist
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── WAITLIST FORM ────────────────────────────────────────────
  if (step === "waitlist-form") {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center p-6 animate-fade-in" style={{ background: "var(--cla-bg-dark)" }}>
        <div className="w-full max-w-sm flex flex-col gap-6">
          <div className="flex flex-col items-center gap-3 text-center">
            <CLALogo size="sm" />
            <div>
              <h1 className="text-2xl font-bold" style={{ fontFamily: "Barlow Condensed, sans-serif" }}>Join the Waitlist</h1>
              <p className="text-sm mt-1" style={{ color: "rgba(248,240,230,0.5)" }}>
                Leave your details and we'll contact you if a spot opens.
              </p>
            </div>
          </div>

          <form onSubmit={handleWaitlistSubmit} className="cla-card p-5 flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <Input label="First Name" placeholder="e.g. Amara" value={wlForm.first_name}
                onChange={(e) => setWlForm((f) => ({ ...f, first_name: e.target.value }))}
                error={wlErrors.first_name} required />
              <Input label="Last Name" placeholder="e.g. Johnson" value={wlForm.last_name}
                onChange={(e) => setWlForm((f) => ({ ...f, last_name: e.target.value }))}
                error={wlErrors.last_name} required />
            </div>
            <Input label="Phone Number" placeholder="e.g. 0812 345 6789" type="tel"
              value={wlForm.phone} onChange={(e) => setWlForm((f) => ({ ...f, phone: e.target.value }))}
              error={wlErrors.phone} required />
            <Input label="Email (Optional)" placeholder="e.g. you@example.com" type="email"
              value={wlForm.email} onChange={(e) => setWlForm((f) => ({ ...f, email: e.target.value }))} />

            <Button type="submit" variant="primary" loading={wlLoading} className="w-full mt-1">
              <Clock size={16} /> Add Me to the Waitlist
            </Button>
          </form>

          <button onClick={() => setStep("closed")} className="text-sm text-center" style={{ color: "rgba(248,240,230,0.35)" }}>
            ← Go back
          </button>
        </div>
      </div>
    );
  }

  // ── WAITLIST DONE ────────────────────────────────────────────
  if (step === "waitlist-done") {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center p-6 animate-fade-in" style={{ background: "var(--cla-bg-dark)" }}>
        <div className="w-full max-w-sm flex flex-col items-center gap-6 text-center">
          <CLALogo size="md" />
          <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: "rgba(228,148,12,0.12)", border: "1px solid rgba(228,148,12,0.3)" }}>
            <Users size={30} style={{ color: "var(--cla-amber)" }} />
          </div>
          <div>
            <h1 className="text-3xl font-bold mb-2" style={{ fontFamily: "Barlow Condensed, sans-serif" }}>You're on the Waitlist!</h1>
            <p style={{ color: "rgba(248,240,230,0.7)" }}>
              Thank you, <strong style={{ color: "var(--cla-amber-light)" }}>{wlForm.first_name}</strong>. You've been added to our waitlist.
            </p>
          </div>
          <div className="w-full rounded-xl p-5 text-left flex flex-col gap-3" style={{ background: "rgba(228,148,12,0.08)", border: "1px solid rgba(228,148,12,0.25)" }}>
            <p className="text-sm font-semibold" style={{ color: "var(--cla-amber-light)" }}>What happens next?</p>
            <p className="text-sm leading-relaxed" style={{ color: "rgba(248,240,230,0.65)" }}>
              We will review the waitlist and reach out to you personally if a spot opens. Spots are offered on a first-come, first-served basis.
            </p>
            {wlForm.phone && (
              <div className="pt-1" style={{ borderTop: "1px solid rgba(228,148,12,0.15)" }}>
                <p className="text-xs" style={{ color: "rgba(248,240,230,0.4)" }}>We'll contact you on</p>
                <p className="text-sm font-semibold mt-0.5" style={{ color: "var(--cla-off-white)" }}>{wlForm.phone}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── SUCCESS ─────────────────────────────────────────────
  if (step === "success" && successData) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center p-6 animate-fade-in" style={{ background: "var(--cla-bg-dark)" }}>
        <div className="w-full max-w-sm flex flex-col items-center gap-6 text-center">
          <CLALogo size="md" />
          <div className="success-checkmark"><CheckCircle size={40} color="#200909" strokeWidth={2.5} /></div>
          <div>
            <h1 className="text-3xl font-bold mb-1" style={{ fontFamily: "Barlow Condensed, sans-serif" }}>Registration Successful!</h1>
            <p className="text-sm" style={{ color: "rgba(248,240,230,0.6)" }}>
              Thank you for registering for the Discipleship Class – Second Cohort 2026.
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
            </div>
          </div>
          <div className="w-full rounded-xl p-4 text-left" style={{ background: "rgba(192,40,40,0.08)", border: "1px solid rgba(192,40,40,0.25)" }}>
            <p className="text-xs font-bold uppercase tracking-widest mb-1.5" style={{ fontFamily: "Barlow Condensed, sans-serif", color: "#ff8c8c" }}>Please Note</p>
            <p className="text-sm leading-relaxed" style={{ color: "rgba(248,240,230,0.75)" }}>
              To qualify for the Mission and successfully complete this class, you must maintain at least{" "}
              <strong style={{ color: "#ff8c8c" }}>80% attendance</strong> throughout the course. We encourage you to attend every class and make the most of this discipleship journey.
            </p>
          </div>
          <p className="text-sm" style={{ color: "rgba(248,240,230,0.5)" }}>
            We look forward to growing together in Christ. God bless you!
          </p>
          <Button variant="secondary" onClick={resetForm}>Register Another Person</Button>
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
              Hello there! We're excited to have you join our discipleship class. This intake meets every Sunday at 8:00 AM.<br />Please fill out the form below to register.
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
              <Input label="First Name" placeholder="e.g. Amara" value={form.first_name}
                onChange={(e) => { setForm((f) => ({ ...f, first_name: e.target.value })); setNameConflict(false); setErrors((ev) => ({ ...ev, other_name: "" })); }}
                error={errors.first_name} required />
              <Input label="Last Name" placeholder="e.g. Johnson" value={form.last_name}
                onChange={(e) => { setForm((f) => ({ ...f, last_name: e.target.value })); setNameConflict(false); setErrors((ev) => ({ ...ev, other_name: "" })); }}
                error={errors.last_name} required />
            </div>

            {/* Other name — shown on conflict or if already filled */}
            {(nameConflict || form.other_name) && (
              <div className="flex flex-col gap-1.5">
                {nameConflict && (
                  <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg text-xs" style={{ background: "rgba(228,148,12,0.1)", border: "1px solid rgba(228,148,12,0.3)", color: "var(--cla-amber-light)" }}>
                    <AlertCircle size={14} className="shrink-0 mt-0.5" />
                    <span>Someone named <strong>{form.first_name} {form.last_name}</strong> is already registered. Add a middle name, nickname, or other name to continue.</span>
                  </div>
                )}
                <Input
                  label={nameConflict ? "Other Name (required)" : "Other Name (optional)"}
                  placeholder="Middle name, nickname, etc."
                  value={form.other_name}
                  onChange={(e) => { setForm((f) => ({ ...f, other_name: e.target.value })); setErrors((ev) => ({ ...ev, other_name: "" })); }}
                  error={errors.other_name}
                  required={nameConflict}
                  hint={nameConflict ? undefined : "Helps distinguish you if someone shares your name"}
                />
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <Input label="Phone Number" placeholder="e.g. 0812 345 6789" type="tel"
                value={form.phone}
                onChange={(e) => { setForm((f) => ({ ...f, phone: e.target.value })); setDupResult(null); }}
                error={errors.phone} required />
              {dupChecking && form.phone.trim().length >= 7 && (
                <div className="flex items-center gap-2 text-xs px-1" style={{ color: "rgba(248,240,230,0.4)" }}>
                  <span className="spinner shrink-0" style={{ width: 12, height: 12, borderWidth: 1.5, borderTopColor: "rgba(228,148,12,0.7)", borderColor: "rgba(228,148,12,0.2)" }} />
                  Checking…
                </div>
              )}
              {!dupChecking && dupResult?.isDuplicate && (
                <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg text-xs" style={{ background: "rgba(228,148,12,0.1)", border: "1px solid rgba(228,148,12,0.3)", color: "var(--cla-amber-light)" }}>
                  <AlertCircle size={14} className="shrink-0 mt-0.5" />
                  <span><strong>{dupResult.member?.first_name} {dupResult.member?.last_name}</strong> is already registered with this number{dupResult.member?.class_name ? ` (${dupResult.member.class_name})` : ""}. If this is a different person, continue.</span>
                </div>
              )}
            </div>

            <Input label="Email (Optional)" placeholder="e.g. you@example.com" type="email"
              value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
          </div>

          <div className="cla-card p-4 flex items-center gap-3" style={{ background: "rgba(228,148,12,0.06)", border: "1px solid rgba(228,148,12,0.2)" }}>
            <Users size={18} style={{ color: "var(--cla-amber)", flexShrink: 0 }} />
            <p className="text-sm" style={{ color: "rgba(248,240,230,0.7)" }}>
              You'll be placed in <strong style={{ color: "var(--cla-amber-light)" }}>Class 08</strong>, meeting at <strong style={{ color: "var(--cla-amber-light)" }}>8:00 AM</strong>.
            </p>
          </div>

          {/* Consent */}
          <label className="flex items-start gap-3 cursor-pointer select-none">
            <div className="relative shrink-0 mt-0.5">
              <input type="checkbox" checked={consent} onChange={(e) => { setConsent(e.target.checked); setErrors((ev) => ({ ...ev, consent: "" })); }} className="sr-only" />
              <div className="w-5 h-5 rounded flex items-center justify-center transition-all"
                style={{ background: consent ? "var(--cla-amber)" : "rgba(255,255,255,0.07)", border: `2px solid ${consent ? "var(--cla-amber)" : errors.consent ? "#c02828" : "rgba(228,148,12,0.4)"}`, boxShadow: errors.consent && !consent ? "0 0 0 3px rgba(192,40,40,0.15)" : "none" }}>
                {consent && <svg width="11" height="8" viewBox="0 0 11 8" fill="none"><path d="M1 4L4 7L10 1" stroke="#200909" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
              </div>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-sm" style={{ color: "rgba(248,240,230,0.8)" }}>
                I consent to my personal data (name, phone, email) being shared with the CLA discipleship team for class management and follow-up.
              </span>
              {errors.consent && <span className="text-xs" style={{ color: "#ff6b6b" }}>{errors.consent}</span>}
            </div>
          </label>

          {serverError && (
            <div className="p-4 rounded-lg text-sm" style={{ background: "rgba(139,26,26,0.15)", border: "1px solid rgba(139,26,26,0.3)", color: "#ff6b6b" }}>{serverError}</div>
          )}

          <Button type="submit" variant="primary" size="lg" loading={loading} className="w-full">
            <Users size={18} /> Register Now
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

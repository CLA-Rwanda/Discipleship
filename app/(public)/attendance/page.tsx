"use client";

import { useState, useEffect } from "react";
import { CheckCircle, ClipboardList, AlertCircle, Lock } from "lucide-react";
import { CLALogo } from "@/components/ui/CLALogo";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { logAttendance } from "@/actions/attendance";
import { isFormLocked } from "@/actions/time-lock";

const STORAGE_KEY = "cla_member_attendance";

function formatSlotLabel(slot: string): string {
  const labels: Record<string, string> = {
    "8am":  "8 AM",
    "10am": "10 AM",
    "12pm": "Midday",
    "2pm":  "2 PM",
    "4pm":  "4 PM",
  };
  return labels[slot] ?? slot.toUpperCase();
}

export default function AttendancePage() {
  const [submitted, setSubmitted]     = useState(false);
  const [loading, setLoading]         = useState(false);
  const [serverError, setServerError] = useState("");
  const [successData, setSuccessData] = useState<{ name: string; slot: string; class_name: string } | null>(null);
  const [suggestion, setSuggestion]   = useState<{ text: string } | null>(null);
  const [timeLocked, setTimeLocked]   = useState(false);
  const [lockChecked, setLockChecked] = useState(false);
  const [prefillName, setPrefillName] = useState<string | null>(null);

  const [form, setForm] = useState({ first_name: "", last_name: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Check time lock
  useEffect(() => {
    isFormLocked().then(({ locked }) => {
      setTimeLocked(locked);
      setLockChecked(true);
    });
  }, []);

  // Pre-fill from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw) as { firstName: string; lastName: string };
      if (data.firstName && data.lastName) {
        setForm({ first_name: data.firstName, last_name: data.lastName });
        setPrefillName(data.firstName);
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  function clearPrefill() {
    localStorage.removeItem(STORAGE_KEY);
    setPrefillName(null);
    setForm({ first_name: "", last_name: "" });
  }

  function handleMarkAnother() {
    localStorage.removeItem(STORAGE_KEY);
    setPrefillName(null);
    setSubmitted(false);
    setSuccessData(null);
    setForm({ first_name: "", last_name: "" });
    setSuggestion(null);
  }

  function validate() {
    const e: Record<string, string> = {};
    if (!form.first_name.trim()) e.first_name = "First name is required";
    if (!form.last_name.trim())  e.last_name  = "Last name is required";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setSuggestion(null);
    setLoading(true);
    setServerError("");

    const result = await logAttendance({
      first_name: form.first_name.trim(),
      last_name:  form.last_name.trim(),
    });

    setLoading(false);

    if ("needsSuggestion" in result && result.needsSuggestion) {
      setSuggestion({ text: result.suggestion });
      return;
    }

    if ("success" in result && result.success) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          firstName: form.first_name.trim(),
          lastName:  form.last_name.trim(),
        }));
      } catch { /* localStorage unavailable */ }

      setSuccessData({
        name:       `${form.first_name.trim()} ${form.last_name.trim()}`,
        slot:       result.slot!,
        class_name: result.class_name!,
      });
      setSubmitted(true);
    } else if ("error" in result) {
      setServerError(result.error ?? "Something went wrong. Please try again.");
    }
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
              Attendance Closed
            </h1>
          </div>
        </div>
      </div>
    );
  }

  // ── SUCCESS ────────────────────────────────────────────────
  if (submitted && successData) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center p-6 animate-fade-in" style={{ background: "var(--cla-bg-dark)" }}>
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
              God bless you, {form.first_name}. We're glad you're here today.
            </p>
          </div>
          <div className="w-full rounded-xl p-5 text-left flex flex-col gap-3" style={{ background: "rgba(228,148,12,0.08)", border: "1px solid rgba(228,148,12,0.25)" }}>
            <div>
              <p className="text-xs uppercase tracking-widest mb-0.5" style={{ fontFamily: "Barlow Condensed, sans-serif", color: "rgba(248,240,230,0.45)" }}>Class</p>
              <p className="text-xl font-bold" style={{ fontFamily: "Barlow Condensed, sans-serif", color: "var(--cla-amber-light)" }}>{successData.class_name}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-widest mb-0.5" style={{ fontFamily: "Barlow Condensed, sans-serif", color: "rgba(248,240,230,0.45)" }}>Service Time</p>
              <p className="font-semibold">{formatSlotLabel(successData.slot)}</p>
            </div>
          </div>
          <Button variant="secondary" onClick={handleMarkAnother}>
            Mark Another Person
          </Button>
        </div>
      </div>
    );
  }

  // ── FORM ────────────────────────────────────────────────────
  return (
    <div className="min-h-dvh flex flex-col" style={{ background: "var(--cla-bg-dark)" }}>
      <div className="grain-overlay relative overflow-hidden" style={{ background: "linear-gradient(135deg, #200909 0%, #3e1212 50%, #5c1616 100%)", paddingTop: "env(safe-area-inset-top)" }}>
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

      <div className="flex-1 flex flex-col items-center px-4 py-6">
        <form onSubmit={handleSubmit} className="w-full max-w-lg flex flex-col gap-5">

          {/* Pre-fill indicator */}
          {prefillName && (
            <div className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-lg text-sm"
              style={{ background: "rgba(228,148,12,0.07)", border: "1px solid rgba(228,148,12,0.2)" }}>
              <span style={{ color: "rgba(248,240,230,0.6)" }}>
                Welcome back, <span className="font-semibold" style={{ color: "var(--cla-amber-light)" }}>{prefillName}</span>
              </span>
              <button
                type="button"
                onClick={clearPrefill}
                className="text-xs font-bold shrink-0"
                style={{ color: "rgba(248,240,230,0.4)" }}
              >
                Not {prefillName}?
              </button>
            </div>
          )}

          {/* Name */}
          <div className="cla-card p-5">
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="First Name"
                placeholder="e.g. Amara"
                value={form.first_name}
                onChange={(e) => { setForm((f) => ({ ...f, first_name: e.target.value })); setSuggestion(null); }}
                error={errors.first_name}
                required
              />
              <Input
                label="Last Name"
                placeholder="e.g. Johnson"
                value={form.last_name}
                onChange={(e) => { setForm((f) => ({ ...f, last_name: e.target.value })); setSuggestion(null); }}
                error={errors.last_name}
                required
              />
            </div>
          </div>

          {/* Name suggestion warning */}
          {suggestion && (
            <div className="cla-card p-4 flex flex-col gap-3" style={{ border: "1px solid rgba(228,148,12,0.4)" }}>
              <div className="flex items-start gap-2">
                <AlertCircle size={16} className="shrink-0 mt-0.5" style={{ color: "var(--cla-amber)" }} />
                <div className="flex flex-col gap-1">
                  <p className="text-sm font-semibold" style={{ color: "var(--cla-amber-light)" }}>
                    Name entered in wrong order
                  </p>
                  <p className="text-sm" style={{ color: "rgba(248,240,230,0.7)" }}>
                    Did you mean <strong style={{ color: "var(--cla-amber-light)" }}>{suggestion.text}</strong>?
                    Your name must match exactly how you registered.
                  </p>
                  <p className="text-xs mt-1" style={{ color: "rgba(248,240,230,0.45)" }}>
                    Please correct your name above and try again.
                  </p>
                </div>
              </div>
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

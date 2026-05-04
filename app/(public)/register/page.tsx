"use client";

import { useState, useEffect } from "react";
import { CheckCircle, ChevronRight, Users } from "lucide-react";
import { CLALogo } from "@/components/ui/CLALogo";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { SlotPicker } from "@/components/ui/SlotPicker";
import { registerMember, getSlotCapacities } from "@/actions/register";
import type { Slot } from "@/lib/types";

type Step = "form" | "slot-conflict" | "success";

interface SlotCapacity {
  slot: Slot;
  remaining: number;
  total: number;
}

const SLOT_LABELS: Record<Slot, string> = {
  "8am": "8:00 AM Service",
  "10am": "10:00 AM Service",
  "12pm": "12:00 PM Service",
};

export default function RegisterPage() {
  const [step, setStep] = useState<Step>("form");
  const [loading, setLoading] = useState(false);
  const [slotCapacities, setSlotCapacities] = useState<SlotCapacity[]>([]);
  const [capacitiesLoading, setCapacitiesLoading] = useState(true);

  const [form, setForm] = useState({
    full_name: "",
    phone: "",
    email: "",
    preferred_slot: "" as Slot | "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [successData, setSuccessData] = useState<{
    full_name: string;
    class_name: string;
    slot: string;
    facilitator_name?: string;
  } | null>(null);

  const [alternativeSlots, setAlternativeSlots] = useState<SlotCapacity[]>([]);
  const [selectedAlternative, setSelectedAlternative] = useState<Slot | "">("");
  const [serverError, setServerError] = useState("");

  useEffect(() => {
    getSlotCapacities().then((caps) => {
      setSlotCapacities(caps);
      setCapacitiesLoading(false);
    });
  }, []);

  function validate() {
    const e: Record<string, string> = {};
    if (!form.full_name.trim()) e.full_name = "Full name is required";
    if (!form.phone.trim()) e.phone = "Phone number is required";
    if (!form.preferred_slot) e.preferred_slot = "Please select a service time";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    setServerError("");

    const result = await registerMember({
      full_name: form.full_name.trim(),
      phone: form.phone.trim(),
      email: form.email.trim() || undefined,
      preferred_slot: form.preferred_slot as Slot,
    });

    setLoading(false);

    if (result.success && result.member) {
      setSuccessData(result.member);
      setStep("success");
    } else if (result.error === "slot_full" && result.alternativeSlots) {
      setAlternativeSlots(result.alternativeSlots.filter((s) => s.remaining > 0));
      setStep("slot-conflict");
    } else {
      setServerError(result.error ?? "Something went wrong. Please try again.");
    }
  }

  async function handleAlternativeSubmit() {
    if (!selectedAlternative) return;
    setLoading(true);
    setServerError("");

    const result = await registerMember({
      full_name: form.full_name.trim(),
      phone: form.phone.trim(),
      email: form.email.trim() || undefined,
      preferred_slot: selectedAlternative,
    });

    setLoading(false);

    if (result.success && result.member) {
      setSuccessData(result.member);
      setStep("success");
    } else {
      setServerError(result.error ?? "Something went wrong. Please try again.");
    }
  }

  if (step === "success" && successData) {
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
              Welcome, {successData.full_name.split(" ")[0]}!
            </h1>
            <p style={{ color: "rgba(232,224,216,0.7)" }}>
              You've been registered for discipleship classes.
            </p>
          </div>

          <div
            className="w-full rounded-xl p-5 text-left"
            style={{
              background: "rgba(212,134,10,0.08)",
              border: "1px solid rgba(212,134,10,0.25)",
            }}
          >
            <div className="flex flex-col gap-3">
              <div>
                <p
                  className="text-xs uppercase tracking-widest mb-0.5"
                  style={{
                    fontFamily: "Barlow Condensed, sans-serif",
                    color: "rgba(232,224,216,0.45)",
                  }}
                >
                  Your Class
                </p>
                <p
                  className="text-xl font-bold"
                  style={{
                    fontFamily: "Barlow Condensed, sans-serif",
                    color: "var(--cla-amber-light)",
                  }}
                >
                  {successData.class_name}
                </p>
              </div>

              <div>
                <p
                  className="text-xs uppercase tracking-widest mb-0.5"
                  style={{
                    fontFamily: "Barlow Condensed, sans-serif",
                    color: "rgba(232,224,216,0.45)",
                  }}
                >
                  Service Time
                </p>
                <p className="font-semibold">{SLOT_LABELS[successData.slot as Slot]}</p>
              </div>

              {successData.facilitator_name && (
                <div>
                  <p
                    className="text-xs uppercase tracking-widest mb-0.5"
                    style={{
                      fontFamily: "Barlow Condensed, sans-serif",
                      color: "rgba(232,224,216,0.45)",
                    }}
                  >
                    Facilitator
                  </p>
                  <p className="font-semibold">{successData.facilitator_name}</p>
                </div>
              )}
            </div>
          </div>

          <p
            className="text-sm text-center"
            style={{ color: "rgba(232,224,216,0.5)" }}
          >
            See you on Sunday! Your facilitator will guide you through the class.
          </p>

          <Button
            variant="secondary"
            onClick={() => {
              setStep("form");
              setForm({ full_name: "", phone: "", email: "", preferred_slot: "" });
              setSuccessData(null);
            }}
          >
            Register Another Person
          </Button>
        </div>
      </div>
    );
  }

  if (step === "slot-conflict") {
    return (
      <div
        className="min-h-dvh flex flex-col items-center justify-center p-6"
        style={{ background: "var(--cla-bg-dark)" }}
      >
        <div className="w-full max-w-sm flex flex-col gap-6">
          <div className="flex flex-col items-center gap-4 text-center">
            <CLALogo size="sm" />
            <div>
              <h1
                className="text-2xl font-bold"
                style={{ fontFamily: "Barlow Condensed, sans-serif" }}
              >
                That time is fully booked
              </h1>
              <p
                className="text-sm mt-1"
                style={{ color: "rgba(232,224,216,0.6)" }}
              >
                Choose an available time below for{" "}
                <span style={{ color: "var(--cla-amber)" }}>
                  {form.full_name.split(" ")[0]}
                </span>
              </p>
            </div>
          </div>

          <div className="cla-card p-5">
            <p
              className="text-xs uppercase tracking-widest mb-3"
              style={{
                fontFamily: "Barlow Condensed, sans-serif",
                color: "rgba(232,224,216,0.45)",
              }}
            >
              Available Times
            </p>
            <SlotPicker
              options={alternativeSlots.map((s) => ({
                value: s.slot,
                label: SLOT_LABELS[s.slot],
                remaining: s.remaining,
                total: s.total,
              }))}
              value={selectedAlternative}
              onChange={setSelectedAlternative}
            />

            {serverError && (
              <div
                className="mt-4 p-3 rounded-lg text-sm"
                style={{
                  background: "rgba(139,26,26,0.15)",
                  border: "1px solid rgba(139,26,26,0.3)",
                  color: "#ff6b6b",
                }}
              >
                {serverError}
              </div>
            )}
          </div>

          <div className="flex gap-3">
            <Button
              variant="secondary"
              onClick={() => setStep("form")}
              className="flex-1"
            >
              Back
            </Button>
            <Button
              variant="primary"
              loading={loading}
              disabled={!selectedAlternative}
              onClick={handleAlternativeSubmit}
              className="flex-1"
            >
              Confirm
              <ChevronRight size={18} />
            </Button>
          </div>
        </div>
      </div>
    );
  }

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
              Join Our{" "}
              <span className="text-amber-gradient">Discipleship</span>
              <br />
              Classes
            </h1>
            <p
              className="mt-1 text-sm"
              style={{ color: "rgba(232,224,216,0.6)" }}
            >
              Register once — we'll place you in the right class.
            </p>
          </div>
        </div>

        {/* Decorative amber glow */}
        <div
          className="absolute top-0 right-0 w-40 h-40 rounded-full pointer-events-none"
          style={{
            background: "radial-gradient(circle, rgba(212,134,10,0.12) 0%, transparent 70%)",
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
              value={form.full_name}
              onChange={(e) =>
                setForm((f) => ({ ...f, full_name: e.target.value }))
              }
              error={errors.full_name}
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

            <Input
              label="Email (Optional)"
              placeholder="e.g. you@example.com"
              type="email"
              value={form.email}
              onChange={(e) =>
                setForm((f) => ({ ...f, email: e.target.value }))
              }
            />
          </div>

          <div className="cla-card p-5 flex flex-col gap-4">
            <div>
              <h2
                className="text-lg font-bold"
                style={{ fontFamily: "Barlow Condensed, sans-serif" }}
              >
                Preferred Service Time
              </h2>
              <p
                className="text-xs mt-0.5"
                style={{ color: "rgba(232,224,216,0.5)" }}
              >
                Pick the service you normally attend
              </p>
            </div>

            {capacitiesLoading ? (
              <div className="flex items-center gap-2 py-4">
                <span className="spinner" style={{ borderTopColor: "var(--cla-amber)" }} />
                <span
                  className="text-sm"
                  style={{ color: "rgba(232,224,216,0.5)" }}
                >
                  Loading availability…
                </span>
              </div>
            ) : (
              <SlotPicker
                options={slotCapacities.map((s) => ({
                  value: s.slot,
                  label: SLOT_LABELS[s.slot],
                  remaining: s.remaining,
                  total: s.total,
                }))}
                value={form.preferred_slot}
                onChange={(slot) =>
                  setForm((f) => ({ ...f, preferred_slot: slot }))
                }
              />
            )}

            {errors.preferred_slot && (
              <p className="text-xs" style={{ color: "#ff6b6b" }}>
                {errors.preferred_slot}
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
            <Users size={18} />
            Register Now
          </Button>

          <div
            className="flex items-center gap-2 px-4 py-3 rounded-lg text-xs"
            style={{
              background: "rgba(212,134,10,0.06)",
              border: "1px solid rgba(212,134,10,0.15)",
              color: "rgba(232,224,216,0.5)",
            }}
          >
            <span style={{ color: "var(--cla-amber)", fontSize: "1rem" }}>ℹ</span>
            You'll be automatically placed in the best available class for your
            selected time.
          </div>
        </form>
      </div>
    </div>
  );
}

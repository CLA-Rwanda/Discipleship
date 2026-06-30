"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Check, X, Lock } from "lucide-react";
import { createClient } from "@/lib/supabase";
import { CLALogo } from "@/components/ui/CLALogo";

interface Criterion {
  label: string;
  test: (pw: string) => boolean;
}

const CRITERIA: Criterion[] = [
  { label: "At least 6 characters", test: (pw) => pw.length >= 6 },
  { label: "One uppercase letter (A–Z)", test: (pw) => /[A-Z]/.test(pw) },
  { label: "One lowercase letter (a–z)", test: (pw) => /[a-z]/.test(pw) },
  { label: "One number (0–9)", test: (pw) => /[0-9]/.test(pw) },
  {
    label: "One special character (!@#$%^&*…)",
    test: (pw) => /[^A-Za-z0-9]/.test(pw),
  },
];

export default function SetupPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const results = useMemo(
    () => CRITERIA.map((c) => ({ ...c, passed: c.test(password) })),
    [password]
  );
  const allPassed = results.every((r) => r.passed);
  const passwordsMatch = password === confirm && confirm.length > 0;
  const canSubmit = allPassed && passwordsMatch && !loading;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setError(updateError.message);
      setLoading(false);
      return;
    }

    router.push("/admin/dashboard");
  }

  return (
    <div
      className="min-h-dvh flex flex-col items-center justify-center px-4 py-12"
      style={{ background: "var(--cla-bg-dark)" }}
    >
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <CLALogo layout="stacked" size="md" />
        </div>

        {/* Card */}
        <div
          className="rounded-2xl p-8"
          style={{
            background: "var(--cla-bg-card)",
            border: "1px solid rgba(228,148,12,0.2)",
            boxShadow: "0 8px 40px rgba(0,0,0,0.5)",
          }}
        >
          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
              style={{ background: "rgba(228,148,12,0.15)" }}
            >
              <Lock size={18} style={{ color: "var(--cla-amber)" }} />
            </div>
            <div>
              <h1
                className="text-2xl font-extrabold"
                style={{ fontFamily: "var(--font-heading)" }}
              >
                Create Your Password
              </h1>
              <p className="text-sm mt-0.5" style={{ color: "rgba(248,240,230,0.5)" }}>
                You&apos;ll use this to sign in to the admin console.
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            {/* Password field */}
            <div className="flex flex-col gap-1.5">
              <label
                className="text-sm font-semibold"
                style={{ color: "rgba(248,240,230,0.75)" }}
              >
                New Password
              </label>
              <div className="relative">
                <input
                  type={showPw ? "text" : "password"}
                  className="cla-input pr-11"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                  style={{ color: "rgba(248,240,230,0.4)" }}
                  tabIndex={-1}
                >
                  {showPw ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </div>

            {/* Criteria checklist */}
            {password.length > 0 && (
              <div
                className="rounded-xl p-4 flex flex-col gap-2"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(228,148,12,0.12)",
                }}
              >
                <p
                  className="text-xs font-bold mb-1"
                  style={{
                    fontFamily: "var(--font-heading)",
                    color: "rgba(248,240,230,0.5)",
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                  }}
                >
                  Password Requirements
                </p>
                {results.map((r) => (
                  <div key={r.label} className="flex items-center gap-2.5">
                    <div
                      className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
                      style={{
                        background: r.passed
                          ? "rgba(200,212,0,0.18)"
                          : "rgba(255,255,255,0.06)",
                        border: r.passed
                          ? "1px solid rgba(200,212,0,0.45)"
                          : "1px solid rgba(255,255,255,0.12)",
                      }}
                    >
                      {r.passed ? (
                        <Check size={11} style={{ color: "#C8D400" }} />
                      ) : (
                        <X size={11} style={{ color: "rgba(248,240,230,0.3)" }} />
                      )}
                    </div>
                    <span
                      className="text-sm"
                      style={{
                        color: r.passed
                          ? "rgba(248,240,230,0.85)"
                          : "rgba(248,240,230,0.4)",
                      }}
                    >
                      {r.label}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Confirm password field */}
            <div className="flex flex-col gap-1.5">
              <label
                className="text-sm font-semibold"
                style={{ color: "rgba(248,240,230,0.75)" }}
              >
                Confirm Password
              </label>
              <div className="relative">
                <input
                  type={showConfirm ? "text" : "password"}
                  className={`cla-input pr-11 ${
                    confirm.length > 0 && !passwordsMatch ? "error" : ""
                  }`}
                  placeholder="Re-enter your password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                  style={{ color: "rgba(248,240,230,0.4)" }}
                  tabIndex={-1}
                >
                  {showConfirm ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
              {confirm.length > 0 && !passwordsMatch && (
                <p className="text-xs" style={{ color: "#ff7878" }}>
                  Passwords do not match.
                </p>
              )}
            </div>

            {/* Server error */}
            {error && (
              <div
                className="rounded-lg px-4 py-3 text-sm"
                style={{
                  background: "rgba(192,40,40,0.12)",
                  border: "1px solid rgba(192,40,40,0.35)",
                  color: "#ff7878",
                }}
              >
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={!canSubmit}
              className="btn-primary w-full mt-1"
            >
              {loading ? (
                <span
                  className="spinner"
                  style={{ borderTopColor: "#200909", borderColor: "rgba(32,9,9,0.3)" }}
                />
              ) : (
                "Set Password & Continue"
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

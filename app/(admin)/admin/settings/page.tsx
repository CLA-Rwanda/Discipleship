"use client";

import { useState } from "react";
import { KeyRound, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { createClient } from "@/lib/supabase";
import { changeAdminPassword } from "@/actions/auth";
import { ADMIN_EMAIL } from "@/lib/config";

export default function SettingsPage() {
  const [form, setForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess(false);

    if (form.newPassword.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    if (form.newPassword !== form.confirmPassword) {
      setError("New passwords do not match.");
      return;
    }
    if (form.currentPassword === form.newPassword) {
      setError("New password must be different from the current one.");
      return;
    }

    setLoading(true);

    // Re-verify identity with current password before allowing overwrite
    const supabase = createClient();
    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: ADMIN_EMAIL,
      password: form.currentPassword,
    });

    if (verifyError) {
      setLoading(false);
      setError("Current password is incorrect.");
      return;
    }

    const result = await changeAdminPassword(
      form.currentPassword,
      form.newPassword
    );
    setLoading(false);

    if (result.success) {
      setSuccess(true);
      setForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
    } else {
      setError(result.error ?? "Something went wrong.");
    }
  }

  return (
    <div className="flex flex-col gap-6 animate-fade-in max-w-lg">
      {/* Header */}
      <div>
        <h1
          className="text-3xl font-extrabold"
          style={{ fontFamily: "Barlow Condensed, sans-serif" }}
        >
          Settings
        </h1>
        <p className="text-sm mt-0.5" style={{ color: "rgba(248,240,230,0.5)" }}>
          Manage your admin account
        </p>
      </div>

      {/* Account info */}
      <div
        className="rounded-xl p-5"
        style={{
          background: "var(--cla-bg-card)",
          border: "1px solid rgba(228,148,12,0.15)",
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-11 h-11 rounded-full flex items-center justify-center font-bold text-lg shrink-0"
            style={{
              fontFamily: "Barlow Condensed, sans-serif",
              background: "rgba(228,148,12,0.15)",
              color: "var(--cla-amber)",
            }}
          >
            {ADMIN_EMAIL.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="font-bold">Administrator</p>
            <p className="text-sm" style={{ color: "rgba(248,240,230,0.55)" }}>
              {ADMIN_EMAIL}
            </p>
          </div>
          <div className="ml-auto">
            <div
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold"
              style={{
                fontFamily: "Barlow Condensed, sans-serif",
                background: "rgba(91,45,142,0.15)",
                color: "#b47fea",
                border: "1px solid rgba(91,45,142,0.3)",
              }}
            >
              <ShieldCheck size={12} />
              Super Admin
            </div>
          </div>
        </div>
      </div>

      {/* Change password */}
      <div
        className="rounded-xl overflow-hidden"
        style={{
          background: "var(--cla-bg-card)",
          border: "1px solid rgba(228,148,12,0.15)",
        }}
      >
        <div
          className="px-5 py-4"
          style={{ borderBottom: "1px solid rgba(228,148,12,0.1)" }}
        >
          <h2
            className="text-lg font-bold flex items-center gap-2"
            style={{ fontFamily: "Barlow Condensed, sans-serif" }}
          >
            <KeyRound size={18} style={{ color: "var(--cla-amber)" }} />
            Change Password
          </h2>
          <p className="text-sm mt-0.5" style={{ color: "rgba(248,240,230,0.45)" }}>
            Your current password is permanently replaced — the old one is
            erased from the database.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-4">
          {/* Current password */}
          <div className="relative">
            <Input
              label="Current Password"
              type={showCurrent ? "text" : "password"}
              placeholder="Your existing password"
              value={form.currentPassword}
              onChange={(e) =>
                setForm((f) => ({ ...f, currentPassword: e.target.value }))
              }
              required
              autoComplete="current-password"
            />
            <button
              type="button"
              onClick={() => setShowCurrent((v) => !v)}
              className="absolute right-3 top-8 p-1"
              style={{ color: "rgba(248,240,230,0.4)" }}
              tabIndex={-1}
              aria-label="Toggle"
            >
              {showCurrent ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          <div
            style={{ borderTop: "1px solid rgba(228,148,12,0.08)" }}
          />

          {/* New password */}
          <div className="relative">
            <Input
              label="New Password"
              type={showNew ? "text" : "password"}
              placeholder="Min. 8 characters"
              value={form.newPassword}
              onChange={(e) =>
                setForm((f) => ({ ...f, newPassword: e.target.value }))
              }
              required
              autoComplete="new-password"
              hint="At least 8 characters"
            />
            <button
              type="button"
              onClick={() => setShowNew((v) => !v)}
              className="absolute right-3 top-8 p-1"
              style={{ color: "rgba(248,240,230,0.4)" }}
              tabIndex={-1}
              aria-label="Toggle"
            >
              {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          {/* Confirm */}
          <div className="relative">
            <Input
              label="Confirm New Password"
              type={showConfirm ? "text" : "password"}
              placeholder="Repeat new password"
              value={form.confirmPassword}
              onChange={(e) =>
                setForm((f) => ({ ...f, confirmPassword: e.target.value }))
              }
              required
              autoComplete="new-password"
            />
            <button
              type="button"
              onClick={() => setShowConfirm((v) => !v)}
              className="absolute right-3 top-8 p-1"
              style={{ color: "rgba(248,240,230,0.4)" }}
              tabIndex={-1}
              aria-label="Toggle"
            >
              {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          {error && (
            <div
              className="p-3 rounded-lg text-sm"
              style={{
                background: "rgba(139,26,26,0.15)",
                border: "1px solid rgba(139,26,26,0.3)",
                color: "#ff6b6b",
              }}
            >
              {error}
            </div>
          )}

          {success && (
            <div
              className="p-4 rounded-lg text-sm"
              style={{
                background: "rgba(107,122,0,0.12)",
                border: "1px solid rgba(200,212,0,0.3)",
                color: "#c8d400",
              }}
            >
              ✓ Password updated successfully. Your old password has been
              permanently erased and replaced.
            </div>
          )}

          <Button
            type="submit"
            variant="primary"
            loading={loading}
            className="w-full mt-1"
          >
            <KeyRound size={16} />
            Update Password
          </Button>
        </form>
      </div>
    </div>
  );
}

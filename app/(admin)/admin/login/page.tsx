"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Lock, KeyRound, Eye, EyeOff, ArrowLeft } from "lucide-react";
import { CLALogo } from "@/components/ui/CLALogo";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { createClient } from "@/lib/supabase";
import { changeAdminPassword } from "@/actions/auth";

type View = "login" | "change-password";

export default function AdminLoginPage() {
  const router = useRouter();
  const [view, setView] = useState<View>("login");

  // Login state
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [showLoginPw, setShowLoginPw] = useState(false);

  useEffect(() => {
    const error = new URLSearchParams(window.location.search).get("error");
    const messages: Record<string, string> = {
      invite_expired: "This invitation has expired or has already been used. Ask an administrator to send a new invitation.",
      invalid_link: "This invitation link is incomplete or invalid. Ask an administrator to send a new invitation.",
      auth_callback_failed: "We couldn't complete sign-in. Please try again or use your normal password.",
    };
    if (error && messages[error]) setLoginError(messages[error]);
  }, []);

  // Change-password state
  const [cpForm, setCpForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [cpError, setCpError] = useState("");
  const [cpSuccess, setCpSuccess] = useState(false);
  const [cpLoading, setCpLoading] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginError("");
    setLoginLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: loginForm.email.trim().toLowerCase(),
      password: loginForm.password,
    });
    setLoginLoading(false);

    if (error) {
      setLoginError("Incorrect email or password.");
    } else {
      router.push("/admin/dashboard");
      router.refresh();
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setCpError("");
    setCpSuccess(false);

    if (cpForm.newPassword.length < 8) {
      setCpError("New password must be at least 8 characters.");
      return;
    }
    if (cpForm.newPassword !== cpForm.confirmPassword) {
      setCpError("New passwords do not match.");
      return;
    }
    if (cpForm.currentPassword === cpForm.newPassword) {
      setCpError("New password must be different from the current one.");
      return;
    }

    setCpLoading(true);

    // Sign in with current password to verify identity before overwriting
    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: loginForm.email.trim().toLowerCase(),
      password: cpForm.currentPassword,
    });

    if (signInError) {
      setCpLoading(false);
      setCpError("Current password is incorrect.");
      return;
    }

    const result = await changeAdminPassword(
      cpForm.currentPassword,
      cpForm.newPassword
    );
    setCpLoading(false);

    if (result.success) {
      setCpSuccess(true);
      setCpForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
    } else {
      setCpError(result.error ?? "Something went wrong.");
    }
  }

  return (
    <div
      className="min-h-dvh flex flex-col items-center justify-center p-6"
      style={{ background: "var(--cla-bg-dark)" }}
    >
      <div className="w-full max-w-sm flex flex-col gap-8">
        {/* Header */}
        <div className="flex flex-col items-center gap-4 text-center">
          <CLALogo size="lg" />
          <div>
            <h1
              className="text-3xl font-extrabold"
              style={{ fontFamily: "Barlow Condensed, sans-serif" }}
            >
              Admin{" "}
              <span className="text-amber-gradient">
                {view === "login" ? "Console" : "Password Reset"}
              </span>
            </h1>
            <p
              className="text-sm mt-1"
              style={{ color: "rgba(248,240,230,0.5)" }}
            >
              {view === "login"
                ? "Sign in to manage discipleship classes"
                : "Verify your current password, then set a new one"}
            </p>
          </div>
        </div>

        {/* ── LOGIN ── */}
        {view === "login" && (
          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            <div
              className="rounded-xl p-5 flex flex-col gap-4"
              style={{
                background: "var(--cla-bg-card)",
                border: "1px solid rgba(228,148,12,0.15)",
              }}
            >
              <Input
                label="Email Address"
                type="email"
                placeholder="admin@claonline.org"
                value={loginForm.email}
                onChange={(e) =>
                  setLoginForm((f) => ({ ...f, email: e.target.value }))
                }
                required
                autoComplete="email"
              />

              <div className="relative">
                <Input
                  label="Password"
                  type={showLoginPw ? "text" : "password"}
                  placeholder="••••••••"
                  value={loginForm.password}
                  onChange={(e) =>
                    setLoginForm((f) => ({ ...f, password: e.target.value }))
                  }
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowLoginPw((v) => !v)}
                  className="absolute right-3 top-8 p-1"
                  style={{ color: "rgba(248,240,230,0.4)" }}
                  tabIndex={-1}
                  aria-label="Toggle password visibility"
                >
                  {showLoginPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {loginError && (
              <div
                className="p-3 rounded-lg text-sm"
                style={{
                  background: "rgba(139,26,26,0.15)",
                  border: "1px solid rgba(139,26,26,0.3)",
                  color: "#ff6b6b",
                }}
              >
                {loginError}
              </div>
            )}

            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={loginLoading}
              className="w-full"
            >
              <Lock size={16} />
              Sign In
            </Button>

            <button
              type="button"
              onClick={() => {
                setView("change-password");
                setLoginError("");
              }}
              className="text-sm text-center"
              style={{ color: "rgba(248,240,230,0.4)" }}
            >
              <span
                className="hover:underline transition-colors"
                style={{ color: "var(--cla-amber)" }}
              >
                Change / Reset Password
              </span>
            </button>
          </form>
        )}

        {/* ── CHANGE PASSWORD ── */}
        {view === "change-password" && (
          <form onSubmit={handleChangePassword} className="flex flex-col gap-4">
            <div
              className="rounded-xl p-5 flex flex-col gap-5"
              style={{
                background: "var(--cla-bg-card)",
                border: "1px solid rgba(228,148,12,0.15)",
              }}
            >
              {/* Current */}
              <div className="relative">
                <Input
                  label="Current Password"
                  type={showCurrent ? "text" : "password"}
                  placeholder="Your existing password"
                  value={cpForm.currentPassword}
                  onChange={(e) =>
                    setCpForm((f) => ({ ...f, currentPassword: e.target.value }))
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
                style={{ borderTop: "1px solid rgba(228,148,12,0.1)" }}
              />

              {/* New */}
              <div className="relative">
                <Input
                  label="New Password"
                  type={showNew ? "text" : "password"}
                  placeholder="Min. 8 characters"
                  value={cpForm.newPassword}
                  onChange={(e) =>
                    setCpForm((f) => ({ ...f, newPassword: e.target.value }))
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

              <Input
                label="Confirm New Password"
                type="password"
                placeholder="Repeat new password"
                value={cpForm.confirmPassword}
                onChange={(e) =>
                  setCpForm((f) => ({
                    ...f,
                    confirmPassword: e.target.value,
                  }))
                }
                required
                autoComplete="new-password"
              />
            </div>

            {cpError && (
              <div
                className="p-3 rounded-lg text-sm"
                style={{
                  background: "rgba(139,26,26,0.15)",
                  border: "1px solid rgba(139,26,26,0.3)",
                  color: "#ff6b6b",
                }}
              >
                {cpError}
              </div>
            )}

            {cpSuccess && (
              <div
                className="p-4 rounded-lg text-sm"
                style={{
                  background: "rgba(107,122,0,0.12)",
                  border: "1px solid rgba(200,212,0,0.3)",
                  color: "#c8d400",
                }}
              >
                ✓ Password updated. Your old password has been permanently
                replaced. Sign in with your new password.
              </div>
            )}

            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={cpLoading}
              className="w-full"
            >
              <KeyRound size={16} />
              Update Password
            </Button>

            <button
              type="button"
              onClick={() => {
                setView("login");
                setCpError("");
                setCpSuccess(false);
              }}
              className="flex items-center justify-center gap-1.5 text-sm"
              style={{ color: "rgba(248,240,230,0.4)" }}
            >
              <ArrowLeft size={14} />
              Back to Sign In
            </button>
          </form>
        )}

        <p
          className="text-center text-xs"
          style={{ color: "rgba(248,240,230,0.25)" }}
        >
          Only authorized CLA staff may access this area.
        </p>
      </div>
    </div>
  );
}

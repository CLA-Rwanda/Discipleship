"use client";

import { useState, useEffect } from "react";
import { KeyRound, Eye, EyeOff, ShieldCheck, Skull, AlertTriangle, SlidersHorizontal, Save } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { createClient } from "@/lib/supabase";
import { changeAdminPassword } from "@/actions/auth";
import { eraseAllData } from "@/actions/admin";
import { getAppSettings, updateAppSetting } from "@/actions/settings";
import { ADMIN_EMAIL } from "@/lib/config";

interface SettingField {
  key: string;
  label: string;
  hint: string;
}

const SETTING_FIELDS: SettingField[] = [
  { key: "total_sessions",           label: "Total Sessions",           hint: "Total number of discipleship sessions in a cycle" },
  { key: "attendance_threshold_pct", label: "Attendance Threshold (%)", hint: "Percentage of sessions required to qualify for missions" },
  { key: "max_members_per_class",    label: "Max Members per Class",    hint: "Maximum members allowed in each class" },
  { key: "max_classes",              label: "Max Classes",              hint: "Maximum number of active classes allowed" },
];

export default function SettingsPage() {
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  // App settings
  const [appSettings, setAppSettings] = useState<Record<string, string>>({
    total_sessions: "21",
    attendance_threshold_pct: "75",
    max_members_per_class: "15",
    max_classes: "16",
  });
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [savingKey, setSavingKey]             = useState<string | null>(null);
  const [savedKey, setSavedKey]               = useState<string | null>(null);
  const [settingsErrors, setSettingsErrors]   = useState<Record<string, string>>({});

  // Danger zone
  const [dangerStep, setDangerStep]   = useState<0 | 1 | 2>(0);
  const [eraseCounts, setEraseCounts] = useState<{ members: number; attendance: number } | null>(null);
  const [confirmInput, setConfirmInput] = useState("");
  const [erasing, setErasing]         = useState(false);
  const [eraseError, setEraseError]   = useState("");
  const [eraseSuccess, setEraseSuccess] = useState(false);

  // Password
  const [form, setForm]         = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [pwError, setPwError]   = useState("");
  const [pwSuccess, setPwSuccess] = useState(false);
  const [pwLoading, setPwLoading] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew]         = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.email === ADMIN_EMAIL) setIsSuperAdmin(true);
    });
    getAppSettings().then((s) => {
      setAppSettings({
        total_sessions:           String(s.total_sessions),
        attendance_threshold_pct: String(s.attendance_threshold_pct),
        max_members_per_class:    String(s.max_members_per_class),
        max_classes:              String(s.max_classes),
      });
      setSettingsLoading(false);
    });
  }, []);

  const totalSessions  = parseInt(appSettings.total_sessions) || 0;
  const thresholdPct   = parseInt(appSettings.attendance_threshold_pct) || 0;
  const maxPerClass    = parseInt(appSettings.max_members_per_class) || 0;
  const maxClasses     = parseInt(appSettings.max_classes) || 0;
  const sessionsReq    = Math.ceil((totalSessions * thresholdPct) / 100);
  const totalSpots     = maxClasses * maxPerClass;

  async function handleSaveSetting(key: string) {
    const raw = appSettings[key] ?? "";
    const num = parseInt(raw);
    if (isNaN(num) || num <= 0) {
      setSettingsErrors((e) => ({ ...e, [key]: "Must be a positive number" }));
      return;
    }
    setSettingsErrors((e) => ({ ...e, [key]: "" }));
    setSavingKey(key);
    const result = await updateAppSetting(key, String(num));
    setSavingKey(null);
    if (result.success) {
      setSavedKey(key);
      setTimeout(() => setSavedKey(null), 2000);
    }
  }

  async function openDangerZone() {
    const supabase = createClient();
    const [{ count: memCount }, { count: attCount }] = await Promise.all([
      supabase.from("members").select("*", { count: "exact", head: true }),
      supabase.from("attendance").select("*", { count: "exact", head: true }),
    ]);
    setEraseCounts({ members: memCount ?? 0, attendance: attCount ?? 0 });
    setDangerStep(1);
  }

  async function handleEraseAll() {
    setErasing(true);
    setEraseError("");
    const result = await eraseAllData();
    setErasing(false);
    if (result.success) { setEraseSuccess(true); setDangerStep(0); setConfirmInput(""); }
    else setEraseError(result.error ?? "Something went wrong.");
  }

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPwError("");
    setPwSuccess(false);
    if (form.newPassword.length < 8)                    { setPwError("New password must be at least 8 characters."); return; }
    if (form.newPassword !== form.confirmPassword)       { setPwError("New passwords do not match."); return; }
    if (form.currentPassword === form.newPassword)       { setPwError("New password must be different from the current one."); return; }
    setPwLoading(true);
    const supabase = createClient();
    const { error: verifyError } = await supabase.auth.signInWithPassword({ email: ADMIN_EMAIL, password: form.currentPassword });
    if (verifyError) { setPwLoading(false); setPwError("Current password is incorrect."); return; }
    const result = await changeAdminPassword(form.currentPassword, form.newPassword);
    setPwLoading(false);
    if (result.success) { setPwSuccess(true); setForm({ currentPassword: "", newPassword: "", confirmPassword: "" }); }
    else setPwError(result.error ?? "Something went wrong.");
  }

  const cardStyle = { background: "var(--cla-bg-card)", border: "1px solid rgba(228,148,12,0.15)" };
  const headerBorder = { borderBottom: "1px solid rgba(228,148,12,0.1)" };

  return (
    <div className="flex flex-col gap-6 animate-fade-in max-w-lg">
      <div>
        <h1 className="text-3xl font-extrabold" style={{ fontFamily: "Barlow Condensed, sans-serif" }}>Settings</h1>
        <p className="text-sm mt-0.5" style={{ color: "rgba(248,240,230,0.5)" }}>App configuration and admin account</p>
      </div>

      {/* Account info */}
      <div className="rounded-xl p-5" style={cardStyle}>
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-full flex items-center justify-center font-bold text-lg shrink-0"
            style={{ fontFamily: "Barlow Condensed, sans-serif", background: "rgba(228,148,12,0.15)", color: "var(--cla-amber)" }}>
            {ADMIN_EMAIL.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="font-bold">Administrator</p>
            <p className="text-sm" style={{ color: "rgba(248,240,230,0.55)" }}>{ADMIN_EMAIL}</p>
          </div>
          <div className="ml-auto">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold"
              style={{ fontFamily: "Barlow Condensed, sans-serif", background: "rgba(91,45,142,0.15)", color: "#b47fea", border: "1px solid rgba(91,45,142,0.3)" }}>
              <ShieldCheck size={12} /> Super Admin
            </div>
          </div>
        </div>
      </div>

      {/* App Settings */}
      {isSuperAdmin && (
        <div className="rounded-xl overflow-hidden" style={cardStyle}>
          <div className="px-5 py-4" style={headerBorder}>
            <h2 className="text-lg font-bold flex items-center gap-2" style={{ fontFamily: "Barlow Condensed, sans-serif" }}>
              <SlidersHorizontal size={18} style={{ color: "var(--cla-amber)" }} />
              App Configuration
            </h2>
            <p className="text-sm mt-0.5" style={{ color: "rgba(248,240,230,0.45)" }}>
              All thresholds and limits read from here in real time. Changes take effect immediately.
            </p>
          </div>

          {settingsLoading ? (
            <div className="p-5 flex items-center justify-center">
              <div className="spinner" style={{ width: 24, height: 24, borderTopColor: "var(--cla-amber)", borderColor: "rgba(228,148,12,0.2)" }} />
            </div>
          ) : (
            <div className="p-5 flex flex-col gap-5">
              {SETTING_FIELDS.map(({ key, label, hint }) => (
                <div key={key} className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1">
                      <label className="text-sm font-bold block" style={{ fontFamily: "Barlow Condensed, sans-serif" }}>{label}</label>
                      <p className="text-xs mt-0.5" style={{ color: "rgba(248,240,230,0.4)" }}>{hint}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        value={appSettings[key] ?? ""}
                        onChange={(e) => setAppSettings((s) => ({ ...s, [key]: e.target.value }))}
                        onBlur={() => handleSaveSetting(key)}
                        className="cla-input text-center font-bold tabular-nums"
                        style={{ width: 80, padding: "6px 8px" }}
                      />
                      <button
                        onClick={() => handleSaveSetting(key)}
                        disabled={savingKey === key}
                        className="p-1.5 rounded-lg transition-all"
                        style={{ color: savedKey === key ? "#C8D400" : "rgba(228,148,12,0.6)" }}
                        title="Save"
                      >
                        {savingKey === key
                          ? <span className="spinner" style={{ width: 14, height: 14, borderTopColor: "var(--cla-amber)", borderColor: "rgba(228,148,12,0.2)" }} />
                          : savedKey === key
                          ? <Save size={14} style={{ color: "#C8D400" }} />
                          : <Save size={14} />}
                      </button>
                    </div>
                  </div>
                  {settingsErrors[key] && <p className="text-xs" style={{ color: "#ff6b6b" }}>{settingsErrors[key]}</p>}
                </div>
              ))}

              {/* Live calculations */}
              <div className="grid grid-cols-2 gap-3 pt-2" style={{ borderTop: "1px solid rgba(228,148,12,0.1)" }}>
                <div className="p-3 rounded-lg" style={{ background: "rgba(228,148,12,0.06)", border: "1px solid rgba(228,148,12,0.15)" }}>
                  <p className="text-xs uppercase tracking-widest mb-0.5" style={{ fontFamily: "Barlow Condensed, sans-serif", color: "rgba(248,240,230,0.45)" }}>Total Capacity</p>
                  <p className="text-2xl font-extrabold" style={{ fontFamily: "Barlow Condensed, sans-serif", color: "var(--cla-amber-light)" }}>{totalSpots}</p>
                  <p className="text-xs" style={{ color: "rgba(248,240,230,0.4)" }}>{maxClasses} classes × {maxPerClass} members</p>
                </div>
                <div className="p-3 rounded-lg" style={{ background: "rgba(200,212,0,0.06)", border: "1px solid rgba(200,212,0,0.15)" }}>
                  <p className="text-xs uppercase tracking-widest mb-0.5" style={{ fontFamily: "Barlow Condensed, sans-serif", color: "rgba(248,240,230,0.45)" }}>Sessions Required</p>
                  <p className="text-2xl font-extrabold" style={{ fontFamily: "Barlow Condensed, sans-serif", color: "#C8D400" }}>{sessionsReq}</p>
                  <p className="text-xs" style={{ color: "rgba(248,240,230,0.4)" }}>of {totalSessions} sessions ({thresholdPct}%)</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Change Password */}
      <div className="rounded-xl overflow-hidden" style={cardStyle}>
        <div className="px-5 py-4" style={headerBorder}>
          <h2 className="text-lg font-bold flex items-center gap-2" style={{ fontFamily: "Barlow Condensed, sans-serif" }}>
            <KeyRound size={18} style={{ color: "var(--cla-amber)" }} /> Change Password
          </h2>
          <p className="text-sm mt-0.5" style={{ color: "rgba(248,240,230,0.45)" }}>Your current password is permanently replaced — the old one is erased from the database.</p>
        </div>

        <form onSubmit={handlePasswordSubmit} className="p-5 flex flex-col gap-4">
          <div className="relative">
            <Input label="Current Password" type={showCurrent ? "text" : "password"} placeholder="Your existing password"
              value={form.currentPassword} onChange={(e) => setForm((f) => ({ ...f, currentPassword: e.target.value }))} required autoComplete="current-password" />
            <button type="button" onClick={() => setShowCurrent((v) => !v)} className="absolute right-3 top-8 p-1" style={{ color: "rgba(248,240,230,0.4)" }} tabIndex={-1}>
              {showCurrent ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <div style={{ borderTop: "1px solid rgba(228,148,12,0.08)" }} />
          <div className="relative">
            <Input label="New Password" type={showNew ? "text" : "password"} placeholder="Min. 8 characters"
              value={form.newPassword} onChange={(e) => setForm((f) => ({ ...f, newPassword: e.target.value }))} required autoComplete="new-password" hint="At least 8 characters" />
            <button type="button" onClick={() => setShowNew((v) => !v)} className="absolute right-3 top-8 p-1" style={{ color: "rgba(248,240,230,0.4)" }} tabIndex={-1}>
              {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <div className="relative">
            <Input label="Confirm New Password" type={showConfirm ? "text" : "password"} placeholder="Repeat new password"
              value={form.confirmPassword} onChange={(e) => setForm((f) => ({ ...f, confirmPassword: e.target.value }))} required autoComplete="new-password" />
            <button type="button" onClick={() => setShowConfirm((v) => !v)} className="absolute right-3 top-8 p-1" style={{ color: "rgba(248,240,230,0.4)" }} tabIndex={-1}>
              {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          {pwError   && <div className="p-3 rounded-lg text-sm" style={{ background: "rgba(139,26,26,0.15)", border: "1px solid rgba(139,26,26,0.3)", color: "#ff6b6b" }}>{pwError}</div>}
          {pwSuccess && <div className="p-4 rounded-lg text-sm" style={{ background: "rgba(107,122,0,0.12)", border: "1px solid rgba(200,212,0,0.3)", color: "#c8d400" }}>✓ Password updated successfully.</div>}
          <Button type="submit" variant="primary" loading={pwLoading} className="w-full mt-1"><KeyRound size={16} /> Update Password</Button>
        </form>
      </div>

      {/* Danger Zone */}
      {isSuperAdmin && (
        <div className="rounded-xl overflow-hidden" style={{ border: "2px solid rgba(192,40,40,0.5)" }}>
          <div className="px-5 py-4 flex items-center gap-3" style={{ background: "rgba(192,40,40,0.12)", borderBottom: "1px solid rgba(192,40,40,0.3)" }}>
            <Skull size={20} style={{ color: "#ff4444" }} />
            <div>
              <h2 className="text-lg font-extrabold" style={{ fontFamily: "Barlow Condensed, sans-serif", color: "#ff4444" }}>Danger Zone</h2>
              <p className="text-xs" style={{ color: "rgba(248,240,230,0.5)" }}>Irreversible actions. Read carefully before proceeding.</p>
            </div>
          </div>
          <div className="p-5 flex flex-col gap-4" style={{ background: "rgba(139,26,26,0.07)" }}>
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <p className="font-bold" style={{ color: "rgba(248,240,230,0.85)" }}>Erase All Member &amp; Attendance Data</p>
                <p className="text-sm mt-0.5" style={{ color: "rgba(248,240,230,0.45)" }}>Permanently deletes every registered member and all attendance records. Classes and facilitators are not affected.</p>
              </div>
              {!eraseSuccess && dangerStep === 0 && (
                <button onClick={openDangerZone} className="shrink-0 px-4 py-2 rounded-lg font-bold text-sm transition-all"
                  style={{ fontFamily: "Barlow Condensed, sans-serif", background: "rgba(192,40,40,0.2)", color: "#ff4444", border: "1px solid rgba(192,40,40,0.5)" }}>
                  Erase All Data
                </button>
              )}
            </div>

            {eraseSuccess && (
              <div className="p-3 rounded-lg text-sm font-semibold" style={{ background: "rgba(107,122,0,0.12)", border: "1px solid rgba(200,212,0,0.3)", color: "#c8d400" }}>
                ✓ All member and attendance data has been permanently erased.
              </div>
            )}

            {dangerStep === 1 && eraseCounts && (
              <div className="flex flex-col gap-4 p-4 rounded-xl" style={{ background: "rgba(192,40,40,0.12)", border: "1px solid rgba(192,40,40,0.4)" }}>
                <div className="flex items-start gap-3">
                  <AlertTriangle size={20} style={{ color: "#ff4444", flexShrink: 0, marginTop: 2 }} />
                  <div className="flex flex-col gap-1">
                    <p className="font-extrabold text-base" style={{ color: "#ff4444", fontFamily: "Barlow Condensed, sans-serif" }}>YOU ARE ABOUT TO PERMANENTLY DELETE:</p>
                    <ul className="text-sm flex flex-col gap-0.5 mt-1" style={{ color: "rgba(248,240,230,0.8)" }}>
                      <li><span className="font-bold" style={{ color: "#ff6b6b" }}>{eraseCounts.members.toLocaleString()} registered member{eraseCounts.members !== 1 ? "s" : ""}</span></li>
                      <li><span className="font-bold" style={{ color: "#ff6b6b" }}>{eraseCounts.attendance.toLocaleString()} attendance record{eraseCounts.attendance !== 1 ? "s" : ""}</span></li>
                    </ul>
                    <p className="text-sm mt-2 font-bold" style={{ color: "#ff4444" }}>THIS CANNOT BE UNDONE. There is no backup.</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setDangerStep(0)} className="flex-1 py-2 rounded-lg text-sm font-bold" style={{ border: "1px solid rgba(255,255,255,0.15)", color: "rgba(248,240,230,0.6)" }}>Cancel — keep all data</button>
                  <button onClick={() => setDangerStep(2)} className="flex-1 py-2 rounded-lg text-sm font-bold" style={{ background: "rgba(192,40,40,0.3)", color: "#ff4444", border: "1px solid rgba(192,40,40,0.5)" }}>I understand — continue →</button>
                </div>
              </div>
            )}

            {dangerStep === 2 && (
              <div className="flex flex-col gap-4 p-4 rounded-xl" style={{ background: "rgba(192,40,40,0.15)", border: "2px solid rgba(192,40,40,0.6)" }}>
                <div className="flex items-center gap-2">
                  <Skull size={18} style={{ color: "#ff4444" }} />
                  <p className="font-extrabold" style={{ color: "#ff4444", fontFamily: "Barlow Condensed, sans-serif", fontSize: "1rem" }}>FINAL CONFIRMATION REQUIRED</p>
                </div>
                <p className="text-sm" style={{ color: "rgba(248,240,230,0.7)" }}>Type <span className="font-extrabold" style={{ color: "#ff4444" }}>ERASE</span> to confirm.</p>
                <input type="text" value={confirmInput} onChange={(e) => setConfirmInput(e.target.value)} placeholder="Type ERASE here"
                  className="cla-input font-bold tracking-widest text-center" style={{ borderColor: confirmInput === "ERASE" ? "#ff4444" : undefined, color: "#ff6b6b" }} autoComplete="off" />
                {eraseError && <p className="text-sm" style={{ color: "#ff6b6b" }}>{eraseError}</p>}
                <div className="flex gap-3">
                  <button onClick={() => { setDangerStep(0); setConfirmInput(""); }} className="flex-1 py-2 rounded-lg text-sm font-bold" style={{ border: "1px solid rgba(255,255,255,0.15)", color: "rgba(248,240,230,0.6)" }}>Cancel</button>
                  <button onClick={handleEraseAll} disabled={confirmInput !== "ERASE" || erasing} className="flex-1 py-2.5 rounded-lg text-sm font-extrabold transition-all"
                    style={{ fontFamily: "Barlow Condensed, sans-serif", fontSize: "0.95rem", letterSpacing: "0.04em", background: confirmInput === "ERASE" ? "#8b1a1a" : "rgba(192,40,40,0.1)", color: confirmInput === "ERASE" ? "#ffffff" : "rgba(255,100,100,0.3)", border: "1px solid rgba(192,40,40,0.5)", cursor: confirmInput !== "ERASE" ? "not-allowed" : "pointer" }}>
                    {erasing ? "Erasing…" : "⚠ Permanently Erase All Data"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

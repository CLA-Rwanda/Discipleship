"use client";

import { useState, useEffect } from "react";
import { KeyRound, Eye, EyeOff, ShieldCheck, Skull, AlertTriangle, SlidersHorizontal, Save, Lock, Plus, Trash2, UserCheck, Calendar, ListChecks, ScrollText, RotateCcw, Archive } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { SlotBadge } from "@/components/ui/Badge";
import { createClient } from "@/lib/supabase";
import { changeAdminPassword } from "@/actions/auth";
import {
  eraseAllData, bulkDeleteClasses, getAuditLog, type AuditLogEntry,
  getTrash, restoreTrashItem, restoreTrashBatch, type TrashEntry,
} from "@/actions/admin";
import { getAppSettings, updateAppSetting } from "@/actions/settings";
import { getTimeLocks, getTimeLockEnabled, createTimeLock, updateTimeLock, deleteTimeLock } from "@/actions/time-lock";
import { getMyRole } from "@/lib/assert-admin";
import { type TimeLock, DAY_NAMES } from "@/lib/time-lock";

interface ClassForDanger { id: string; name: string; slot: string; member_count: number }

const TRASH_TABLE_LABELS: Record<string, string> = {
  members: "Member", facilitators: "Facilitator", classes: "Class", attendance: "Attendance record",
};

function describeTrashItem(entry: TrashEntry): string {
  const d = entry.data;
  switch (entry.table_name) {
    case "members":      return d.other_name ? `${d.first_name} ${d.other_name} ${d.last_name}` : `${d.first_name} ${d.last_name}`;
    case "facilitators": return d.full_name;
    case "classes":      return `${d.name} (${d.slot})`;
    case "attendance":   return `${d.member_name} — ${new Date(d.attended_at).toLocaleDateString("en-GB")}`;
    default:             return entry.record_id;
  }
}

function daysLeft(expiresAt: string): number {
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
}

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
  const [registrationOpen, setRegistrationOpen] = useState(true);
  const [regToggling, setRegToggling]           = useState(false);
  const [classStartDate, setClassStartDate]     = useState("");
  const [startDateSaving, setStartDateSaving]   = useState(false);
  const [startDateSaved, setStartDateSaved]     = useState(false);
  const [startDateError, setStartDateError]     = useState("");
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [savingKey, setSavingKey]             = useState<string | null>(null);
  const [savedKey, setSavedKey]               = useState<string | null>(null);
  const [settingsErrors, setSettingsErrors]   = useState<Record<string, string>>({});

  // Time lock
  const [timeLockEnabled, setTimeLockEnabled] = useState(false);
  const [timeLocks, setTimeLocks]             = useState<TimeLock[]>([]);
  const [tlLoading, setTlLoading]             = useState(true);
  const [tlEnabling, setTlEnabling]           = useState(false);
  const [addTlOpen, setAddTlOpen]             = useState(false);
  const [tlForm, setTlForm]                   = useState({
    label: "Sunday Service", day_of_week: 0, start_time: "08:00", end_time: "12:00", is_active: true,
  });
  const [tlSaving, setTlSaving]               = useState(false);
  const [tlBusyId, setTlBusyId]               = useState<string | null>(null);

  // Danger zone
  const [dangerStep, setDangerStep]   = useState<0 | 1 | 2>(0);
  const [eraseCounts, setEraseCounts] = useState<{ members: number; attendance: number } | null>(null);
  const [confirmInput, setConfirmInput] = useState("");
  const [erasing, setErasing]         = useState(false);
  const [eraseError, setEraseError]   = useState("");
  const [eraseSuccess, setEraseSuccess] = useState(false);

  // Danger zone — delete classes
  const [classDangerOpen, setClassDangerOpen]   = useState(false);
  const [classList, setClassList]               = useState<ClassForDanger[]>([]);
  const [classListLoading, setClassListLoading] = useState(false);
  const [selectedClassIds, setSelectedClassIds] = useState<Set<string>>(new Set());
  const [classDeleteConfirm, setClassDeleteConfirm] = useState(false);
  const [classDeleting, setClassDeleting]       = useState(false);
  const [classDeleteError, setClassDeleteError] = useState("");

  // Danger zone — audit log
  const [auditLog, setAuditLog]               = useState<AuditLogEntry[]>([]);
  const [auditLogLoading, setAuditLogLoading] = useState(false);

  // Danger zone — recycle bin
  const [trashItems, setTrashItems]       = useState<TrashEntry[]>([]);
  const [trashLoading, setTrashLoading]   = useState(false);
  const [restoringId, setRestoringId]     = useState<string | null>(null);
  const [restoringBatch, setRestoringBatch] = useState<string | null>(null);
  const [trashError, setTrashError]       = useState("");

  // Password
  const [form, setForm]         = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [pwError, setPwError]   = useState("");
  const [pwSuccess, setPwSuccess] = useState(false);
  const [pwLoading, setPwLoading] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew]         = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [currentUserEmail, setCurrentUserEmail] = useState("");

  useEffect(() => {
    getMyRole().then((r) => {
      setIsSuperAdmin(r?.isFullAdmin ?? false);
      setCurrentUserEmail(r?.email ?? "");
      if (r?.isFullAdmin) {
        setAuditLogLoading(true);
        getAuditLog().then((log) => { setAuditLog(log); setAuditLogLoading(false); });
        setTrashLoading(true);
        getTrash().then((items) => { setTrashItems(items); setTrashLoading(false); });
      }
    });
    Promise.all([
      getAppSettings(),
      getTimeLockEnabled(),
      getTimeLocks(),
    ]).then(([s, enabled, locks]) => {
      setAppSettings({
        total_sessions:           String(s.total_sessions),
        attendance_threshold_pct: String(s.attendance_threshold_pct),
        max_members_per_class:    String(s.max_members_per_class),
        max_classes:              String(s.max_classes),
      });
      setRegistrationOpen(s.registration_open);
      setClassStartDate(s.class_start_date ?? "");
      setSettingsLoading(false);
      setTimeLockEnabled(enabled);
      setTimeLocks(locks);
      setTlLoading(false);
    });
  }, []);

  const totalSessions  = parseInt(appSettings.total_sessions) || 0;
  const thresholdPct   = parseInt(appSettings.attendance_threshold_pct) || 0;
  const maxPerClass    = parseInt(appSettings.max_members_per_class) || 0;
  const maxClasses     = parseInt(appSettings.max_classes) || 0;
  const totalCapacity  = maxClasses * maxPerClass;
  const sessionsReq    = Math.ceil((totalSessions * thresholdPct) / 100);

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

  async function handleToggleRegistration() {
    setRegToggling(true);
    const newVal = !registrationOpen;
    await updateAppSetting("registration_open", String(newVal));
    setRegistrationOpen(newVal);
    setRegToggling(false);
  }

  async function handleSaveStartDate() {
    const d = classStartDate.trim();
    if (!d) { setStartDateError("Please select a date."); return; }
    const day = new Date(d + "T12:00:00Z").getUTCDay();
    if (day !== 0) { setStartDateError("Must be a Sunday."); return; }
    setStartDateError("");
    setStartDateSaving(true);
    await updateAppSetting("class_start_date", d);
    setStartDateSaving(false);
    setStartDateSaved(true);
    setTimeout(() => setStartDateSaved(false), 2500);
  }

  async function handleToggleTimeLock() {
    setTlEnabling(true);
    const newEnabled = !timeLockEnabled;
    await updateAppSetting("time_lock_enabled", String(newEnabled));
    setTimeLockEnabled(newEnabled);
    setTlEnabling(false);
  }

  async function handleAddTimeLock() {
    if (!tlForm.label.trim()) return;
    setTlSaving(true);
    const result = await createTimeLock({ ...tlForm, timezone: "Africa/Kigali" });
    if (result.success) {
      const updated = await getTimeLocks();
      setTimeLocks(updated);
      setAddTlOpen(false);
      setTlForm({ label: "Sunday Service", day_of_week: 0, start_time: "08:00", end_time: "12:00", is_active: true });
    }
    setTlSaving(false);
  }

  async function handleToggleLockActive(lock: TimeLock) {
    setTlBusyId(lock.id);
    await updateTimeLock(lock.id, { is_active: !lock.is_active });
    setTimeLocks((prev) => prev.map((l) => l.id === lock.id ? { ...l, is_active: !l.is_active } : l));
    setTlBusyId(null);
  }

  async function handleDeleteTimeLock(id: string) {
    setTlBusyId(id);
    await deleteTimeLock(id);
    setTimeLocks((prev) => prev.filter((l) => l.id !== id));
    setTlBusyId(null);
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
    if (result.success) {
      setEraseSuccess(true);
      setDangerStep(0);
      setConfirmInput("");
      refreshAuditLog();
      refreshTrash();
    }
    else setEraseError(result.error ?? "Something went wrong.");
  }

  function refreshAuditLog() {
    setAuditLogLoading(true);
    getAuditLog().then((log) => { setAuditLog(log); setAuditLogLoading(false); });
  }

  function refreshTrash() {
    setTrashLoading(true);
    getTrash().then((items) => { setTrashItems(items); setTrashLoading(false); });
  }

  async function handleRestoreItem(id: string) {
    setRestoringId(id);
    setTrashError("");
    const result = await restoreTrashItem(id);
    setRestoringId(null);
    if (result.success) { refreshTrash(); refreshAuditLog(); }
    else setTrashError(result.error ?? "Restore failed.");
  }

  async function handleRestoreBatch(batchId: string) {
    setRestoringBatch(batchId);
    setTrashError("");
    const result = await restoreTrashBatch(batchId);
    setRestoringBatch(null);
    if (result.success) { refreshTrash(); refreshAuditLog(); }
    else setTrashError(result.error ?? "Restore failed.");
  }

  const trashBatches = Object.values(
    trashItems.reduce((acc: Record<string, TrashEntry[]>, item) => {
      (acc[item.batch_id] ??= []).push(item);
      return acc;
    }, {})
  );

  async function openClassDangerZone() {
    setClassDangerOpen(true);
    setClassListLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("classes")
      .select("id, name, slot, members(count)")
      .eq("is_active", true)
      .order("name");
    setClassList((data ?? []).map((c: any) => ({ id: c.id, name: c.name, slot: c.slot, member_count: c.members?.[0]?.count ?? 0 })));
    setClassListLoading(false);
  }

  function toggleClassSelect(id: string) {
    setSelectedClassIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleClassSelectAll() {
    setSelectedClassIds((prev) => (prev.size === classList.length ? new Set() : new Set(classList.map((c) => c.id))));
  }

  async function handleDeleteSelectedClasses() {
    setClassDeleting(true);
    setClassDeleteError("");
    const result = await bulkDeleteClasses(Array.from(selectedClassIds));
    setClassDeleting(false);
    if (result.success) {
      setClassList((prev) => prev.filter((c) => !selectedClassIds.has(c.id)));
      setSelectedClassIds(new Set());
      setClassDeleteConfirm(false);
      refreshAuditLog();
      refreshTrash();
    } else {
      setClassDeleteError(result.error ?? "Something went wrong.");
    }
  }

  const affectedMemberCount = classList
    .filter((c) => selectedClassIds.has(c.id))
    .reduce((sum, c) => sum + c.member_count, 0);

  function describeLogEntry(entry: AuditLogEntry): string {
    const d = entry.details as any;
    if (entry.action === "delete_class") {
      return `Deleted "${d?.class_name ?? "a class"}" (${d?.slot ?? "?"}) — ${d?.members_unassigned ?? 0} member${d?.members_unassigned === 1 ? "" : "s"} unassigned`;
    }
    if (entry.action === "bulk_delete_classes") {
      const names = (d?.classes ?? []).map((c: any) => c.name).join(", ");
      return `Deleted ${d?.classes?.length ?? 0} classes (${names || "—"}) — ${d?.members_unassigned ?? 0} member${d?.members_unassigned === 1 ? "" : "s"} unassigned`;
    }
    if (entry.action === "erase_all_data") {
      return `Erased all data — ${d?.members_deleted ?? 0} members, ${d?.attendance_deleted ?? 0} attendance records deleted`;
    }
    return entry.action;
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
    const { error: verifyError } = await supabase.auth.signInWithPassword({ email: currentUserEmail, password: form.currentPassword });
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
            {currentUserEmail.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="font-bold">Administrator</p>
            <p className="text-sm" style={{ color: "rgba(248,240,230,0.55)" }}>{currentUserEmail}</p>
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
              <div className="pt-2 grid grid-cols-2 gap-3" style={{ borderTop: "1px solid rgba(228,148,12,0.1)" }}>
                <div className="p-3 rounded-lg" style={{ background: "rgba(228,148,12,0.06)", border: "1px solid rgba(228,148,12,0.15)" }}>
                  <p className="text-xs uppercase tracking-widest mb-0.5" style={{ fontFamily: "Barlow Condensed, sans-serif", color: "rgba(248,240,230,0.45)" }}>Total Capacity</p>
                  <p className="text-2xl font-extrabold" style={{ fontFamily: "Barlow Condensed, sans-serif", color: "var(--cla-amber)" }}>{totalCapacity}</p>
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

      {/* Registration Open/Close */}
      {isSuperAdmin && (
        <div className="rounded-xl overflow-hidden" style={cardStyle}>
          <div className="px-5 py-4 flex items-center justify-between gap-4" style={headerBorder}>
            <div>
              <h2 className="text-lg font-bold flex items-center gap-2" style={{ fontFamily: "Barlow Condensed, sans-serif" }}>
                <UserCheck size={18} style={{ color: "var(--cla-amber)" }} />
                Registration Form
              </h2>
              <p className="text-sm mt-0.5" style={{ color: "rgba(248,240,230,0.45)" }}>
                Manually open or close the public registration form. When closed, visitors can opt-in to the waitlist.
              </p>
            </div>
            <button
              onClick={handleToggleRegistration}
              disabled={regToggling}
              aria-label="Toggle registration"
              className="relative inline-flex shrink-0 rounded-full transition-colors"
              style={{
                width: 44, height: 24,
                background: registrationOpen ? "var(--cla-amber)" : "rgba(255,255,255,0.12)",
                opacity: regToggling ? 0.6 : 1,
                cursor: regToggling ? "not-allowed" : "pointer",
              }}
            >
              <span className="inline-block rounded-full transition-transform"
                style={{ width: 18, height: 18, margin: 3, transform: registrationOpen ? "translateX(20px)" : "translateX(0)", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.35)" }} />
            </button>
          </div>
          <div className="px-5 py-4">
            <div className="flex items-center gap-2 text-sm" style={{ color: registrationOpen ? "#C8D400" : "#ff6b6b" }}>
              <span className="font-bold">{registrationOpen ? "Open" : "Closed"}</span>
              <span style={{ color: "rgba(248,240,230,0.4)" }}>— {registrationOpen ? "New members can register" : "Registration is closed; visitors can join the waitlist"}</span>
            </div>
          </div>
        </div>
      )}

      {/* Class Start Date */}
      {isSuperAdmin && (
        <div className="rounded-xl overflow-hidden" style={cardStyle}>
          <div className="px-5 py-4" style={headerBorder}>
            <h2 className="text-lg font-bold flex items-center gap-2" style={{ fontFamily: "Barlow Condensed, sans-serif" }}>
              <Calendar size={18} style={{ color: "var(--cla-amber)" }} />
              Class Start Date
            </h2>
            <p className="text-sm mt-0.5" style={{ color: "rgba(248,240,230,0.45)" }}>
              The first Sunday of this discipleship cycle. Used to generate the attendance grid (one column per Sunday since this date).
            </p>
          </div>
          <div className="px-5 py-4 flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <input
                type="date"
                value={classStartDate}
                onChange={(e) => { setClassStartDate(e.target.value); setStartDateError(""); setStartDateSaved(false); }}
                className="cla-input"
                style={{ colorScheme: "dark", maxWidth: 200 }}
              />
              <button
                onClick={handleSaveStartDate}
                disabled={startDateSaving}
                className="px-4 py-2 rounded-lg text-sm font-bold transition-all"
                style={{ fontFamily: "Barlow Condensed, sans-serif", background: startDateSaved ? "rgba(200,212,0,0.1)" : "linear-gradient(135deg,#E89A10,#F8BA18)", color: startDateSaved ? "#C8D400" : "#200909" }}
              >
                {startDateSaving ? "Saving…" : startDateSaved ? "✓ Saved" : "Save"}
              </button>
            </div>
            {startDateError && <p className="text-xs" style={{ color: "#ff6b6b" }}>{startDateError}</p>}
            {classStartDate && !startDateError && (
              <p className="text-xs" style={{ color: "rgba(248,240,230,0.4)" }}>
                Attendance grid starts from {new Date(classStartDate + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Time Lock */}
      {isSuperAdmin && (
        <div className="rounded-xl overflow-hidden" style={cardStyle}>
          <div className="px-5 py-4 flex items-center justify-between gap-4" style={headerBorder}>
            <div>
              <h2 className="text-lg font-bold flex items-center gap-2" style={{ fontFamily: "Barlow Condensed, sans-serif" }}>
                <Lock size={18} style={{ color: "var(--cla-amber)" }} />
                Time Lock
              </h2>
              <p className="text-sm mt-0.5" style={{ color: "rgba(248,240,230,0.45)" }}>
                Restrict public forms to specific service hours only.
              </p>
            </div>
            {tlLoading ? (
              <div className="spinner shrink-0" style={{ width: 20, height: 20, borderTopColor: "var(--cla-amber)", borderColor: "rgba(228,148,12,0.2)" }} />
            ) : (
              <button
                onClick={handleToggleTimeLock}
                disabled={tlEnabling}
                aria-label="Toggle time lock"
                className="relative inline-flex shrink-0 rounded-full transition-colors"
                style={{
                  width: 44, height: 24,
                  background: timeLockEnabled ? "var(--cla-amber)" : "rgba(255,255,255,0.12)",
                  opacity: tlEnabling ? 0.6 : 1,
                  cursor: tlEnabling ? "not-allowed" : "pointer",
                }}
              >
                <span
                  className="inline-block rounded-full transition-transform"
                  style={{
                    width: 18, height: 18, margin: 3,
                    transform: timeLockEnabled ? "translateX(20px)" : "translateX(0)",
                    background: "#fff",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.35)",
                  }}
                />
              </button>
            )}
          </div>

          {!tlLoading && (
            <div className="p-5 flex flex-col gap-3">
              {timeLocks.length === 0 && !addTlOpen && (
                <p className="text-sm text-center py-2" style={{ color: "rgba(248,240,230,0.3)" }}>
                  No time windows configured yet.
                </p>
              )}

              {timeLocks.map((lock) => (
                <div key={lock.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)", opacity: lock.is_active ? 1 : 0.5 }}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold leading-tight truncate">{lock.label}</p>
                    <p className="text-xs mt-0.5" style={{ color: "rgba(248,240,230,0.45)" }}>
                      {DAY_NAMES[lock.day_of_week]} · {lock.start_time} – {lock.end_time}
                    </p>
                  </div>
                  <button
                    onClick={() => handleToggleLockActive(lock)}
                    disabled={tlBusyId === lock.id}
                    className="text-xs px-2 py-1 rounded font-bold shrink-0"
                    style={{
                      fontFamily: "Barlow Condensed, sans-serif",
                      background: lock.is_active ? "rgba(200,212,0,0.1)" : "rgba(255,255,255,0.06)",
                      color: lock.is_active ? "#C8D400" : "rgba(248,240,230,0.4)",
                      border: "1px solid",
                      borderColor: lock.is_active ? "rgba(200,212,0,0.3)" : "rgba(255,255,255,0.1)",
                    }}
                  >
                    {lock.is_active ? "On" : "Off"}
                  </button>
                  <button
                    onClick={() => handleDeleteTimeLock(lock.id)}
                    disabled={tlBusyId === lock.id}
                    className="p-1 rounded-lg shrink-0 transition-all"
                    style={{ color: "rgba(192,40,40,0.5)" }}
                    title="Delete window"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}

              {addTlOpen ? (
                <div className="flex flex-col gap-3 p-4 rounded-xl" style={{ background: "rgba(228,148,12,0.06)", border: "1px solid rgba(228,148,12,0.2)" }}>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <label className="text-xs font-bold block mb-1" style={{ fontFamily: "Barlow Condensed, sans-serif" }}>Label</label>
                      <input
                        type="text"
                        value={tlForm.label}
                        onChange={(e) => setTlForm((f) => ({ ...f, label: e.target.value }))}
                        className="cla-input text-sm"
                        placeholder="e.g. Sunday Service"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold block mb-1" style={{ fontFamily: "Barlow Condensed, sans-serif" }}>Day</label>
                      <select
                        value={tlForm.day_of_week}
                        onChange={(e) => setTlForm((f) => ({ ...f, day_of_week: parseInt(e.target.value) }))}
                        className="cla-input text-sm appearance-none"
                      >
                        {DAY_NAMES.map((d, i) => <option key={i} value={i}>{d}</option>)}
                      </select>
                    </div>
                    <div />
                    <div>
                      <label className="text-xs font-bold block mb-1" style={{ fontFamily: "Barlow Condensed, sans-serif" }}>Open at</label>
                      <input
                        type="time"
                        value={tlForm.start_time}
                        onChange={(e) => setTlForm((f) => ({ ...f, start_time: e.target.value }))}
                        className="cla-input text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold block mb-1" style={{ fontFamily: "Barlow Condensed, sans-serif" }}>Close at</label>
                      <input
                        type="time"
                        value={tlForm.end_time}
                        onChange={(e) => setTlForm((f) => ({ ...f, end_time: e.target.value }))}
                        className="cla-input text-sm"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2 mt-1">
                    <button
                      onClick={() => setAddTlOpen(false)}
                      className="flex-1 py-2 rounded-lg text-sm font-bold"
                      style={{ border: "1px solid rgba(255,255,255,0.1)", color: "rgba(248,240,230,0.5)" }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleAddTimeLock}
                      disabled={tlSaving || !tlForm.label.trim()}
                      className="flex-1 py-2 rounded-lg text-sm font-bold transition-all"
                      style={{ background: "linear-gradient(135deg, #E89A10, #F8BA18)", color: "#200909", opacity: tlSaving ? 0.7 : 1 }}
                    >
                      {tlSaving ? "Saving…" : "Save Window"}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setAddTlOpen(true)}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-bold self-start transition-all"
                  style={{ fontFamily: "Barlow Condensed, sans-serif", background: "rgba(228,148,12,0.08)", color: "var(--cla-amber)", border: "1px solid rgba(228,148,12,0.2)" }}
                >
                  <Plus size={14} /> Add Window
                </button>
              )}

              {!timeLockEnabled && timeLocks.length > 0 && (
                <p className="text-xs" style={{ color: "rgba(248,240,230,0.3)" }}>
                  Toggle is off — windows are configured but not enforced.
                </p>
              )}
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
                <p className="text-sm mt-0.5" style={{ color: "rgba(248,240,230,0.45)" }}>Deletes every registered member and all attendance records (moved to the Recycle Bin below for 15 days first). Classes and facilitators are not affected.</p>
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
                    <p className="text-sm mt-2 font-bold" style={{ color: "#ff4444" }}>Recoverable from the Recycle Bin below for 15 days — after that, it's gone for good.</p>
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

            <div style={{ borderTop: "1px solid rgba(192,40,40,0.25)" }} />

            {/* Delete Classes */}
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <p className="font-bold" style={{ color: "rgba(248,240,230,0.85)" }}>Delete Classes</p>
                <p className="text-sm mt-0.5" style={{ color: "rgba(248,240,230,0.45)" }}>
                  Permanently deletes one or more classes. Members in a deleted class are <strong>unassigned, not deleted</strong> — they can be reassigned to another class afterward.
                </p>
              </div>
              {!classDangerOpen && (
                <button onClick={openClassDangerZone} className="shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-sm transition-all"
                  style={{ fontFamily: "Barlow Condensed, sans-serif", background: "rgba(192,40,40,0.2)", color: "#ff4444", border: "1px solid rgba(192,40,40,0.5)" }}>
                  <ListChecks size={15} /> Manage Classes
                </button>
              )}
            </div>

            {classDangerOpen && (
              <div className="flex flex-col gap-3 p-4 rounded-xl" style={{ background: "rgba(192,40,40,0.1)", border: "1px solid rgba(192,40,40,0.35)" }}>
                {classListLoading ? (
                  <div className="flex items-center justify-center py-6">
                    <div className="spinner" style={{ width: 22, height: 22, borderTopColor: "#ff4444", borderColor: "rgba(192,40,40,0.2)" }} />
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <input type="checkbox" checked={classList.length > 0 && selectedClassIds.size === classList.length}
                        onChange={toggleClassSelectAll} style={{ accentColor: "#ff4444", cursor: "pointer" }} />
                      <span className="text-xs" style={{ color: "rgba(248,240,230,0.5)" }}>
                        {selectedClassIds.size > 0 ? `${selectedClassIds.size} selected` : "Select all"}
                      </span>
                      <button onClick={() => { setClassDangerOpen(false); setSelectedClassIds(new Set()); setClassDeleteConfirm(false); setClassDeleteError(""); }}
                        className="ml-auto text-xs px-2 py-1 rounded" style={{ color: "rgba(248,240,230,0.5)", border: "1px solid rgba(255,255,255,0.1)" }}>
                        Close
                      </button>
                    </div>

                    <div className="flex flex-col gap-1.5 max-h-64 overflow-y-auto pr-1">
                      {classList.length === 0 ? (
                        <p className="text-sm text-center py-4" style={{ color: "rgba(248,240,230,0.35)" }}>No active classes.</p>
                      ) : classList.map((c) => {
                        const checked = selectedClassIds.has(c.id);
                        return (
                          <label key={c.id} className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-all"
                            style={{ background: checked ? "rgba(192,40,40,0.15)" : "rgba(255,255,255,0.03)", border: `1px solid ${checked ? "rgba(192,40,40,0.4)" : "rgba(255,255,255,0.06)"}` }}>
                            <input type="checkbox" checked={checked} onChange={() => toggleClassSelect(c.id)} style={{ accentColor: "#ff4444", cursor: "pointer" }} />
                            <span className="flex-1 text-sm font-semibold">{c.name}</span>
                            <SlotBadge slot={c.slot} />
                            <span className="text-xs shrink-0" style={{ color: "rgba(248,240,230,0.45)" }}>{c.member_count} member{c.member_count !== 1 ? "s" : ""}</span>
                          </label>
                        );
                      })}
                    </div>

                    {selectedClassIds.size > 0 && !classDeleteConfirm && (
                      <button onClick={() => setClassDeleteConfirm(true)} className="self-start inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
                        style={{ background: "rgba(192,40,40,0.25)", color: "#ff6b6b", border: "1px solid rgba(192,40,40,0.4)" }}>
                        <Trash2 size={12} /> Delete {selectedClassIds.size} class{selectedClassIds.size !== 1 ? "es" : ""}
                      </button>
                    )}

                    {classDeleteConfirm && (
                      <div className="flex flex-col gap-3 p-3 rounded-lg" style={{ background: "rgba(192,40,40,0.15)", border: "1px solid rgba(192,40,40,0.4)" }}>
                        <p className="text-sm font-bold" style={{ color: "#ff4444" }}>
                          This deletes {selectedClassIds.size} class{selectedClassIds.size !== 1 ? "es" : ""}. {affectedMemberCount} member{affectedMemberCount !== 1 ? "s" : ""} will be unassigned (not deleted). Recoverable from the Recycle Bin below for 15 days.
                        </p>
                        <div className="flex gap-2">
                          <button onClick={() => setClassDeleteConfirm(false)} className="flex-1 py-2 rounded-lg text-sm font-bold" style={{ border: "1px solid rgba(255,255,255,0.15)", color: "rgba(248,240,230,0.6)" }}>Cancel</button>
                          <button onClick={handleDeleteSelectedClasses} disabled={classDeleting} className="flex-1 py-2 rounded-lg text-sm font-bold"
                            style={{ background: "#8b1a1a", color: "#fff", border: "1px solid rgba(192,40,40,0.5)" }}>
                            {classDeleting ? "Deleting…" : "Yes, delete"}
                          </button>
                        </div>
                      </div>
                    )}

                    {classDeleteError && <p className="text-sm" style={{ color: "#ff6b6b" }}>{classDeleteError}</p>}
                  </>
                )}
              </div>
            )}

            <div style={{ borderTop: "1px solid rgba(192,40,40,0.25)" }} />

            {/* Recycle Bin */}
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <p className="font-bold flex items-center gap-2" style={{ color: "rgba(248,240,230,0.85)" }}>
                  <Archive size={15} style={{ color: "#ff4444" }} /> Recycle Bin
                </p>
                <p className="text-sm mt-0.5" style={{ color: "rgba(248,240,230,0.45)" }}>
                  Deleted members, facilitators, classes, and attendance records land here for 15 days before being purged for good — restore anything, anytime before then.
                </p>
              </div>
              {trashItems.length > 0 && (
                <span className="shrink-0 px-2.5 py-1 rounded-lg text-xs font-bold" style={{ background: "rgba(192,40,40,0.15)", color: "#ff6b6b", border: "1px solid rgba(192,40,40,0.35)" }}>
                  {trashItems.length} item{trashItems.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>

            {trashLoading ? (
              <div className="flex items-center justify-center py-4">
                <div className="spinner" style={{ width: 20, height: 20, borderTopColor: "#ff4444", borderColor: "rgba(192,40,40,0.2)" }} />
              </div>
            ) : trashBatches.length === 0 ? (
              <p className="text-sm text-center py-3" style={{ color: "rgba(248,240,230,0.3)" }}>Recycle bin is empty.</p>
            ) : (
              <div className="flex flex-col gap-3 max-h-80 overflow-y-auto pr-1">
                {trashBatches.map((batch) => {
                  const first = batch[0];
                  return (
                    <div key={first.batch_id} className="p-3 rounded-lg" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
                      <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                        <div>
                          <p className="text-xs font-bold" style={{ color: "rgba(248,240,230,0.7)" }}>
                            {first.deleted_by ?? "Unknown admin"} · {new Date(first.deleted_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                          </p>
                          <p className="text-xs" style={{ color: "rgba(248,240,230,0.4)" }}>
                            Expires in {daysLeft(first.expires_at)} day{daysLeft(first.expires_at) !== 1 ? "s" : ""}
                          </p>
                        </div>
                        {batch.length > 1 && (
                          <button onClick={() => handleRestoreBatch(first.batch_id)} disabled={restoringBatch === first.batch_id}
                            className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg font-bold shrink-0"
                            style={{ background: "rgba(200,212,0,0.12)", color: "#C8D400", border: "1px solid rgba(200,212,0,0.3)" }}>
                            <RotateCcw size={12} /> {restoringBatch === first.batch_id ? "Restoring…" : `Restore all ${batch.length}`}
                          </button>
                        )}
                      </div>
                      <div className="flex flex-col gap-1.5">
                        {batch.map((item) => (
                          <div key={item.id} className="flex items-center justify-between gap-3 px-2.5 py-1.5 rounded" style={{ background: "rgba(255,255,255,0.03)" }}>
                            <span className="text-sm truncate" style={{ color: "rgba(248,240,230,0.8)" }}>
                              <span className="text-xs font-bold mr-1.5" style={{ color: "rgba(248,240,230,0.4)" }}>{TRASH_TABLE_LABELS[item.table_name]}</span>
                              {describeTrashItem(item)}
                            </span>
                            <button onClick={() => handleRestoreItem(item.id)} disabled={restoringId === item.id}
                              className="text-xs px-2 py-1 rounded font-bold shrink-0" style={{ background: "rgba(200,212,0,0.12)", color: "#C8D400", border: "1px solid rgba(200,212,0,0.3)" }}>
                              {restoringId === item.id ? "…" : "Restore"}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {trashError && <p className="text-sm" style={{ color: "#ff6b6b" }}>{trashError}</p>}

            <div style={{ borderTop: "1px solid rgba(192,40,40,0.25)" }} />

            {/* Recent Danger Zone Activity */}
            <div>
              <p className="font-bold flex items-center gap-2" style={{ color: "rgba(248,240,230,0.85)" }}>
                <ScrollText size={15} style={{ color: "#ff4444" }} /> Recent Activity
              </p>
              <p className="text-sm mt-0.5" style={{ color: "rgba(248,240,230,0.45)" }}>
                Who deleted or erased what, and when. Logged automatically for every Danger Zone action.
              </p>
            </div>
            {auditLogLoading ? (
              <div className="flex items-center justify-center py-4">
                <div className="spinner" style={{ width: 20, height: 20, borderTopColor: "#ff4444", borderColor: "rgba(192,40,40,0.2)" }} />
              </div>
            ) : auditLog.length === 0 ? (
              <p className="text-sm text-center py-3" style={{ color: "rgba(248,240,230,0.3)" }}>No Danger Zone actions recorded yet.</p>
            ) : (
              <div className="flex flex-col gap-2 max-h-64 overflow-y-auto pr-1">
                {auditLog.map((entry) => (
                  <div key={entry.id} className="px-3 py-2.5 rounded-lg text-sm" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                    <p style={{ color: "rgba(248,240,230,0.8)" }}>{describeLogEntry(entry)}</p>
                    <p className="text-xs mt-1" style={{ color: "rgba(248,240,230,0.4)" }}>
                      {entry.actor_email ?? "Unknown admin"} · {new Date(entry.created_at).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

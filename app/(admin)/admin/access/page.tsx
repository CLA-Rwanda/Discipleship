"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, ShieldCheck, Lock, Mail, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { RoleBadge, Badge } from "@/components/ui/Badge";
import {
  listAdminUsers,
  inviteAdminUser,
  revokeAdminUser,
  type AdminUserRow,
} from "@/actions/access";
import { ADMIN_EMAIL } from "@/lib/config";
import type { AdminRole } from "@/lib/types";
import { createClient } from "@/lib/supabase";

const ROLES: Exclude<AdminRole, "super_admin">[] = ["admin", "facilitator", "intern"];

const ROLE_LABELS: Record<AdminRole, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  facilitator: "Facilitator",
  intern: "Intern (Read-only)",
};

const ROLE_DESCRIPTIONS: Record<AdminRole, string> = {
  super_admin: "Full access — seeded once, protected at DB level, cannot be removed",
  admin: "Manage classes, members, and resources",
  facilitator: "View own class roster, mark attendance",
  intern: "Read-only dashboard access",
};

export default function AccessPage() {
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ email: "", role: "facilitator" as AdminRole });
  const [saving, setSaving] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [actionError, setActionError] = useState("");
  const [actionSuccess, setActionSuccess] = useState("");

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    const rows = await listAdminUsers();
    setUsers(rows);
    setLoading(false);
  }, []);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      setIsSuperAdmin(user?.email === ADMIN_EMAIL);
    });
    fetchUsers();
  }, [fetchUsers]);

  function validate() {
    const e: Record<string, string> = {};
    if (!form.email.trim() || !form.email.includes("@"))
      e.email = "A valid email is required";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleInvite() {
    if (!validate()) return;
    setSaving(true);
    setActionError("");
    setActionSuccess("");

    const result = await inviteAdminUser(form.email.trim().toLowerCase(), form.role);
    setSaving(false);

    if (result.success) {
      setActionSuccess(
        `Invite sent to ${form.email}. They'll receive a sign-in link and will be granted the ${ROLE_LABELS[form.role]} role automatically.`
      );
      setModalOpen(false);
      setForm({ email: "", role: "facilitator" });
      fetchUsers();
    } else {
      setActionError(result.error ?? "Something went wrong.");
    }
  }

  async function handleRevoke(userId: string, email: string) {
    if (!confirm(`Revoke access for ${email}? This cannot be undone.`)) return;
    setRevoking(userId);
    setActionError("");
    setActionSuccess("");

    const result = await revokeAdminUser(userId);
    setRevoking(null);

    if (result.success) {
      setActionSuccess(`Access revoked for ${email}.`);
      fetchUsers();
    } else {
      setActionError(result.error ?? "Failed to revoke. If this is the super admin, the database will block it.");
    }
  }

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1
            className="text-3xl font-extrabold"
            style={{ fontFamily: "Barlow Condensed, sans-serif" }}
          >
            Access Control
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "rgba(248,240,230,0.5)" }}>
            Manage who can access the admin console
          </p>
        </div>
        {isSuperAdmin && (
          <Button
            variant="primary"
            size="sm"
            onClick={() => { setActionError(""); setActionSuccess(""); setModalOpen(true); }}
          >
            <Plus size={16} />
            Invite Admin
          </Button>
        )}
      </div>

      {/* Feedback banners */}
      {actionSuccess && (
        <div
          className="p-4 rounded-xl text-sm flex items-start gap-2"
          style={{ background: "rgba(107,122,0,0.12)", border: "1px solid rgba(200,212,0,0.3)", color: "#c8d400" }}
        >
          <Mail size={16} className="shrink-0 mt-0.5" />
          {actionSuccess}
        </div>
      )}
      {actionError && (
        <div className="p-4 rounded-xl text-sm" style={{ background: "rgba(139,26,26,0.15)", border: "1px solid rgba(139,26,26,0.3)", color: "#ff6b6b" }}>
          {actionError}
        </div>
      )}

      {/* Role legend */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {(["super_admin", "admin", "facilitator", "intern"] as AdminRole[]).map((role) => (
          <div
            key={role}
            className="rounded-xl p-4 relative"
            style={{ background: "var(--cla-bg-card)", border: "1px solid rgba(228,148,12,0.12)" }}
          >
            {role === "super_admin" && (
              <Lock size={12} className="absolute top-3 right-3" style={{ color: "rgba(228,148,12,0.5)" }} />
            )}
            <div className="mb-2"><RoleBadge role={role} /></div>
            <p className="text-xs" style={{ color: "rgba(248,240,230,0.5)" }}>
              {ROLE_DESCRIPTIONS[role]}
            </p>
          </div>
        ))}
      </div>

      {/* DB protection notice */}
      <div
        className="flex items-start gap-3 p-4 rounded-xl text-sm"
        style={{ background: "rgba(91,45,142,0.08)", border: "1px solid rgba(91,45,142,0.2)" }}
      >
        <ShieldCheck size={18} style={{ color: "#b47fea", flexShrink: 0, marginTop: 1 }} />
        <div style={{ color: "rgba(248,240,230,0.65)" }}>
          <strong style={{ color: "#b47fea" }}>Database-level protection active.</strong>{" "}
          The super admin role is guarded by a Postgres trigger — it cannot be deleted or
          downgraded by any API call, UI action, or direct SQL query.
        </div>
      </div>

      {/* Users table */}
      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="spinner" style={{ width: 28, height: 28, borderTopColor: "var(--cla-amber)", borderColor: "rgba(228,148,12,0.2)" }} />
        </div>
      ) : (
        <div
          className="rounded-xl overflow-hidden"
          style={{ background: "var(--cla-bg-card)", border: "1px solid rgba(228,148,12,0.15)" }}
        >
          <div
            className="flex items-center justify-between px-5 py-3"
            style={{ borderBottom: "1px solid rgba(228,148,12,0.1)" }}
          >
            <p
              className="text-sm font-bold"
              style={{ fontFamily: "Barlow Condensed, sans-serif", color: "rgba(248,240,230,0.6)" }}
            >
              {users.length} admin {users.length === 1 ? "user" : "users"}
            </p>
            <button
              onClick={fetchUsers}
              className="p-1.5 rounded-lg transition-colors"
              style={{ color: "rgba(248,240,230,0.35)" }}
              title="Refresh"
            >
              <RefreshCw size={14} />
            </button>
          </div>

          <div className="overflow-x-auto">
          <table className="cla-table" style={{ minWidth: "500px" }}>
            <thead>
              <tr>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Granted</th>
                {isSuperAdmin && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-12" style={{ color: "rgba(248,240,230,0.35)" }}>
                    No admin users found.
                  </td>
                </tr>
              ) : (
                users.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <div className="flex items-center gap-2">
                        <div
                          className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                          style={{
                            fontFamily: "Barlow Condensed, sans-serif",
                            background: u.isSuperAdmin ? "rgba(91,45,142,0.2)" : "rgba(228,148,12,0.12)",
                            color: u.isSuperAdmin ? "#b47fea" : "var(--cla-amber)",
                          }}
                        >
                          {u.email.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-sm">{u.email}</span>
                        {u.isSuperAdmin && (
                          <Lock size={11} style={{ color: "rgba(228,148,12,0.45)", flexShrink: 0 }} aria-label="DB-protected" />
                        )}
                      </div>
                    </td>
                    <td><RoleBadge role={u.role} /></td>
                    <td>
                      <Badge variant={u.status === "active" ? "green" : "gray"}>
                        {u.status === "active" ? "Active" : "Invite Pending"}
                      </Badge>
                    </td>
                    <td className="text-sm" style={{ color: "rgba(248,240,230,0.5)" }}>
                      {new Date(u.granted_at).toLocaleDateString("en-GB", {
                        day: "numeric", month: "short", year: "numeric",
                      })}
                    </td>
                    {isSuperAdmin && (
                      <td>
                        {u.isSuperAdmin ? (
                          <span className="text-xs" style={{ color: "rgba(248,240,230,0.25)" }}>Protected</span>
                        ) : (
                          <button
                            onClick={() => handleRevoke(u.id, u.email)}
                            disabled={revoking === u.id}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all"
                            style={{
                              fontFamily: "Barlow Condensed, sans-serif",
                              background: "rgba(139,26,26,0.12)",
                              color: "#ff6b6b",
                              border: "1px solid rgba(139,26,26,0.25)",
                              opacity: revoking === u.id ? 0.5 : 1,
                            }}
                          >
                            {revoking === u.id
                              ? <span className="spinner" style={{ width: 10, height: 10, borderWidth: 1.5 }} />
                              : <Trash2 size={12} />
                            }
                            Revoke
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {/* Invite modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Invite Admin User">
        <div className="flex flex-col gap-4">
          <div
            className="flex items-start gap-3 p-3 rounded-lg text-sm"
            style={{ background: "rgba(228,148,12,0.06)", border: "1px solid rgba(228,148,12,0.15)", color: "rgba(248,240,230,0.65)" }}
          >
            <Mail size={16} style={{ color: "var(--cla-amber)", flexShrink: 0, marginTop: 1 }} />
            They'll receive an email with a sign-in link. Their role is assigned automatically the moment they accept — no manual step needed.
          </div>

          <Input
            label="Email Address"
            type="email"
            placeholder="facilitator@claonline.org"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            error={errors.email}
          />

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-semibold" style={{ fontFamily: "Barlow Condensed, sans-serif" }}>
              Role
            </label>
            <select
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as AdminRole }))}
              className="cla-input"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>{ROLE_LABELS[r]}</option>
              ))}
            </select>
            <p className="text-xs" style={{ color: "rgba(248,240,230,0.4)" }}>
              {ROLE_DESCRIPTIONS[form.role]}
            </p>
          </div>

          {actionError && (
            <div className="p-3 rounded-lg text-sm" style={{ background: "rgba(139,26,26,0.15)", border: "1px solid rgba(139,26,26,0.3)", color: "#ff6b6b" }}>
              {actionError}
            </div>
          )}

          <div className="flex gap-3 mt-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)} className="flex-1">Cancel</Button>
            <Button variant="primary" loading={saving} onClick={handleInvite} className="flex-1">
              <Mail size={16} />
              Send Invite
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

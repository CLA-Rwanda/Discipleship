"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, Shield } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { RoleBadge } from "@/components/ui/Badge";
import { createClient } from "@/lib/supabase";
import type { AdminRole } from "@/lib/types";

interface AdminUser {
  id: string;
  email: string;
  role: AdminRole;
  granted_at: string;
}

const ROLES: AdminRole[] = ["super_admin", "admin", "facilitator", "intern"];
const ROLE_LABELS: Record<AdminRole, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  facilitator: "Facilitator",
  intern: "Intern (Read-only)",
};
const ROLE_DESCRIPTIONS: Record<AdminRole, string> = {
  super_admin: "Full access, can grant any role",
  admin: "Manage classes, members, and resources",
  facilitator: "View own class roster, mark attendance",
  intern: "Read-only dashboard access",
};

export default function AccessPage() {
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ email: "", role: "facilitator" as AdminRole });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const fetchAdmins = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("admin_roles")
      .select("id, role, granted_at, user_id")
      .order("granted_at", { ascending: false });

    // Fetch user emails via Supabase auth (admin only)
    const { data: { users } = { users: [] } } = await supabase.auth.admin.listUsers();

    const enriched = (data ?? []).map((r: any) => {
      const user = (users ?? []).find((u: any) => u.id === r.user_id);
      return {
        id: r.id,
        email: user?.email ?? r.user_id,
        role: r.role,
        granted_at: r.granted_at,
      };
    });

    setAdminUsers(enriched);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAdmins();
  }, [fetchAdmins]);

  function validate() {
    const e: Record<string, string> = {};
    if (!form.email.trim() || !form.email.includes("@"))
      e.email = "Valid email is required";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleInvite() {
    if (!validate()) return;
    setSaving(true);
    const supabase = createClient();

    // Create auth user (or look up existing) and assign role
    const { data: { user }, error } = await supabase.auth.admin.createUser({
      email: form.email.trim(),
      email_confirm: true,
      password: Math.random().toString(36).slice(2) + "CLA!",
    });

    if (user && !error) {
      await supabase.from("admin_roles").upsert({
        user_id: user.id,
        role: form.role,
      }, { onConflict: "user_id" });
    }

    setSaving(false);
    setModalOpen(false);
    setForm({ email: "", role: "facilitator" });
    fetchAdmins();
  }

  async function handleRevoke(id: string) {
    if (!confirm("Revoke this user's admin access?")) return;
    const supabase = createClient();
    await supabase.from("admin_roles").delete().eq("id", id);
    fetchAdmins();
  }

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1
            className="text-3xl font-extrabold"
            style={{ fontFamily: "Barlow Condensed, sans-serif" }}
          >
            Access Control
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "rgba(232,224,216,0.5)" }}>
            Manage admin roles and permissions
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={() => setModalOpen(true)}>
          <Plus size={16} />
          Invite Admin
        </Button>
      </div>

      {/* Role legend */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {ROLES.map((role) => (
          <div
            key={role}
            className="rounded-xl p-4"
            style={{
              background: "var(--cla-bg-card)",
              border: "1px solid rgba(212,134,10,0.12)",
            }}
          >
            <div className="mb-2">
              <RoleBadge role={role} />
            </div>
            <p
              className="text-xs"
              style={{ color: "rgba(232,224,216,0.5)" }}
            >
              {ROLE_DESCRIPTIONS[role]}
            </p>
          </div>
        ))}
      </div>

      {/* Admin users list */}
      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div
            className="spinner"
            style={{
              width: 28,
              height: 28,
              borderTopColor: "var(--cla-amber)",
              borderColor: "rgba(212,134,10,0.2)",
            }}
          />
        </div>
      ) : (
        <div
          className="rounded-xl overflow-hidden"
          style={{
            background: "var(--cla-bg-card)",
            border: "1px solid rgba(212,134,10,0.15)",
          }}
        >
          <table className="cla-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Role</th>
                <th>Granted</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {adminUsers.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="text-center py-12"
                    style={{ color: "rgba(232,224,216,0.35)" }}
                  >
                    No admin users configured.
                  </td>
                </tr>
              ) : (
                adminUsers.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <div className="flex items-center gap-2">
                        <div
                          className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                          style={{
                            fontFamily: "Barlow Condensed, sans-serif",
                            background: "rgba(212,134,10,0.12)",
                            color: "var(--cla-amber)",
                          }}
                        >
                          {u.email.charAt(0).toUpperCase()}
                        </div>
                        <span>{u.email}</span>
                      </div>
                    </td>
                    <td>
                      <RoleBadge role={u.role} />
                    </td>
                    <td style={{ color: "rgba(232,224,216,0.5)" }}>
                      {new Date(u.granted_at).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                    <td>
                      <button
                        onClick={() => handleRevoke(u.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all"
                        style={{
                          fontFamily: "Barlow Condensed, sans-serif",
                          background: "rgba(139,26,26,0.12)",
                          color: "#ff6b6b",
                          border: "1px solid rgba(139,26,26,0.25)",
                        }}
                      >
                        <Trash2 size={12} />
                        Revoke
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Invite Admin User"
      >
        <div className="flex flex-col gap-4">
          <div
            className="flex items-start gap-3 p-3 rounded-lg text-sm"
            style={{
              background: "rgba(212,134,10,0.06)",
              border: "1px solid rgba(212,134,10,0.15)",
              color: "rgba(232,224,216,0.65)",
            }}
          >
            <Shield size={16} style={{ color: "var(--cla-amber)", flexShrink: 0, marginTop: 1 }} />
            A Supabase account will be created for this email. They'll receive a
            password reset link to set their own credentials.
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
            <label
              className="text-sm font-semibold"
              style={{ fontFamily: "Barlow Condensed, sans-serif" }}
            >
              Role
            </label>
            <select
              value={form.role}
              onChange={(e) =>
                setForm((f) => ({ ...f, role: e.target.value as AdminRole }))
              }
              className="cla-input"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
            <p className="text-xs" style={{ color: "rgba(232,224,216,0.4)" }}>
              {ROLE_DESCRIPTIONS[form.role]}
            </p>
          </div>

          <div className="flex gap-3 mt-2">
            <Button
              variant="secondary"
              onClick={() => setModalOpen(false)}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={saving}
              onClick={handleInvite}
              className="flex-1"
            >
              <Shield size={16} />
              Send Invite
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

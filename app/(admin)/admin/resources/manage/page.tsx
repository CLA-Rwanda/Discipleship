"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, Edit2, Eye, EyeOff, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { createClient } from "@/lib/supabase";
import type { Resource } from "@/lib/types";

const CATEGORIES = [
  "Bible Study",
  "Sermon Notes",
  "Forms",
  "Media",
  "Announcements",
];

const EMPTY_FORM = {
  title: "",
  description: "",
  category: CATEGORIES[0],
  url: "",
  is_published: true,
};

export default function ManageResourcesPage() {
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Resource | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const fetchResources = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("resources")
      .select("*")
      .order("created_at", { ascending: false });
    setResources(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchResources();
  }, [fetchResources]);

  function openAdd() {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setErrors({});
    setModalOpen(true);
  }

  function openEdit(r: Resource) {
    setEditTarget(r);
    setForm({
      title: r.title,
      description: r.description ?? "",
      category: r.category,
      url: r.url ?? "",
      is_published: r.is_published,
    });
    setErrors({});
    setModalOpen(true);
  }

  function validate() {
    const e: Record<string, string> = {};
    if (!form.title.trim()) e.title = "Title is required";
    if (!form.url.trim()) e.url = "URL is required";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSave() {
    if (!validate()) return;
    setSaving(true);
    const supabase = createClient();

    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      category: form.category,
      url: form.url.trim() || null,
      is_published: form.is_published,
    };

    if (editTarget) {
      await supabase.from("resources").update(payload).eq("id", editTarget.id);
    } else {
      await supabase.from("resources").insert(payload);
    }

    setSaving(false);
    setModalOpen(false);
    fetchResources();
  }

  async function togglePublish(r: Resource) {
    const supabase = createClient();
    await supabase
      .from("resources")
      .update({ is_published: !r.is_published })
      .eq("id", r.id);
    fetchResources();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this resource? This cannot be undone.")) return;
    const supabase = createClient();
    await supabase.from("resources").delete().eq("id", id);
    fetchResources();
  }

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1
            className="text-3xl font-extrabold"
            style={{ fontFamily: "Barlow Condensed, sans-serif" }}
          >
            Resources
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "rgba(232,224,216,0.5)" }}>
            Manage public church resources
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={openAdd}>
          <Plus size={16} />
          Add Resource
        </Button>
      </div>

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
                <th>Title</th>
                <th>Category</th>
                <th>Link</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {resources.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="text-center py-12"
                    style={{ color: "rgba(232,224,216,0.35)" }}
                  >
                    No resources yet.
                  </td>
                </tr>
              ) : (
                resources.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <p className="font-semibold">{r.title}</p>
                      {r.description && (
                        <p
                          className="text-xs mt-0.5 line-clamp-1"
                          style={{ color: "rgba(232,224,216,0.45)" }}
                        >
                          {r.description}
                        </p>
                      )}
                    </td>
                    <td>
                      <Badge variant="amber">{r.category}</Badge>
                    </td>
                    <td>
                      {r.url ? (
                        <a
                          href={r.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs hover:underline"
                          style={{ color: "var(--cla-amber)" }}
                        >
                          <ExternalLink size={12} />
                          Open
                        </a>
                      ) : (
                        <span style={{ color: "rgba(232,224,216,0.25)" }}>—</span>
                      )}
                    </td>
                    <td>
                      <Badge variant={r.is_published ? "green" : "gray"}>
                        {r.is_published ? "Published" : "Draft"}
                      </Badge>
                    </td>
                    <td>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => togglePublish(r)}
                          className="p-1.5 rounded-lg transition-all"
                          style={{ color: "rgba(232,224,216,0.45)" }}
                          title={r.is_published ? "Unpublish" : "Publish"}
                        >
                          {r.is_published ? (
                            <EyeOff size={15} />
                          ) : (
                            <Eye size={15} />
                          )}
                        </button>
                        <button
                          onClick={() => openEdit(r)}
                          className="p-1.5 rounded-lg transition-all"
                          style={{ color: "rgba(232,224,216,0.45)" }}
                          title="Edit"
                        >
                          <Edit2 size={15} />
                        </button>
                        <button
                          onClick={() => handleDelete(r.id)}
                          className="p-1.5 rounded-lg transition-all"
                          style={{ color: "rgba(139,26,26,0.7)" }}
                          title="Delete"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
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
        title={editTarget ? "Edit Resource" : "Add Resource"}
      >
        <div className="flex flex-col gap-4">
          <Input
            label="Title"
            placeholder="e.g. May Sermon Notes"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            error={errors.title}
          />

          <div className="flex flex-col gap-1.5">
            <label
              className="text-sm font-semibold"
              style={{ fontFamily: "Barlow Condensed, sans-serif" }}
            >
              Description (Optional)
            </label>
            <textarea
              value={form.description}
              onChange={(e) =>
                setForm((f) => ({ ...f, description: e.target.value }))
              }
              rows={3}
              placeholder="Brief description of this resource…"
              className="cla-input resize-none"
              style={{ lineHeight: 1.5 }}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              className="text-sm font-semibold"
              style={{ fontFamily: "Barlow Condensed, sans-serif" }}
            >
              Category
            </label>
            <select
              value={form.category}
              onChange={(e) =>
                setForm((f) => ({ ...f, category: e.target.value }))
              }
              className="cla-input"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <Input
            label="URL"
            type="url"
            placeholder="https://drive.google.com/…"
            value={form.url}
            onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
            error={errors.url}
            hint="Link to the resource (Google Drive, YouTube, PDF, etc.)"
          />

          <label className="flex items-center gap-3 cursor-pointer">
            <div
              onClick={() =>
                setForm((f) => ({ ...f, is_published: !f.is_published }))
              }
              className="w-11 h-6 rounded-full transition-all relative cursor-pointer"
              style={{
                background: form.is_published
                  ? "var(--cla-amber)"
                  : "rgba(255,255,255,0.1)",
              }}
            >
              <div
                className="w-5 h-5 rounded-full absolute top-0.5 transition-all"
                style={{
                  background: "white",
                  left: form.is_published ? "calc(100% - 1.35rem)" : "2px",
                }}
              />
            </div>
            <span className="text-sm font-semibold" style={{ fontFamily: "Barlow Condensed" }}>
              {form.is_published ? "Published (visible to public)" : "Draft (hidden)"}
            </span>
          </label>

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
              onClick={handleSave}
              className="flex-1"
            >
              {editTarget ? "Save Changes" : "Add Resource"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

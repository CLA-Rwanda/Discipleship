"use client";

import { useState, useEffect } from "react";
import {
  Search,
  BookOpen,
  FileText,
  Mic2,
  Film,
  ExternalLink,
  Download,
  Layers,
} from "lucide-react";
import { CLALogo } from "@/components/ui/CLALogo";
import { Badge } from "@/components/ui/Badge";
import { createClient } from "@/lib/supabase";
import type { Resource } from "@/lib/types";

const CATEGORIES = [
  { label: "All", value: "all", icon: Layers },
  { label: "Bible Study", value: "Bible Study", icon: BookOpen },
  { label: "Sermon Notes", value: "Sermon Notes", icon: FileText },
  { label: "Forms", value: "Forms", icon: FileText },
  { label: "Media", value: "Media", icon: Film },
  { label: "Announcements", value: "Announcements", icon: Mic2 },
];

function ResourceIcon({ category }: { category: string }) {
  const map: Record<string, React.ElementType> = {
    "Bible Study": BookOpen,
    "Sermon Notes": FileText,
    Forms: FileText,
    Media: Film,
    Announcements: Mic2,
  };
  const Icon = map[category] ?? Layers;
  return <Icon size={22} style={{ color: "var(--cla-amber)" }} />;
}

export default function ResourcesPage() {
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("resources")
      .select("*")
      .eq("is_published", true)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setResources(data ?? []);
        setLoading(false);
      });
  }, []);

  const filtered = resources.filter((r) => {
    const matchesSearch =
      search === "" ||
      r.title.toLowerCase().includes(search.toLowerCase()) ||
      (r.description ?? "").toLowerCase().includes(search.toLowerCase());
    const matchesCat =
      activeCategory === "all" || r.category === activeCategory;
    return matchesSearch && matchesCat;
  });

  return (
    <div
      className="min-h-dvh flex flex-col"
      style={{ background: "var(--cla-bg-dark)" }}
    >
      {/* Hero */}
      <div
        className="grain-overlay relative overflow-hidden"
        style={{
          background:
            "linear-gradient(135deg, #1A0505 0%, #2E0A0A 50%, #4A0A0A 100%)",
          paddingTop: "env(safe-area-inset-top)",
        }}
      >
        <div className="relative z-10 flex flex-col items-center gap-3 px-6 py-8 text-center">
          <CLALogo size="md" />
          <div>
            <h1
              className="text-3xl font-extrabold"
              style={{ fontFamily: "Barlow Condensed, sans-serif" }}
            >
              Church <span className="text-amber-gradient">Resources</span>
            </h1>
            <p className="mt-1 text-sm" style={{ color: "rgba(232,224,216,0.6)" }}>
              Bible studies, sermon notes, forms & more
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 px-4 py-6 max-w-2xl mx-auto w-full">
        {/* Search */}
        <div className="relative mb-4">
          <Search
            size={18}
            className="absolute left-3 top-1/2 -translate-y-1/2"
            style={{ color: "rgba(232,224,216,0.4)" }}
          />
          <input
            type="text"
            placeholder="Search resources…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="cla-input pl-10"
          />
        </div>

        {/* Category tabs */}
        <div className="flex gap-2 overflow-x-auto pb-2 mb-6 scrollbar-none">
          {CATEGORIES.map((cat) => {
            const isActive = activeCategory === cat.value;
            return (
              <button
                key={cat.value}
                onClick={() => setActiveCategory(cat.value)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold whitespace-nowrap transition-all shrink-0"
                style={{
                  fontFamily: "Barlow Condensed, sans-serif",
                  background: isActive
                    ? "linear-gradient(135deg, #D4860A, #F0A500)"
                    : "rgba(255,255,255,0.05)",
                  color: isActive ? "#1A0505" : "rgba(232,224,216,0.7)",
                  border: isActive
                    ? "none"
                    : "1px solid rgba(212,134,10,0.2)",
                }}
              >
                <cat.icon size={14} />
                {cat.label}
              </button>
            );
          })}
        </div>

        {/* Resources grid */}
        {loading ? (
          <div className="flex flex-col gap-4">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="cla-card p-5 animate-pulse"
                style={{ height: "96px" }}
              />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <p
              className="text-lg font-bold mb-2"
              style={{ fontFamily: "Barlow Condensed, sans-serif" }}
            >
              No resources found
            </p>
            <p className="text-sm" style={{ color: "rgba(232,224,216,0.45)" }}>
              Try a different search term or category
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {filtered.map((resource) => (
              <div
                key={resource.id}
                className="cla-card p-5 flex items-start gap-4 hover:shadow-amber transition-shadow"
              >
                <div
                  className="p-2.5 rounded-xl shrink-0 mt-0.5"
                  style={{ background: "rgba(212,134,10,0.1)" }}
                >
                  <ResourceIcon category={resource.category} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <h3
                      className="font-bold text-base leading-tight"
                      style={{
                        fontFamily: "Barlow Condensed, sans-serif",
                        color: "var(--cla-white)",
                      }}
                    >
                      {resource.title}
                    </h3>
                    <Badge variant="amber">{resource.category}</Badge>
                  </div>

                  {resource.description && (
                    <p
                      className="text-sm mt-1 line-clamp-2"
                      style={{ color: "rgba(232,224,216,0.6)" }}
                    >
                      {resource.description}
                    </p>
                  )}

                  <div className="flex gap-2 mt-3">
                    {resource.url && (
                      <a
                        href={resource.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold transition-all"
                        style={{
                          fontFamily: "Barlow Condensed, sans-serif",
                          background: "linear-gradient(135deg, #D4860A, #F0A500)",
                          color: "#1A0505",
                        }}
                      >
                        <ExternalLink size={14} />
                        Open
                      </a>
                    )}
                    {resource.file_path && (
                      <a
                        href={resource.file_path}
                        download
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold border transition-all"
                        style={{
                          fontFamily: "Barlow Condensed, sans-serif",
                          borderColor: "rgba(212,134,10,0.4)",
                          color: "var(--cla-amber)",
                        }}
                      >
                        <Download size={14} />
                        Download
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

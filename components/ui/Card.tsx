interface CardProps {
  children: React.ReactNode;
  className?: string;
  padding?: "none" | "sm" | "md" | "lg";
}

export function Card({ children, className = "", padding = "md" }: CardProps) {
  const pads = { none: "", sm: "p-4", md: "p-6", lg: "p-8" };
  return (
    <div className={`cla-card ${pads[padding]} ${className}`}>{children}</div>
  );
}

export function StatCard({
  label,
  value,
  sub,
  icon,
  accent,
  onClick,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon?: React.ReactNode;
  accent?: "amber" | "green" | "red" | "purple";
  onClick?: () => void;
}) {
  const accents = {
    amber: "border-l-cla-amber",
    green: "border-l-cla-logo-yellow",
    red: "border-l-cla-logo-wine",
    purple: "border-l-cla-logo-purple",
  };

  return (
    <div
      className={`stat-card border-l-4 ${accents[accent ?? "amber"]}`}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } } : undefined}
      style={onClick ? { cursor: "pointer" } : undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p
            className="text-xs font-bold uppercase tracking-widest mb-1"
            style={{
              fontFamily: "Barlow Condensed, sans-serif",
              color: "rgba(248,240,230,0.55)",
            }}
          >
            {label}
          </p>
          <p
            className="text-3xl font-bold"
            style={{
              fontFamily: "Barlow Condensed, sans-serif",
              color: "var(--cla-amber-light)",
            }}
          >
            {value}
          </p>
          {sub && (
            <p className="text-xs mt-1" style={{ color: "rgba(248,240,230,0.5)" }}>
              {sub}
            </p>
          )}
        </div>
        {icon && (
          <div
            className="p-2.5 rounded-lg shrink-0"
            style={{ background: "rgba(228,148,12,0.1)" }}
          >
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}

interface FillBarProps {
  value: number;
  max: number;
  showLabel?: boolean;
}

export function FillBar({ value, max, showLabel = false }: FillBarProps) {
  const pct = Math.min((value / max) * 100, 100);
  const color =
    pct >= 100
      ? "#ff4444"
      : pct >= 80
      ? "var(--cla-amber)"
      : "var(--cla-logo-yellow)";

  return (
    <div className="flex items-center gap-2 w-full">
      <div className="fill-bar flex-1">
        <div
          className="fill-bar-inner"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      {showLabel && (
        <span
          className="text-xs font-mono shrink-0"
          style={{ color: "rgba(248,240,230,0.5)", minWidth: "3.5rem", textAlign: "right" }}
        >
          {value}/{max}
        </span>
      )}
    </div>
  );
}

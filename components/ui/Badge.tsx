type BadgeVariant = "amber" | "red" | "green" | "purple" | "blue" | "gray";

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
}

export function Badge({ children, variant = "amber", className = "" }: BadgeProps) {
  return (
    <span className={`badge badge-${variant} ${className}`}>{children}</span>
  );
}

export function RoleBadge({ role }: { role: string }) {
  const map: Record<string, BadgeVariant> = {
    super_admin: "purple",
    admin: "amber",
    facilitator: "green",
    intern: "gray",
  };
  const labels: Record<string, string> = {
    super_admin: "Super Admin",
    admin: "Admin",
    facilitator: "Facilitator",
    intern: "Intern",
  };
  return <Badge variant={map[role] ?? "gray"}>{labels[role] ?? role}</Badge>;
}

export function SlotBadge({ slot }: { slot: string }) {
  return (
    <Badge variant="amber" className="font-mono text-xs">
      {slot}
    </Badge>
  );
}

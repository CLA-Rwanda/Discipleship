import Image from "next/image";

interface CLALogoProps {
  /**
   * layout controls how the icon and name are arranged:
   * - "stacked"   icon above, name below (public form pages)
   * - "inline"    icon left, name right (sidebar, login header)
   */
  layout?: "stacked" | "inline";
  size?: "sm" | "md" | "lg";
  className?: string;
}

const ICON_PX = { sm: 36, md: 52, lg: 72 };

const NAME_STYLE = {
  fontFamily: "Barlow Condensed, sans-serif",
  color: "#FFFFFF",
  letterSpacing: "0.1em",
  lineHeight: 1.15,
};

export function CLALogo({
  layout = "stacked",
  size = "md",
  className = "",
}: CLALogoProps) {
  const px = ICON_PX[size];

  const nameFontSize =
    size === "sm" ? "0.6rem" : size === "md" ? "0.75rem" : "0.95rem";
  const subFontSize =
    size === "sm" ? "0.45rem" : size === "md" ? "0.58rem" : "0.72rem";

  const icon = (
    <Image
      src="/cla-logo-icon.png"
      alt="CLA logo"
      width={px}
      height={px}
      style={{ objectFit: "contain" }}
      priority
    />
  );

  const nameBlock = (
    <div style={{ ...NAME_STYLE }}>
      <p
        style={{
          fontWeight: 800,
          fontSize: nameFontSize,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          whiteSpace: "nowrap",
        }}
      >
        CHRISTIAN LIFE
      </p>
      <p
        style={{
          fontWeight: 800,
          fontSize: nameFontSize,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          whiteSpace: "nowrap",
        }}
      >
        ASSEMBLY
      </p>
      <p
        style={{
          fontWeight: 400,
          fontSize: subFontSize,
          letterSpacing: "0.25em",
          color: "rgba(228,148,12,0.85)",
          textTransform: "uppercase",
          whiteSpace: "nowrap",
          marginTop: "2px",
        }}
      >
        DISCIPLESHIP
      </p>
    </div>
  );

  if (layout === "inline") {
    return (
      <div
        className={`flex items-center gap-3 ${className}`}
        style={{ userSelect: "none" }}
      >
        {icon}
        {nameBlock}
      </div>
    );
  }

  // stacked
  return (
    <div
      className={`flex flex-col items-center gap-2 ${className}`}
      style={{ userSelect: "none" }}
    >
      {icon}
      <div className="text-center" style={NAME_STYLE}>
        <p
          style={{
            fontWeight: 800,
            fontSize: nameFontSize,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            whiteSpace: "nowrap",
          }}
        >
          CHRISTIAN LIFE ASSEMBLY
        </p>
        <p
          style={{
            fontWeight: 400,
            fontSize: subFontSize,
            letterSpacing: "0.25em",
            color: "rgba(228,148,12,0.85)",
            textTransform: "uppercase",
            whiteSpace: "nowrap",
            marginTop: "2px",
          }}
        >
          DISCIPLESHIP
        </p>
      </div>
    </div>
  );
}

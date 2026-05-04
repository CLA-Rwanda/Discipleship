"use client";

import { type ButtonHTMLAttributes } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  children,
  className = "",
  disabled,
  ...props
}: ButtonProps) {
  const base =
    "inline-flex items-center justify-center gap-2 font-condensed font-bold tracking-wide rounded-lg transition-all cursor-pointer border-0";

  const variants = {
    primary: "btn-primary",
    secondary: "btn-secondary",
    ghost:
      "bg-transparent text-cla-off-white hover:bg-white/5 border border-white/10",
    danger:
      "bg-red-900/30 text-red-400 border border-red-800/50 hover:bg-red-900/50",
  };

  const sizes = {
    sm: "text-sm px-4 py-2",
    md: "text-base px-6 py-3",
    lg: "text-lg px-8 py-4",
  };

  return (
    <button
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <>
          <span className="spinner" />
          <span>Loading…</span>
        </>
      ) : (
        children
      )}
    </button>
  );
}

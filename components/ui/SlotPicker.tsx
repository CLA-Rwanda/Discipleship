"use client";

import type { Slot } from "@/lib/types";

interface SlotOption {
  value: Slot;
  label: string;
  remaining: number;
  total: number;
}

interface SlotPickerProps {
  options: SlotOption[];
  value: Slot | "";
  onChange: (slot: Slot) => void;
  disabled?: boolean;
}

export function SlotPicker({ options, value, onChange, disabled }: SlotPickerProps) {
  return (
    <div className="flex flex-col gap-3">
      {options.map((opt) => {
        const pct = ((opt.total - opt.remaining) / opt.total) * 100;
        const isFull = opt.remaining === 0;
        const isSelected = value === opt.value;

        return (
          <label
            key={opt.value}
            className={`slot-radio ${isSelected ? "selected" : ""} ${
              isFull || disabled ? "opacity-50 cursor-not-allowed" : ""
            }`}
          >
            <input
              type="radio"
              name="slot"
              value={opt.value}
              checked={isSelected}
              onChange={() => !isFull && !disabled && onChange(opt.value)}
              disabled={isFull || disabled}
              className="sr-only"
            />

            {/* Radio indicator */}
            <div
              className="w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center transition-all"
              style={{
                borderColor: isSelected
                  ? "var(--cla-amber)"
                  : "rgba(212,134,10,0.3)",
                background: isSelected ? "var(--cla-amber)" : "transparent",
              }}
            >
              {isSelected && (
                <div className="w-2 h-2 rounded-full bg-cla-bg-dark" />
              )}
            </div>

            {/* Label */}
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <span
                  className="font-bold text-base"
                  style={{ fontFamily: "Barlow Condensed, sans-serif" }}
                >
                  {opt.label}
                </span>
                <span
                  className="text-xs"
                  style={{
                    color: isFull
                      ? "#ff6b6b"
                      : pct >= 80
                      ? "var(--cla-amber)"
                      : "rgba(232,224,216,0.6)",
                  }}
                >
                  {isFull
                    ? "FULL"
                    : `${opt.remaining} spot${opt.remaining === 1 ? "" : "s"} left`}
                </span>
              </div>
              {/* mini progress bar */}
              <div
                className="h-1 rounded-full"
                style={{ background: "rgba(255,255,255,0.08)" }}
              >
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${pct}%`,
                    background: isFull
                      ? "#ff4444"
                      : pct >= 80
                      ? "var(--cla-amber)"
                      : "var(--cla-logo-yellow)",
                  }}
                />
              </div>
            </div>
          </label>
        );
      })}
    </div>
  );
}

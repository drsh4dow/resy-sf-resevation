import { cva } from "class-variance-authority";

import type { DayStatus } from "./format.ts";

const appearanceByStatus = {
  available: "available",
  unavailable: "unavailable",
  non_service: "non-service",
  unknown: "unconfirmed",
  collection_error: "unconfirmed",
  missing: "unconfirmed",
  unreleased: "unconfirmed",
} as const satisfies Record<DayStatus, string>;

const dayVariants = cva("border", {
  variants: {
    appearance: {
      available: "border-input bg-card",
      unavailable: "border-primary bg-primary text-primary-foreground",
      "non-service": "border-input",
      unconfirmed: "border-warning-border bg-warning text-warning-foreground",
    },
    kind: {
      marker: "relative inline-block size-3.5 rounded-xs",
      calendar:
        "min-h-8.75 rounded-sm text-xs/normal tabular-nums aria-pressed:outline-2 aria-pressed:outline-offset-2 aria-pressed:outline-ring",
    },
  },
  compoundVariants: [
    {
      appearance: "available",
      kind: "marker",
      class:
        "after:absolute after:inset-1 after:rounded-full after:bg-available after:content-['']",
    },
    {
      appearance: "available",
      kind: "calendar",
      class: "border-b-3 border-b-available",
    },
    { appearance: "non-service", kind: "marker", class: "bg-non-service-mark" },
    { appearance: "non-service", kind: "calendar", class: "bg-non-service" },
    {
      appearance: "unconfirmed",
      kind: "marker",
      class:
        "after:absolute after:inset-0 after:text-center after:text-[10px]/3 after:content-['?']",
    },
    { appearance: "unconfirmed", kind: "calendar", class: "border-dashed" },
  ],
});

export function availabilityDayClasses(status: DayStatus, kind: "marker" | "calendar") {
  return dayVariants({ appearance: appearanceByStatus[status], kind });
}

export function DayMark({ status, label }: { status: DayStatus; label?: string }) {
  return (
    <span className={availabilityDayClasses(status, "marker")} data-status={status} title={label}>
      {label ? <span className="sr-only">{label}</span> : null}
    </span>
  );
}

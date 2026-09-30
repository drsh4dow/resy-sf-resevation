import { TIME_ZONE } from "../scarcity/model.ts";
import type { Observation } from "../scarcity/model.ts";

export type DayStatus = Observation["status"] | "missing";

export const statusLabel: Record<DayStatus, string> = {
  available: "Available",
  unavailable: "No opening",
  non_service: "No dinner service",
  unreleased: "Not released",
  unknown: "Unknown",
  collection_error: "Request failed",
  missing: "Not checked",
};

const diningDateFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "short",
  day: "numeric",
});

const snapshotFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "long",
  day: "numeric",
  year: "numeric",
});

const instantFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
});

const weekdayFormat = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short" });

export function formatDay(day: string) {
  return diningDateFormat.format(new Date(`${day}T12:00:00Z`));
}

export function formatSnapshot(day: string) {
  return snapshotFormat.format(new Date(`${day}T12:00:00Z`));
}

export function formatWeekday(day: string) {
  return weekdayFormat.format(new Date(`${day}T12:00:00Z`));
}

export function formatInstant(instant: string) {
  return instantFormat.format(new Date(instant));
}

export function formatScore(score: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(score);
}

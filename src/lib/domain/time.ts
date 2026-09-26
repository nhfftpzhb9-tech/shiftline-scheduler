import { Temporal } from "@js-temporal/polyfill";
import type { Bar, Shift, ShiftInterval, Weekday } from "./types";

export const DEFAULT_TIME_ZONE = "Europe/Amsterdam";
const MINUTE = 60_000;

export function parseTime(value: string): { hour: number; minute: number } {
  const [hour, minute] = value.split(":").map(Number);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    throw new RangeError(`Invalid time: ${value}`);
  }
  return { hour, minute };
}

function atLocalTime(date: string, time: string, timeZone: string): Temporal.ZonedDateTime {
  const day = Temporal.PlainDate.from(date);
  const { hour, minute } = parseTime(time);
  return Temporal.ZonedDateTime.from({
    timeZone,
    year: day.year,
    month: day.month,
    day: day.day,
    hour,
    minute,
    second: 0,
    millisecond: 0,
  }, { disambiguation: "compatible" });
}

export function getShiftInterval(shift: Pick<Shift, "date" | "start_time" | "end_time">, timeZone = DEFAULT_TIME_ZONE): ShiftInterval {
  const start = atLocalTime(shift.date, shift.start_time, timeZone);
  let endDate = start.toPlainDate();
  // Equal start/end is invalid in the editor; treating it as 24 hours keeps imported data deterministic.
  if (shift.end_time <= shift.start_time) endDate = endDate.add({ days: 1 });
  const end = atLocalTime(endDate.toString(), shift.end_time, timeZone);
  return {
    start: Number(start.epochMilliseconds),
    end: Number(end.epochMilliseconds),
    startDate: shift.date,
    endDate: endDate.toString(),
    startTime: shift.start_time,
    endTime: shift.end_time,
  };
}

export function durationHours(shift: Pick<Shift, "date" | "start_time" | "end_time">, timeZone = DEFAULT_TIME_ZONE): number {
  const { start, end } = getShiftInterval(shift, timeZone);
  return (end - start) / (60 * MINUTE);
}

export function overlaps(a: ShiftInterval, b: ShiftInterval): boolean {
  return a.start < b.end && b.start < a.end;
}

export function formatHours(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}h`;
}

export function weekdayForDate(date: string): Weekday {
  return Temporal.PlainDate.from(date).dayOfWeek as Weekday;
}

export function startOfWeek(date: string): string {
  const day = Temporal.PlainDate.from(date);
  return day.subtract({ days: day.dayOfWeek - 1 }).toString();
}

export function addDays(date: string, days: number): string {
  return Temporal.PlainDate.from(date).add({ days }).toString();
}

export function monthBounds(month: string): { first: string; last: string; dayCount: number } {
  const firstDate = Temporal.PlainDate.from(`${month}-01`);
  return { first: firstDate.toString(), last: firstDate.add({ months: 1 }).subtract({ days: 1 }).toString(), dayCount: firstDate.daysInMonth };
}

export function shiftStartsInWeek(shift: Shift, weekStart: string): boolean {
  const start = Temporal.PlainDate.from(shift.date);
  const first = Temporal.PlainDate.from(weekStart);
  return Temporal.PlainDate.compare(start, first) >= 0 && Temporal.PlainDate.compare(start, first.add({ days: 7 })) < 0;
}

export function shiftStartsInMonth(shift: Shift, month: string): boolean {
  return shift.date.startsWith(`${month}-`);
}

export function formatDate(date: string, options?: Intl.DateTimeFormatOptions): string {
  const { year, month, day } = Temporal.PlainDate.from(date);
  return new Intl.DateTimeFormat("en", { weekday: "long", month: "long", day: "numeric", year: "numeric", ...options }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

export function formatMonth(month: string): string {
  const date = Temporal.PlainDate.from(`${month}-01`);
  return new Intl.DateTimeFormat("en", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(date.year, date.month - 1, 1)));
}

export function monthOf(date: string): string { return date.slice(0, 7); }

export function moveMonth(month: string, delta: number): string {
  return Temporal.PlainDate.from(`${month}-01`).add({ months: delta }).toString().slice(0, 7);
}

export function isoNowDate(): string { return Temporal.Now.plainDateISO().toString(); }

export function barForShift(shift: Shift, bars: Bar[]): Bar | undefined { return bars.find((bar) => bar.id === shift.bar_id); }

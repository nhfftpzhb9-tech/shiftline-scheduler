import { describe, expect, it } from "vitest";
import type { Bar, Employee, RuleSettings, Shift, StaffingRequirement } from "./types";
import { durationHours, getShiftInterval } from "./time";
import { evaluateSchedule, monthlyHoursFor, replacementCandidates, weeklyHoursFor } from "./rules";

const venue: Bar = { id: "bar-a", name: "Bar A", opening_time: "18:00", closing_time: "03:00", time_zone: "Europe/Amsterdam" };
const secondVenue: Bar = { id: "bar-b", name: "Bar B", opening_time: "17:00", closing_time: "02:00", time_zone: "Europe/Amsterdam" };
const baseEmployee: Employee = {
  id: "employee-a", full_name: "Alex Morgan", email: null, phone: null, roles: ["Bartender"], skills: ["Cocktails"],
  availability: {}, max_weekly_hours: 40, contract_type: null, active: true, bar_ids: [venue.id, secondVenue.id],
};
function makeShift(overrides: Partial<Shift> = {}): Shift {
  return { id: "shift-a", schedule_id: "schedule-a", bar_id: venue.id, date: "2026-09-07", start_time: "18:00", end_time: "23:00", employee_id: baseEmployee.id, role: "Bartender", required_skills: [], status: "scheduled", notes: null, ...overrides };
}
const noStaffing: StaffingRequirement[] = [];
const noRules: RuleSettings = { availability: false, maximumHours: false, overlaps: false, staffing: false, openingHours: false };

describe("shift time calculations", () => {
  it("calculates a normal shift duration", () => {
    expect(durationHours(makeShift({ start_time: "18:00", end_time: "23:00" }), venue.time_zone)).toBe(5);
  });

  it("treats an overnight shift as ending the next day", () => {
    const shift = makeShift({ start_time: "21:00", end_time: "05:00" });
    expect(durationHours(shift, venue.time_zone)).toBe(8);
    expect(getShiftInterval(shift, venue.time_zone).endDate).toBe("2026-09-08");
  });

  it("uses elapsed venue time through daylight-saving changes", () => {
    const springForward = makeShift({ date: "2026-03-29", start_time: "01:00", end_time: "04:00" });
    const fallBack = makeShift({ date: "2026-10-25", start_time: "01:00", end_time: "04:00" });
    expect(durationHours(springForward, venue.time_zone)).toBe(2);
    expect(durationHours(fallBack, venue.time_zone)).toBe(4);
  });
});

describe("schedule rules", () => {
  it("calculates weekly and monthly employee hours", () => {
    const shifts = [makeShift(), makeShift({ id: "shift-b", date: "2026-09-09", start_time: "18:00", end_time: "23:00" }), makeShift({ id: "next-week", date: "2026-09-14" })];
    expect(weeklyHoursFor(baseEmployee.id, "2026-09-07", shifts, [venue])).toBe(10);
    expect(monthlyHoursFor(baseEmployee.id, "2026-09", shifts, [venue])).toBe(15);
  });

  it("finds overlapping assignments across bars and shows the period", () => {
    const first = makeShift({ start_time: "21:00", end_time: "05:00" });
    const second = makeShift({ id: "shift-b", bar_id: secondVenue.id, start_time: "23:00", end_time: "02:00" });
    const warnings = evaluateSchedule({ bars: [venue, secondVenue], employees: [baseEmployee], shifts: [first, second], requirements: noStaffing, settings: { ...noRules, overlaps: true }, month: "2026-09" });
    expect(warnings).toHaveLength(1);
    expect(warnings[0].message).toContain("Bar A and Bar B (23:00–02:00)");
    expect(warnings[0].severity).toBe("critical");
  });

  it("warns when an employee is scheduled outside availability, including after midnight", () => {
    const employee = { ...baseEmployee, availability: { 2: { status: "unavailable" as const } } };
    const shift = makeShift({ start_time: "21:00", end_time: "02:00" });
    const warnings = evaluateSchedule({ bars: [venue], employees: [employee], shifts: [shift], requirements: noStaffing, settings: { ...noRules, availability: true }, month: "2026-09" });
    expect(warnings).toHaveLength(1);
    expect(warnings[0].message).toContain("unavailable");
  });

  it("allows a shift that fits inside a limited availability window", () => {
    const employee = { ...baseEmployee, availability: { 1: { status: "limited" as const, start: "18:00", end: "23:00" } } };
    const shift = makeShift({ start_time: "19:00", end_time: "22:00" });
    const warnings = evaluateSchedule({ bars: [venue], employees: [employee], shifts: [shift], requirements: noStaffing, settings: { ...noRules, availability: true }, month: "2026-09" });
    expect(warnings).toHaveLength(0);
  });

  it("warns when a shift falls outside a limited availability window", () => {
    const employee = { ...baseEmployee, availability: { 1: { status: "limited" as const, start: "18:00", end: "23:00" } } };
    const shift = makeShift({ start_time: "17:00", end_time: "22:00" });
    const warnings = evaluateSchedule({ bars: [venue], employees: [employee], shifts: [shift], requirements: noStaffing, settings: { ...noRules, availability: true }, month: "2026-09" });
    expect(warnings.some((warning) => warning.rule === "availability")).toBe(true);
  });

  it("warns when weekly hours exceed the employee maximum", () => {
    const employee = { ...baseEmployee, max_weekly_hours: 8 };
    const shifts = [makeShift(), makeShift({ id: "shift-b", start_time: "23:00", end_time: "04:00" })];
    const warnings = evaluateSchedule({ bars: [venue], employees: [employee], shifts, requirements: noStaffing, settings: { ...noRules, maximumHours: true }, month: "2026-09" });
    expect(warnings.some((warning) => warning.rule === "maximumHours" && warning.message.includes("10h"))).toBe(true);
  });

  it("treats a zero-hour maximum as a configured limit", () => {
    const employee = { ...baseEmployee, max_weekly_hours: 0 };
    const warnings = evaluateSchedule({ bars: [venue], employees: [employee], shifts: [makeShift()], requirements: noStaffing, settings: { ...noRules, maximumHours: true }, month: "2026-09" });
    expect(warnings.some((warning) => warning.rule === "maximumHours")).toBe(true);
  });

  it("warns when fewer employees are scheduled than the configured minimum", () => {
    const requirement: StaffingRequirement = { id: "requirement-a", bar_id: venue.id, weekday: 1, start_time: "18:00", end_time: "22:00", minimum_staff: 3 };
    const shifts = [makeShift({ start_time: "18:00", end_time: "20:00" }), makeShift({ id: "shift-b", employee_id: "employee-b", start_time: "18:00", end_time: "20:00" })];
    const warnings = evaluateSchedule({ bars: [venue], employees: [baseEmployee], shifts, requirements: [requirement], settings: { ...noRules, staffing: true }, month: "2026-09" });
    expect(warnings.some((warning) => warning.message.includes("understaffed by 1 employee"))).toBe(true);
  });

  it("warns when a shift extends beyond bar opening hours", () => {
    const warnings = evaluateSchedule({ bars: [venue], employees: [baseEmployee], shifts: [makeShift({ start_time: "21:00", end_time: "05:00" })], requirements: noStaffing, settings: { ...noRules, openingHours: true }, month: "2026-09" });
    expect(warnings[0].message).toContain("extends beyond Bar A's opening hours");
  });

  it("ranks suitable replacement staff before candidates with conflicts", () => {
    const target = makeShift({ start_time: "21:00", end_time: "02:00", required_skills: ["Cocktails"] });
    const suitable: Employee = { ...baseEmployee, id: "employee-b", full_name: "Jamie Reed", max_weekly_hours: 40 };
    const conflicted: Employee = { ...baseEmployee, id: "employee-c", full_name: "Taylor Quinn", max_weekly_hours: 40 };
    const conflictShift = makeShift({ id: "existing-shift", bar_id: secondVenue.id, employee_id: conflicted.id, start_time: "22:00", end_time: "23:00" });
    const candidates = replacementCandidates({ bars: [venue, secondVenue], employees: [baseEmployee, suitable, conflicted], shifts: [target, conflictShift], requirements: noStaffing, month: "2026-09" }, target);
    expect(candidates[0].employee.id).toBe(suitable.id);
    expect(candidates[1].overlapShifts).toHaveLength(1);
  });
});

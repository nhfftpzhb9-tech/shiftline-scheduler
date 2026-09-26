import { Temporal } from "@js-temporal/polyfill";
import type {
  AvailabilityDay,
  Bar,
  CandidateEvaluation,
  Employee,
  RuleSettings,
  ScheduleWarning,
  Shift,
  StaffingRequirement,
  Weekday,
} from "./types";
import { DEFAULT_RULE_SETTINGS } from "./types";
import { addDays, durationHours, formatHours, getShiftInterval, monthBounds, shiftStartsInMonth, shiftStartsInWeek, startOfWeek, weekdayForDate } from "./time";

export interface RuleContext {
  bars: Bar[];
  employees: Employee[];
  shifts: Shift[];
  requirements: StaffingRequirement[];
  settings?: RuleSettings;
  month: string;
}

function labelForEmployee(employee: Employee | undefined): string { return employee?.full_name ?? "Employee"; }
function labelForBar(bar: Bar | undefined): string { return bar?.name ?? "another venue"; }
function timeLabel(epoch: number, timeZone: string): string {
  return Temporal.Instant.fromEpochMilliseconds(epoch).toZonedDateTimeISO(timeZone).toPlainTime().toString({ smallestUnit: "minute" });
}
function dateLabel(date: string): string {
  const d = Temporal.PlainDate.from(date);
  return new Intl.DateTimeFormat("en", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(d.year, d.month - 1, d.day, 12)));
}
function hasRange(day: AvailabilityDay | undefined): day is AvailabilityDay & { start: string; end: string } { return Boolean(day?.start && day?.end); }
function timeStringLessOrEqual(left: string, right: string): boolean { return left <= right; }

export function evaluateAvailability(employee: Employee, shift: Shift, bar: Bar): "available" | "limited" | "unavailable" | "unspecified" {
  if (!employee.availability || Object.keys(employee.availability).length === 0) return "unspecified";
  const interval = getShiftInterval(shift, bar.time_zone);
  let cursor = interval.start;
  let result: "available" | "unspecified" = "unspecified";

  // Inspect each local calendar-day segment so an overnight shift also checks the following day.
  while (cursor < interval.end) {
    const zoned = Temporal.Instant.fromEpochMilliseconds(cursor).toZonedDateTimeISO(bar.time_zone);
    const localDate = zoned.toPlainDate();
    const nextMidnight = localDate.add({ days: 1 }).toZonedDateTime({ timeZone: bar.time_zone });
    const segmentEnd = Math.min(interval.end, Number(nextMidnight.epochMilliseconds));
    const weekday = localDate.dayOfWeek as Weekday;
    const rule = employee.availability[weekday];
    if (rule?.status === "unavailable") return "unavailable";
    if (rule?.status === "available") result = "available";
    if (rule?.status === "limited") {
      if (!hasRange(rule)) return "limited";
      const segmentStartTime = zoned.toPlainTime().toString({ smallestUnit: "minute" });
      const segmentEndTime = Temporal.Instant.fromEpochMilliseconds(segmentEnd).toZonedDateTimeISO(bar.time_zone).toPlainTime().toString({ smallestUnit: "minute" });
      // Availability windows are day-based; configure the after-midnight part on its own weekday.
      if (!timeStringLessOrEqual(rule.start, segmentStartTime) || !timeStringLessOrEqual(segmentEndTime, rule.end)) return "limited";
      result = "available";
    }
    cursor = segmentEnd;
  }
  return result;
}

function shiftIsInsideOpeningHours(shift: Shift, bar: Bar): boolean {
  const toMinutes = (time: string) => {
    const [h, m] = time.split(":").map(Number);
    return h * 60 + m;
  };
  const open = toMinutes(bar.opening_time);
  let close = toMinutes(bar.closing_time);
  const start = toMinutes(shift.start_time);
  let end = toMinutes(shift.end_time);
  if (close <= open) close += 1440;
  if (end <= start) end += 1440;
  return start >= open && end <= close;
}

function buildWarnings(context: RuleContext): ScheduleWarning[] {
  const settings = context.settings ?? DEFAULT_RULE_SETTINGS;
  const barById = new Map(context.bars.map((bar) => [bar.id, bar]));
  const employeeById = new Map(context.employees.map((employee) => [employee.id, employee]));
  const warnings: ScheduleWarning[] = [];
  const currentMonthShifts = context.shifts.filter((shift) => shiftStartsInMonth(shift, context.month));

  if (settings.availability) {
    for (const shift of currentMonthShifts) {
      if (!shift.employee_id) continue;
      const employee = employeeById.get(shift.employee_id);
      const bar = barById.get(shift.bar_id);
      if (!employee || !bar) continue;
      const result = evaluateAvailability(employee, shift, bar);
      if (result === "limited" || result === "unavailable") {
        warnings.push({ id: `availability:${shift.id}`, rule: "availability", severity: "warning", employeeId: employee.id, shiftIds: [shift.id], date: shift.date,
          message: result === "unavailable"
            ? `${employee.full_name} is scheduled on a day marked unavailable.`
            : `${employee.full_name} is scheduled outside their available hours.` });
      }
    }
  }

  if (settings.openingHours) {
    for (const shift of currentMonthShifts) {
      const bar = barById.get(shift.bar_id);
      if (bar && !shiftIsInsideOpeningHours(shift, bar)) {
        warnings.push({ id: `opening:${shift.id}`, rule: "openingHours", severity: "warning", barId: bar.id, shiftIds: [shift.id], date: shift.date,
          message: `This shift extends beyond ${bar.name}'s opening hours.` });
      }
    }
  }

  if (settings.overlaps) {
    const byEmployee = new Map<string, Shift[]>();
    for (const shift of context.shifts) {
      if (!shift.employee_id) continue;
      byEmployee.set(shift.employee_id, [...(byEmployee.get(shift.employee_id) ?? []), shift]);
    }
    for (const [employeeId, employeeShifts] of byEmployee) {
      for (let i = 0; i < employeeShifts.length; i += 1) {
        for (let j = i + 1; j < employeeShifts.length; j += 1) {
          const first = employeeShifts[i];
          const second = employeeShifts[j];
          if (first.id === second.id) continue;
          const firstBar = barById.get(first.bar_id);
          const secondBar = barById.get(second.bar_id);
          if (!firstBar || !secondBar) continue;
          const a = getShiftInterval(first, firstBar.time_zone);
          const b = getShiftInterval(second, secondBar.time_zone);
          const start = Math.max(a.start, b.start);
          const end = Math.min(a.end, b.end);
          if (start >= end) continue;
          const visibleShift = shiftStartsInMonth(first, context.month) ? first : shiftStartsInMonth(second, context.month) ? second : null;
          if (!visibleShift) continue;
          const employee = employeeById.get(employeeId);
          warnings.push({
            id: `overlap:${[first.id, second.id].sort().join(":")}`,
            rule: "overlaps",
            severity: "critical",
            employeeId,
            shiftIds: [first.id, second.id],
            date: visibleShift.date,
            message: `${labelForEmployee(employee)} has overlapping shifts at ${labelForBar(firstBar)} and ${labelForBar(secondBar)} (${timeLabel(start, firstBar.time_zone)}–${timeLabel(end, firstBar.time_zone)}).`,
          });
        }
      }
    }
  }

  if (settings.maximumHours) {
    const employeeShifts = new Map<string, Map<string, Shift[]>>();
    for (const shift of context.shifts) {
      if (!shift.employee_id) continue;
      const week = startOfWeek(shift.date);
      const byWeek = employeeShifts.get(shift.employee_id) ?? new Map<string, Shift[]>();
      byWeek.set(week, [...(byWeek.get(week) ?? []), shift]);
      employeeShifts.set(shift.employee_id, byWeek);
    }
    for (const [employeeId, weeks] of employeeShifts) {
      const employee = employeeById.get(employeeId);
      if (!employee || employee.max_weekly_hours === null || employee.max_weekly_hours === undefined) continue;
      for (const [week, shifts] of weeks) {
        const visible = shifts.find((shift) => shiftStartsInMonth(shift, context.month));
        if (!visible) continue;
        const hours = shifts.reduce((total, shift) => total + durationHours(shift, barById.get(shift.bar_id)?.time_zone), 0);
        if (hours > employee.max_weekly_hours) {
          warnings.push({ id: `hours:${employeeId}:${week}`, rule: "maximumHours", severity: "warning", employeeId, date: visible.date,
            message: `${employee.full_name} is scheduled for ${formatHours(hours)} this week. Maximum: ${formatHours(employee.max_weekly_hours)}.` });
        }
      }
    }
  }

  if (settings.staffing) {
    const { first, last } = monthBounds(context.month);
    let date = first;
    while (date <= last) {
      const weekday = weekdayForDate(date);
      for (const requirement of context.requirements.filter((item) => item.weekday === weekday)) {
        const bar = barById.get(requirement.bar_id);
        if (!bar) continue;
        const required = getShiftInterval({ date, start_time: requirement.start_time, end_time: requirement.end_time }, bar.time_zone);
        const intervals = context.shifts.flatMap((shift) => {
          if (shift.bar_id !== requirement.bar_id) return [];
          const shiftBar = barById.get(shift.bar_id);
          if (!shiftBar) return [];
          const interval = getShiftInterval(shift, shiftBar.time_zone);
          if (interval.end <= required.start || interval.start >= required.end) return [];
          return [{ start: Math.max(interval.start, required.start), end: Math.min(interval.end, required.end), employeeId: shift.employee_id }];
        });
        const points = [...new Set([required.start, required.end, ...intervals.flatMap((item) => [item.start, item.end])])].sort((a, b) => a - b);
        for (let i = 0; i < points.length - 1; i += 1) {
          const start = points[i];
          const end = points[i + 1];
          if (start === end) continue;
          const count = new Set(intervals.filter((interval) => interval.start < end && interval.end > start && interval.employeeId !== null).map((interval) => interval.employeeId)).size;
          if (count >= requirement.minimum_staff) continue;
          const missing = requirement.minimum_staff - count;
          warnings.push({
            id: `staffing:${requirement.id}:${date}:${start}`,
            rule: "staffing",
            severity: "warning",
            barId: bar.id,
            date,
            start_time: timeLabel(start, bar.time_zone),
            end_time: timeLabel(end, bar.time_zone),
            message: `${bar.name} is understaffed by ${missing} ${missing === 1 ? "employee" : "employees"} on ${dateLabel(date)} (${timeLabel(start, bar.time_zone)}–${timeLabel(end, bar.time_zone)}).`,
          });
        }
      }
      date = addDays(date, 1);
    }
  }

  return warnings;
}

export function evaluateSchedule(context: RuleContext): ScheduleWarning[] {
  return buildWarnings(context);
}

export function weeklyHoursFor(employeeId: string, weekStart: string, shifts: Shift[], bars: Bar[]): number {
  const barById = new Map(bars.map((bar) => [bar.id, bar]));
  return shifts.filter((shift) => shift.employee_id === employeeId && shiftStartsInWeek(shift, weekStart))
    .reduce((total, shift) => total + durationHours(shift, barById.get(shift.bar_id)?.time_zone), 0);
}

export function monthlyHoursFor(employeeId: string, month: string, shifts: Shift[], bars: Bar[]): number {
  const barById = new Map(bars.map((bar) => [bar.id, bar]));
  return shifts.filter((shift) => shift.employee_id === employeeId && shiftStartsInMonth(shift, month))
    .reduce((total, shift) => total + durationHours(shift, barById.get(shift.bar_id)?.time_zone), 0);
}

export function replacementCandidates(context: RuleContext, target: Shift): CandidateEvaluation[] {
  const bars = new Map(context.bars.map((bar) => [bar.id, bar]));
  const targetBar = bars.get(target.bar_id);
  if (!targetBar) return [];
  const requiredSkills = target.required_skills ?? [];
  const week = startOfWeek(target.date);

  return context.employees.filter((employee) => employee.active && employee.id !== target.employee_id).map((employee) => {
    const availability = evaluateAvailability(employee, target, targetBar);
    const targetInterval = getShiftInterval(target, targetBar.time_zone);
    const overlapShifts = context.shifts.filter((shift) => shift.id !== target.id && shift.employee_id === employee.id).filter((shift) => {
      const otherBar = bars.get(shift.bar_id);
      return otherBar ? targetInterval.start < getShiftInterval(shift, otherBar.time_zone).end && getShiftInterval(shift, otherBar.time_zone).start < targetInterval.end : false;
    });
    const weeklyHours = weeklyHoursFor(employee.id, week, context.shifts.filter((shift) => shift.id !== target.id), context.bars) + durationHours(target, targetBar.time_zone);
    const missingSkills = requiredSkills.filter((skill) => !employee.skills.some((candidateSkill) => candidateSkill.toLocaleLowerCase() === skill.toLocaleLowerCase()));
    const roleMatch = !target.role || employee.roles.some((role) => role.toLocaleLowerCase() === target.role?.toLocaleLowerCase());
    const barMatch = employee.bar_ids.length === 0 || employee.bar_ids.includes(target.bar_id);
    const hasHoursWarning = employee.max_weekly_hours !== null && weeklyHours > employee.max_weekly_hours;
    const capacityScore = employee.max_weekly_hours === null ? 0 : Math.max(-25, Math.min(15, (employee.max_weekly_hours - weeklyHours) / 2));
    const score = (availability === "available" ? 50 : availability === "unspecified" ? 10 : -30)
      + (overlapShifts.length ? -100 : 25) + (hasHoursWarning ? -20 : 8) + (roleMatch ? 10 : -8) + (barMatch ? 5 : -15) + capacityScore - missingSkills.length * 6;
    return { employee, weeklyHours, maxWeeklyHours: employee.max_weekly_hours, availability, overlapShifts, barMatch, missingSkills, roleMatch, score };
  }).sort((a, b) => b.score - a.score || a.employee.full_name.localeCompare(b.employee.full_name));
}

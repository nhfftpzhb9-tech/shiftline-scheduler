export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type AvailabilityStatus = "available" | "unavailable" | "limited";

export interface AvailabilityDay {
  status: AvailabilityStatus;
  start?: string;
  end?: string;
}

export type WeeklyAvailability = Partial<Record<Weekday, AvailabilityDay>>;

export interface Bar {
  id: string;
  name: string;
  opening_time: string;
  closing_time: string;
  time_zone: string;
  metadata?: Record<string, unknown>;
}

export interface Employee {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  roles: string[];
  skills: string[];
  availability: WeeklyAvailability;
  max_weekly_hours: number | null;
  contract_type: string | null;
  active: boolean;
  bar_ids: string[];
  metadata?: Record<string, unknown>;
}

export interface Schedule {
  id: string;
  month_start: string;
  status: "draft" | "published";
}

export interface Shift {
  id: string;
  schedule_id: string;
  bar_id: string;
  date: string;
  start_time: string;
  end_time: string;
  employee_id: string | null;
  role: string | null;
  required_skills?: string[];
  status: "scheduled" | "tentative";
  notes?: string | null;
}

export interface StaffingRequirement {
  id: string;
  bar_id: string;
  weekday: Weekday;
  start_time: string;
  end_time: string;
  minimum_staff: number;
}

export interface RuleSettings {
  availability: boolean;
  maximumHours: boolean;
  overlaps: boolean;
  staffing: boolean;
  openingHours: boolean;
}

export interface ScheduleWarning {
  id: string;
  rule: keyof RuleSettings;
  severity: "warning" | "critical";
  message: string;
  shiftIds?: string[];
  employeeId?: string;
  barId?: string;
  date?: string;
  start_time?: string;
  end_time?: string;
}

export interface ShiftInterval {
  start: number;
  end: number;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
}

export interface CandidateEvaluation {
  employee: Employee;
  weeklyHours: number;
  maxWeeklyHours: number | null;
  availability: "available" | "limited" | "unavailable" | "unspecified";
  overlapShifts: Shift[];
  barMatch: boolean;
  missingSkills: string[];
  roleMatch: boolean;
  score: number;
}

export const DEFAULT_RULE_SETTINGS: RuleSettings = {
  availability: true,
  maximumHours: true,
  overlaps: true,
  staffing: true,
  openingHours: true,
};

export const WEEKDAY_LABELS: Record<Weekday, string> = {
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
  7: "Sunday",
};

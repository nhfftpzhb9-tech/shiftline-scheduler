"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Temporal } from "@js-temporal/polyfill";
import { AlertTriangle, ArrowLeft, ArrowLeftRight, CalendarDays, Check, ChevronLeft, ChevronRight, Clock3, Copy, Plus, Search, Trash2, UsersRound, X } from "lucide-react";
import type { Bar, CandidateEvaluation, Employee, Schedule, ScheduleWarning, Shift, StaffingRequirement } from "@/lib/domain/types";
import { replacementCandidates, weeklyHoursFor } from "@/lib/domain/rules";
import { addDays, durationHours, formatDate, formatHours, formatMonth, monthBounds, moveMonth, startOfWeek, weekdayForDate } from "@/lib/domain/time";
import type { ShiftInput } from "@/lib/data/repository";
import { Dialog } from "@/components/ui";
import { DEFAULT_TIME_ZONE } from "@/lib/domain/time";

type Filters = { bar: string; employee: string; role: string; assignment: string; warnings: boolean };
const EMPTY_FILTERS: Filters = { bar: "all", employee: "all", role: "all", assignment: "all", warnings: false };
const DOW_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const FILTER_STORAGE_KEY = "shiftline.schedule.filters.v1";

export function ScheduleView({ month, setMonth, bars, employees, shifts, schedule, requirements, warnings, busy, onSaveShift, onDeleteShift, onEnsureSchedule, onCopyMonth }: {
  month: string;
  setMonth: (month: string) => void;
  bars: Bar[];
  employees: Employee[];
  shifts: Shift[];
  schedule: Schedule | null;
  requirements: StaffingRequirement[];
  warnings: ScheduleWarning[];
  busy: boolean;
  onSaveShift: (input: ShiftInput, id?: string) => Promise<void>;
  onDeleteShift: (id: string) => Promise<void>;
  onEnsureSchedule: () => Promise<void>;
  onCopyMonth: (source: string, target: string, replace: boolean) => Promise<void>;
}) {
  const today = Temporal.Now.plainDateISO().toString();
  const [selection, setSelection] = useState<{ month: string; date: string }>(() => ({ month, date: month === today.slice(0, 7) ? today : `${month}-01` }));
  const selectedDate = selection.month === month ? selection.date : month === today.slice(0, 7) ? today : `${month}-01`;
  const [filters, setFilters] = useState<Filters>(() => {
    if (typeof window === "undefined") return EMPTY_FILTERS;
    try { return { ...EMPTY_FILTERS, ...JSON.parse(window.localStorage.getItem(FILTER_STORAGE_KEY) ?? "{}") }; } catch { return EMPTY_FILTERS; }
  });
  const [editing, setEditing] = useState<Shift | null | "new">(null);
  const [copyOpen, setCopyOpen] = useState(false);
  const barById = useMemo(() => new Map(bars.map((bar) => [bar.id, bar])), [bars]);
  const employeeById = useMemo(() => new Map(employees.map((employee) => [employee.id, employee])), [employees]);
  const warningShiftIds = useMemo(() => new Set(warnings.flatMap((warning) => warning.shiftIds ?? [])), [warnings]);
  const roles = useMemo(() => [...new Set([...employees.flatMap((employee) => employee.roles), ...shifts.map((shift) => shift.role).filter((role): role is string => Boolean(role))])].sort(), [employees, shifts]);
  const currentMonthShifts = shifts.filter((shift) => shift.date.startsWith(`${month}-`));
  const selectedShifts = currentMonthShifts.filter((shift) => shift.date === selectedDate).filter((shift) => matchesFilters(shift, filters, warnings));
  const weekStart = startOfWeek(selectedDate);
  const weekEmployees = employees.filter((employee) => employee.active).map((employee) => ({ employee, hours: weeklyHoursFor(employee.id, weekStart, shifts, bars) })).sort((a, b) => b.hours - a.hours);
  const totalWeekHours = weekEmployees.reduce((total, item) => total + item.hours, 0);

  useEffect(() => { window.localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(filters)); }, [filters]);

  function shiftWarnings(shift: Shift) { return warnings.filter((warning) => warning.shiftIds?.includes(shift.id) || (warning.date === shift.date && warning.barId === shift.bar_id)); }
  function getVisibleShifts(date: string) { return currentMonthShifts.filter((shift) => shift.date === date && matchesFilters(shift, filters, warnings)); }
  function getDayWarnings(date: string) { return warnings.filter((warning) => warning.date === date); }

  const { first, dayCount } = monthBounds(month);
  const leading = weekdayForDate(first) - 1;
  const gridDays = [...Array.from({ length: leading }, () => null), ...Array.from({ length: dayCount }, (_, index) => addDays(first, index))];
  const rolesForShifts = roles;
  const allSkills = [...new Set(employees.flatMap((employee) => employee.skills))].sort();

  return <div className="page-stack schedule-page">
    <div className="page-heading schedule-heading"><div><p className="eyebrow">PLAN YOUR TEAM</p><h1>{formatMonth(month)}</h1><p className="muted">Build a month that works for your team and every venue.</p></div><div className="schedule-heading-actions">
      <button className="button button-secondary" onClick={() => setCopyOpen(true)}><Copy size={16} /><span>Copy month</span></button>
      {schedule ? <span className="draft-badge"><span />Draft</span> : <button className="button button-primary" onClick={() => void onEnsureSchedule()} disabled={!bars.length || busy}><Plus size={16} />Create schedule</button>}
    </div></div>
    <div className="calendar-toolbar"><div className="month-navigation"><button className="icon-button" aria-label="Previous month" onClick={() => setMonth(moveMonth(month, -1))}><ChevronLeft size={19} /></button><button className="month-label" onClick={() => setMonth(monthOfToday())}>{formatMonth(month)}</button><button className="icon-button" aria-label="Next month" onClick={() => setMonth(moveMonth(month, 1))}><ChevronRight size={19} /></button><button className="button button-subtle button-small today-button" onClick={() => setMonth(monthOfToday())}>Today</button></div>
      <div className="scheduled-summary"><span><strong>{currentMonthShifts.length}</strong> shifts</span><span className="summary-separator">·</span><span><strong>{formatHours(totalWeekHours)}</strong> this week</span><span className="summary-separator">·</span><span className={currentMonthShifts.some((shift) => !shift.employee_id) ? "text-warning" : ""}><strong>{currentMonthShifts.filter((shift) => !shift.employee_id).length}</strong> unassigned</span></div>
    </div>
    <div className="filter-bar" aria-label="Schedule filters">
      <label className="filter-select"><span>Venue</span><select value={filters.bar} onChange={(event) => setFilters({ ...filters, bar: event.target.value })}><option value="all">All venues</option>{bars.map((bar) => <option key={bar.id} value={bar.id}>{bar.name}</option>)}</select></label>
      <label className="filter-select"><span>Employee</span><select value={filters.employee} onChange={(event) => setFilters({ ...filters, employee: event.target.value })}><option value="all">All employees</option>{employees.filter((item) => item.active).map((employee) => <option key={employee.id} value={employee.id}>{employee.full_name}</option>)}</select></label>
      <label className="filter-select"><span>Role</span><select value={filters.role} onChange={(event) => setFilters({ ...filters, role: event.target.value })}><option value="all">All roles</option>{rolesForShifts.map((role) => <option key={role} value={role}>{role}</option>)}</select></label>
      <label className="filter-select"><span>Assignment</span><select value={filters.assignment} onChange={(event) => setFilters({ ...filters, assignment: event.target.value })}><option value="all">Everyone</option><option value="assigned">Assigned</option><option value="unassigned">Unassigned</option></select></label>
      <label className={`filter-check ${filters.warnings ? "checked" : ""}`}><input type="checkbox" checked={filters.warnings} onChange={(event) => setFilters({ ...filters, warnings: event.target.checked })} /><AlertTriangle size={15} />Warnings</label>
      {(filters.bar !== "all" || filters.employee !== "all" || filters.role !== "all" || filters.assignment !== "all" || filters.warnings) && <button className="text-button clear-filters" onClick={() => setFilters(EMPTY_FILTERS)}><X size={14} />Clear</button>}
    </div>
    {!bars.length && <div className="inline-notice"><StoreIcon /><span>Add a bar before creating your first shift. Opening hours help surface scheduling issues.</span></div>}
    {bars.length > 0 && <>
      <section className="calendar-surface surface" aria-label={`${formatMonth(month)} calendar`}>
        <div className="calendar-grid desktop-calendar">
          {DOW_LABELS.map((day) => <div className="calendar-weekday" key={day}>{day}</div>)}
          {gridDays.map((date, index) => date ? <CalendarDay key={date} date={date} selected={selectedDate === date} isToday={today === date} shifts={getVisibleShifts(date)} barById={barById} employeeById={employeeById} warningShiftIds={warningShiftIds} dayWarning={getDayWarnings(date).length > 0} onClick={() => setSelection({ month, date })} /> : <div className="calendar-blank" key={`blank-${index}`} />)}
        </div>
        <div className="mobile-agenda">
          {gridDays.filter((date): date is string => Boolean(date)).map((date) => <button className={`mobile-day-row ${selectedDate === date ? "selected" : ""} ${date === today ? "today" : ""}`} key={date} onClick={() => setSelection({ month, date })}><div className="mobile-day-date"><span>{new Intl.DateTimeFormat("en", { weekday: "short", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`))}</span><strong>{Number(date.slice(-2))}</strong></div><div className="mobile-day-shifts">{getVisibleShifts(date).length ? getVisibleShifts(date).slice(0, 2).map((shift) => <span className={`mobile-shift-chip ${!shift.employee_id ? "unassigned" : ""}`} key={shift.id}><b>{shift.start_time}</b>{employeeById.get(shift.employee_id ?? "")?.full_name ?? "Unassigned"} · {barById.get(shift.bar_id)?.name}</span>) : <span className="mobile-no-shifts">No shifts</span>}{getVisibleShifts(date).length > 2 && <span className="mobile-more">+{getVisibleShifts(date).length - 2} more</span>}</div><div className="mobile-day-trailing">{getDayWarnings(date).length > 0 && <span className="warning-dot" />}{getVisibleShifts(date).length === 0 && <ChevronRight size={16} />}</div></button>)}
        </div>
      </section>
      <div className="schedule-detail-layout">
        <section className="surface day-detail-panel"><div className="section-head day-panel-head"><div><p className="eyebrow">DAY DETAIL</p><h2>{formatDate(selectedDate)}</h2><p>{selectedShifts.length} {selectedShifts.length === 1 ? "shift" : "shifts"}{getDayWarnings(selectedDate).length > 0 && <span className="inline-warning-count"><AlertTriangle size={13} />{getDayWarnings(selectedDate).length} {getDayWarnings(selectedDate).length === 1 ? "warning" : "warnings"}</span>}</p></div><button className="button button-primary button-small" onClick={() => setEditing("new")} disabled={busy}><Plus size={16} />Add shift</button></div>
          {getDayWarnings(selectedDate).filter((warning) => !warning.shiftIds?.length).map((warning) => <div className={`day-warning-note ${warning.severity}`} key={warning.id}><AlertTriangle size={15} /><span>{warning.message}</span></div>)}
          {selectedShifts.length ? <div className="day-shift-list">{selectedShifts.sort((a, b) => a.start_time.localeCompare(b.start_time)).map((shift) => <ShiftRow key={shift.id} shift={shift} bar={barById.get(shift.bar_id)} employee={employeeById.get(shift.employee_id ?? "")} warnings={shiftWarnings(shift)} onClick={() => setEditing(shift)} />)}</div> : <div className="empty-day"><div className="empty-icon-small"><CalendarDays size={18} /></div><strong>{filters.warnings ? "No warnings on this day" : "No shifts planned"}</strong><span>{filters.assignment === "unassigned" ? "No unassigned shifts match these filters." : "Add a shift or choose another day."}</span><button className="text-button" onClick={() => setEditing("new")}><Plus size={15} />Add a shift</button></div>}
        </section>
        <aside className="surface weekly-hours-panel"><div className="section-head"><div><p className="eyebrow">WEEK OF {new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${weekStart}T12:00:00Z`)).toUpperCase()}</p><h2>Team hours</h2></div><span className="hours-total-pill">{formatHours(totalWeekHours)}</span></div>
          {weekEmployees.length ? <div className="week-hours-list">{weekEmployees.map(({ employee, hours }) => {
            const max = employee.max_weekly_hours;
            const over = max !== null && hours > max;
            const progress = max !== null ? (max > 0 ? Math.min(100, Math.max(hours / max * 100, hours > 0 ? 3 : 0)) : hours > 0 ? 100 : 0) : Math.min(100, hours / 40 * 100);
            return <div className="week-hours-row" key={employee.id}><div className="week-hours-person"><strong>{employee.full_name}</strong><span>{formatHours(hours)}{max !== null ? ` / ${formatHours(max)}${hours < max ? ` · ${formatHours(max - hours)} left` : ""}` : " this week"}</span></div><div className={`hours-meter ${over ? "over" : ""}`}><span style={{ width: `${progress}%` }} /></div>{over && <small className="hours-warning">{formatHours(hours - max!)} over maximum</small>}</div>;
          })}</div> : <div className="empty-inline"><span>Add employees to see weekly hours here.</span></div>}
          <p className="hours-footnote">Overnight shifts count in full in the week they start. Breaks are not deducted.</p>
        </aside>
      </div>
    </>}
    {editing !== null && bars.length > 0 && <ShiftEditor shift={editing === "new" ? null : editing} initialDate={selectedDate} bars={bars} employees={employees} shifts={shifts} requirements={requirements} warnings={warnings} skills={allSkills} busy={busy} onClose={() => setEditing(null)} onSave={async (input, id) => { await onSaveShift(input, id); setEditing(null); }} onDelete={async (id) => { await onDeleteShift(id); setEditing(null); }} />}
    {copyOpen && <CopyMonthDialog currentMonth={month} shifts={currentMonthShifts} busy={busy} onClose={() => setCopyOpen(false)} onCopy={async (source, target, replace) => { await onCopyMonth(source, target, replace); setCopyOpen(false); }} />}
  </div>;
}

function CalendarDay({ date, selected, isToday, shifts, barById, employeeById, warningShiftIds, dayWarning, onClick }: { date: string; selected: boolean; isToday: boolean; shifts: Shift[]; barById: Map<string, Bar>; employeeById: Map<string, Employee>; warningShiftIds: Set<string>; dayWarning: boolean; onClick: () => void }) {
  const dayNum = Number(date.slice(-2));
  return <button className={`calendar-day ${selected ? "selected" : ""} ${isToday ? "today" : ""} ${dayWarning ? "has-warning" : ""}`} onClick={onClick} aria-label={`${formatDate(date)}, ${shifts.length} shifts`}>
    <span className="calendar-date">{dayNum}{isToday && <i>Today</i>}{dayWarning && <span className="warning-dot" />}</span>
    <span className="calendar-shifts">{shifts.slice(0, 3).map((shift) => <span className={`calendar-shift ${!shift.employee_id ? "unassigned" : ""} ${warningShiftIds.has(shift.id) ? "conflicted" : ""}`} key={shift.id}><span className="calendar-shift-time">{shift.start_time}</span><span className="calendar-shift-name">{employeeById.get(shift.employee_id ?? "")?.full_name ?? "Unassigned"}</span><span className="calendar-shift-bar">{barById.get(shift.bar_id)?.name}</span></span>)}{shifts.length > 3 && <span className="more-shifts">+{shifts.length - 3} more</span>}</span>
  </button>;
}

function ShiftRow({ shift, bar, employee, warnings, onClick }: { shift: Shift; bar?: Bar; employee?: Employee; warnings: ScheduleWarning[]; onClick: () => void }) {
  return <button className={`shift-row ${shift.employee_id ? "" : "shift-row-unassigned"} ${warnings.some((warning) => warning.severity === "critical") ? "shift-row-critical" : warnings.length ? "shift-row-warning" : ""}`} onClick={onClick}>
    <div className="shift-row-time"><strong>{shift.start_time}</strong><span>to {shift.end_time}{shift.end_time <= shift.start_time && <i>+1 day</i>}</span></div><div className="shift-row-main"><div><strong>{employee?.full_name ?? "Unassigned"}</strong>{!employee && <span className="unassigned-pill">Unassigned</span>}</div><span>{bar?.name ?? "Venue"}{shift.role ? ` · ${shift.role}` : ""}</span>{shift.required_skills && shift.required_skills.length > 0 && <div className="shift-skills">{shift.required_skills.map((skill) => <small key={skill}>{skill}</small>)}</div>}</div>
    <div className="shift-row-meta"><span className="duration-pill">{formatHours(durationHours(shift, bar?.time_zone ?? DEFAULT_TIME_ZONE))}</span>{warnings.length > 0 && <span className={`warning-count ${warnings.some((warning) => warning.severity === "critical") ? "critical" : ""}`}><AlertTriangle size={14} />{warnings.length}</span>}<ChevronRight size={17} /></div>
  </button>;
}

function ShiftEditor({ shift, initialDate, bars, employees, shifts, requirements, warnings, skills, busy, onClose, onSave, onDelete }: {
  shift: Shift | null;
  initialDate: string;
  bars: Bar[];
  employees: Employee[];
  shifts: Shift[];
  requirements: StaffingRequirement[];
  warnings: ScheduleWarning[];
  skills: string[];
  busy: boolean;
  onClose: () => void;
  onSave: (input: ShiftInput, id?: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [date, setDate] = useState(shift?.date ?? initialDate);
  const [barId, setBarId] = useState(shift?.bar_id ?? bars[0]?.id ?? "");
  const [start, setStart] = useState(shift?.start_time ?? "18:00");
  const [end, setEnd] = useState(shift?.end_time ?? "02:00");
  const [employeeId, setEmployeeId] = useState(shift?.employee_id ?? "");
  const [role, setRole] = useState(shift?.role ?? "");
  const [requiredSkills, setRequiredSkills] = useState<string[]>(shift?.required_skills ?? []);
  const [status, setStatus] = useState<Shift["status"]>(shift?.status ?? "scheduled");
  const [notes, setNotes] = useState(shift?.notes ?? "");
  const [candidateMode, setCandidateMode] = useState(false);
  const [removeConfirm, setRemoveConfirm] = useState(false);
  const [error, setError] = useState("");
  const bar = bars.find((item) => item.id === barId);
  const draft = { id: shift?.id ?? "draft", schedule_id: shift?.schedule_id ?? "", bar_id: barId, date, start_time: start, end_time: end, employee_id: employeeId || null, role: role.trim() || null, required_skills: requiredSkills, status, notes: notes.trim() || null } as Shift;
  const duration = date && start && end && start !== end ? durationHours(draft, bar?.time_zone ?? DEFAULT_TIME_ZONE) : null;
  const currentWarnings = shift ? warnings.filter((warning) => warning.shiftIds?.includes(shift.id)) : [];
  const candidates = date && start && end && start !== end ? replacementCandidates({ bars, employees, shifts, requirements, month: date.slice(0, 7) }, draft) : [];

  function toggleSkill(skill: string) { setRequiredSkills((current) => current.includes(skill) ? current.filter((item) => item !== skill) : [...current, skill]); }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (start === end) { setError("Start and end times must be different."); return; }
    await onSave({ date, start_time: start, end_time: end, bar_id: barId, employee_id: employeeId || null, role: role.trim() || null, required_skills: requiredSkills, status, notes: notes.trim() || null }, shift?.id);
  }

  const activeEmployees = employees.filter((employee) => employee.active);

  return <Dialog title={candidateMode ? "Choose a replacement" : shift ? "Edit shift" : "Add a shift"} subtitle={candidateMode ? "Candidates are ranked by availability, skills, hours, and conflicts." : "Leave the employee unassigned if you want to fill this shift later."} onClose={onClose} size="large" footer={candidateMode ? <button className="button button-secondary" onClick={() => setCandidateMode(false)}><ArrowLeft size={16} />Back to shift</button> : <><div className="dialog-footer-left">{shift && <button className="button button-subtle danger-text" type="button" onClick={() => setRemoveConfirm(true)}><Trash2 size={15} />Remove shift</button>}</div><button className="button button-secondary" type="button" onClick={onClose}>Cancel</button><button className="button button-primary" form="shift-form" disabled={busy}>{busy ? <span className="spinner" /> : shift ? "Save changes" : "Add shift"}</button></>}>
    {candidateMode ? <div className="candidate-list">{candidates.length ? candidates.map((candidate) => <CandidateRow key={candidate.employee.id} candidate={candidate} bars={bars} selected={candidate.employee.id === employeeId} onChoose={() => { setEmployeeId(candidate.employee.id); setCandidateMode(false); }} />) : <div className="empty-inline"><UsersRound size={22} /><strong>No active candidates</strong><span>Add active employees to see replacement options.</span></div>}</div> : <form id="shift-form" className="form-stack shift-form" onSubmit={submit}>
      <div className="form-two-col"><label>Date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} required /></label><label>Venue<select value={barId} onChange={(event) => setBarId(event.target.value)} required>{bars.map((item) => <option value={item.id} key={item.id}>{item.name} · {item.opening_time}–{item.closing_time}</option>)}</select></label></div>
      <div className="form-two-col"><label>Starts<input type="time" value={start} onChange={(event) => setStart(event.target.value)} required /></label><label>Ends<input type="time" value={end} onChange={(event) => setEnd(event.target.value)} required /></label></div>
      <div className="shift-duration-hint"><Clock3 size={15} />{duration !== null ? <span>{formatHours(duration)} total{end <= start ? " · ends the next day" : ""}{bar && ` · ${bar.time_zone}`}</span> : <span>Choose different start and end times.</span>}</div>
      <div className="assignment-field"><label>Employee<select value={employeeId} onChange={(event) => setEmployeeId(event.target.value)}><option value="">Unassigned</option>{activeEmployees.map((employee) => <option value={employee.id} key={employee.id}>{employee.full_name}</option>)}</select></label><button className="button button-secondary replace-button" type="button" onClick={() => setCandidateMode(true)}><ArrowLeftRight size={15} />{shift?.employee_id ? "Replace" : "Find employee"}</button></div>
      <div className="form-two-col"><label>Role / function <span className="optional-label">Optional</span><input list="shift-roles" value={role} onChange={(event) => setRole(event.target.value)} placeholder="e.g. Bartender" /><datalist id="shift-roles">{[...new Set(employees.flatMap((employee) => employee.roles))].map((item) => <option key={item} value={item} />)}</datalist></label><label>Status<select value={status} onChange={(event) => setStatus(event.target.value as Shift["status"])}><option value="scheduled">Scheduled</option><option value="tentative">Tentative</option></select></label></div>
      {skills.length > 0 && <div><span className="input-label">Required skills <span className="optional-label">Optional</span></span><div className="check-chip-list small-check-chips">{skills.map((skill) => <label className={`check-chip ${requiredSkills.includes(skill) ? "checked" : ""}`} key={skill}><input type="checkbox" checked={requiredSkills.includes(skill)} onChange={() => toggleSkill(skill)} /><span className="custom-check">{requiredSkills.includes(skill) && <Check size={12} />}</span>{skill}</label>)}</div></div>}
      <label>Notes <span className="optional-label">Optional</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} placeholder="Add a note for the manager…" /></label>
      {shift && currentWarnings.length > 0 && <div className="shift-warning-box"><AlertTriangle size={16} /><div><strong>{currentWarnings.length} {currentWarnings.length === 1 ? "warning" : "warnings"} on this shift</strong>{currentWarnings.map((warning) => <p key={warning.id}>{warning.message}</p>)}</div></div>}
      {error && <p className="form-error" role="alert">{error}</p>}
    </form>}
    {removeConfirm && <div className="nested-confirm"><div><strong>Remove this shift?</strong><span>The assignment and shift details will be deleted.</span></div><button className="button button-secondary button-small" onClick={() => setRemoveConfirm(false)}>Keep shift</button><button className="button button-danger button-small" disabled={busy} onClick={() => { if (shift) void onDelete(shift.id); }}>Remove</button></div>}
  </Dialog>;
}

function CandidateRow({ candidate, bars, selected, onChoose }: { candidate: CandidateEvaluation; bars: Bar[]; selected: boolean; onChoose: () => void }) {
  const overlapBarNames = [...new Set(candidate.overlapShifts.map((shift) => bars.find((bar) => bar.id === shift.bar_id)?.name).filter(Boolean))];
  const overHours = candidate.maxWeeklyHours !== null && candidate.weeklyHours > candidate.maxWeeklyHours;
  const clear = candidate.overlapShifts.length === 0 && candidate.availability === "available" && !overHours && candidate.barMatch;
  const availabilityLabel = candidate.availability === "available" ? "Available" : candidate.availability === "unspecified" ? "No availability limits" : "Outside availability";
  return <article className={`candidate-card ${clear ? "candidate-clear" : ""} ${selected ? "selected" : ""}`}>
    <div className="candidate-avatar">{candidate.employee.full_name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</div>
    <div className="candidate-main"><div className="candidate-title"><strong>{candidate.employee.full_name}</strong><span className={`candidate-availability ${clear ? "good" : "warning"}`}>{clear && <Check size={13} />}{availabilityLabel}</span></div><div className="candidate-meta">{candidate.employee.roles.join(" · ") || "Role not set"}{candidate.roleMatch ? "" : " · Role differs"}{!candidate.barMatch && " · Not linked to this venue"}</div><div className="candidate-stats"><span className={candidate.missingSkills.length ? "candidate-warn-text" : ""}>{candidate.missingSkills.length ? `Missing: ${candidate.missingSkills.join(", ")}` : candidate.employee.skills.length ? "Skills match" : "Skills not listed"}</span><span className={overHours ? "candidate-warn-text" : ""}>{formatHours(candidate.weeklyHours)}{candidate.maxWeeklyHours !== null ? ` / ${formatHours(candidate.maxWeeklyHours)}` : " this week"}{overHours && " · over limit"}</span></div>
      {candidate.overlapShifts.length > 0 && <div className="candidate-conflict"><AlertTriangle size={13} />Overlaps at {overlapBarNames.join(", ") || "another venue"}</div>}</div>
    <button className={`button ${selected ? "button-secondary" : "button-primary"} button-small`} onClick={onChoose}>{selected ? "Selected" : "Choose"}</button>
  </article>;
}

function CopyMonthDialog({ currentMonth, shifts, busy, onClose, onCopy }: { currentMonth: string; shifts: Shift[]; busy: boolean; onClose: () => void; onCopy: (source: string, target: string, replace: boolean) => Promise<void> }) {
  const [source, setSource] = useState(moveMonth(currentMonth, -1));
  const [confirmReplace, setConfirmReplace] = useState(false);
  const hasExisting = shifts.length > 0;
  const monthOptions = Array.from({ length: 18 }, (_, index) => moveMonth(currentMonth, -(index + 1)));
  return <Dialog title={confirmReplace ? "Replace this month’s shifts?" : "Copy a month"} subtitle={confirmReplace ? `${formatMonth(currentMonth)} already has ${shifts.length} shifts.` : "Bring an earlier schedule into this month, then make your changes."} onClose={onClose} footer={confirmReplace ? <><button className="button button-secondary" onClick={() => setConfirmReplace(false)}>Go back</button><button className="button button-danger" disabled={busy} onClick={() => void onCopy(source, currentMonth, true)}>{busy ? <span className="spinner" /> : "Replace and copy"}</button></> : <><button className="button button-secondary" onClick={onClose}>Cancel</button><button className="button button-primary" disabled={busy || source === currentMonth} onClick={() => { if (hasExisting) setConfirmReplace(true); else void onCopy(source, currentMonth, false); }}>{busy ? <span className="spinner" /> : "Copy into this month"}</button></>}>
    {confirmReplace ? <div className="replace-warning"><AlertTriangle size={20} /><p>All shifts currently in <strong>{formatMonth(currentMonth)}</strong> will be removed and replaced with shifts from <strong>{formatMonth(source)}</strong>. This cannot be undone.</p></div> : <div className="form-stack"><label>Copy shifts from<select value={source} onChange={(event) => setSource(event.target.value)}>{monthOptions.map((option) => <option key={option} value={option}>{formatMonth(option)}</option>)}</select></label><div className="copy-preview"><Copy size={17} /><div><strong>Assignments come along too</strong><span>Copied shifts remain editable, including employee assignments and times.</span></div></div>{hasExisting && <p className="field-hint">This month has shifts already. You’ll be asked to confirm before replacing them.</p>}</div>}
  </Dialog>;
}

function matchesFilters(shift: Shift, filters: Filters, warnings: ScheduleWarning[]): boolean {
  if (filters.bar !== "all" && shift.bar_id !== filters.bar) return false;
  if (filters.employee !== "all" && shift.employee_id !== filters.employee) return false;
  if (filters.assignment === "assigned" && !shift.employee_id) return false;
  if (filters.assignment === "unassigned" && shift.employee_id) return false;
  if (filters.role !== "all" && shift.role !== filters.role) return false;
  if (filters.warnings && !warnings.some((warning) => warning.shiftIds?.includes(shift.id) || (warning.date === shift.date && warning.barId === shift.bar_id))) return false;
  return true;
}

function monthOfToday(): string { return Temporal.Now.plainDateISO().toString().slice(0, 7); }
function StoreIcon() { return <Search size={16} />; }

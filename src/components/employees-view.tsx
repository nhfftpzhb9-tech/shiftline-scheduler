"use client";

import { useState, type FormEvent } from "react";
import { Check, ChevronRight, Mail, Phone, Plus, RotateCcw, UserRound, UserRoundX } from "lucide-react";
import type { AvailabilityDay, Bar, Employee, Shift, WeeklyAvailability, Weekday } from "@/lib/domain/types";
import { WEEKDAY_LABELS } from "@/lib/domain/types";
import { monthlyHoursFor } from "@/lib/domain/rules";
import { formatHours } from "@/lib/domain/time";
import { Dialog } from "@/components/ui";
import type { EmployeeInput } from "@/lib/data/repository";

const DAYS: Weekday[] = [1, 2, 3, 4, 5, 6, 7];

export function EmployeesView({ employees, bars, shifts, month, busy, onSave, onSetActive }: {
  employees: Employee[];
  bars: Bar[];
  shifts: Shift[];
  month: string;
  busy: boolean;
  onSave: (input: EmployeeInput, id?: string) => Promise<void>;
  onSetActive: (id: string, active: boolean) => Promise<void>;
}) {
  const [includeInactive, setIncludeInactive] = useState(false);
  const [editing, setEditing] = useState<Employee | null | "new">(null);
  const visible = employees.filter((employee) => includeInactive || employee.active);
  const barById = new Map(bars.map((bar) => [bar.id, bar]));

  async function submit(input: EmployeeInput) {
    await onSave(input, editing && editing !== "new" ? editing.id : undefined);
    setEditing(null);
  }

  return <div className="page-stack">
    <div className="page-heading heading-with-action"><div><p className="eyebrow">THE PEOPLE BEHIND THE SHIFT</p><h1>Employees</h1><p className="muted">Keep staff details together. Most information is optional.</p></div><div className="heading-actions"><button className={`button button-secondary ${includeInactive ? "selected" : ""}`} onClick={() => setIncludeInactive(!includeInactive)}>{includeInactive ? "Hide inactive" : "Show inactive"}</button><button className="button button-primary" onClick={() => setEditing("new")}><Plus size={17} />Add employee</button></div></div>
    <div className="employee-summary-line"><span>{employees.filter((employee) => employee.active).length} active employees</span><span className="summary-separator">·</span><span>Scheduled in {new Intl.DateTimeFormat("en", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T12:00:00Z`))}</span></div>
    {visible.length ? <div className="employee-list">{visible.map((employee) => {
      const hours = monthlyHoursFor(employee.id, month, shifts, bars);
      return <article className={`employee-card ${employee.active ? "" : "inactive"}`} key={employee.id}>
        <div className="employee-avatar">{employee.full_name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</div>
        <div className="employee-main"><div className="employee-name-line"><h2>{employee.full_name}</h2>{!employee.active && <span className="inactive-pill">Inactive</span>}</div>
          <div className="employee-meta">{employee.roles.length ? <span>{employee.roles.join(" · ")}</span> : <span className="muted">Role not set</span>}{employee.contract_type && <><span className="meta-divider">·</span><span>{employee.contract_type}</span></>}</div>
          <div className="skill-list">{employee.skills.slice(0, 4).map((skill) => <span className="skill-tag" key={skill}>{skill}</span>)}{employee.skills.length > 4 && <span className="skill-more">+{employee.skills.length - 4}</span>}</div>
          <div className="employee-contact">{employee.email && <span><Mail size={13} />{employee.email}</span>}{employee.phone && <span><Phone size={13} />{employee.phone}</span>}{employee.bar_ids.length > 0 && <span>{employee.bar_ids.map((id) => barById.get(id)?.name).filter(Boolean).join(", ")}</span>}</div>
        </div>
        <div className="employee-hours"><span>{formatHours(hours)}</span><small>this month</small>{employee.max_weekly_hours !== null && <small>Max {formatHours(employee.max_weekly_hours)}/wk</small>}</div>
        <div className="employee-actions"><button className="button button-secondary button-small" onClick={() => setEditing(employee)}>Edit</button><button className="icon-button" aria-label={`${employee.active ? "Deactivate" : "Reactivate"} ${employee.full_name}`} title={employee.active ? "Move to inactive" : "Reactivate"} onClick={() => void onSetActive(employee.id, !employee.active)}>{employee.active ? <UserRoundX size={17} /> : <RotateCcw size={17} />}</button><ChevronRight className="employee-chevron" size={17} /></div>
      </article>;
    })}</div> : <div className="empty-state surface"><div className="empty-icon"><UserRound size={23} /></div><h2>No employees yet</h2><p>Add your team, then assign them to one or more bars.</p><button className="button button-primary" onClick={() => setEditing("new")}><Plus size={17} />Add employee</button></div>}
    {editing !== null && <EmployeeEditor employee={editing === "new" ? null : editing} bars={bars} busy={busy} onClose={() => setEditing(null)} onSubmit={submit} />}
  </div>;
}

function EmployeeEditor({ employee, bars, busy, onClose, onSubmit }: { employee: Employee | null; bars: Bar[]; busy: boolean; onClose: () => void; onSubmit: (input: EmployeeInput) => Promise<void> }) {
  const [fullName, setFullName] = useState(employee?.full_name ?? "");
  const [email, setEmail] = useState(employee?.email ?? "");
  const [phone, setPhone] = useState(employee?.phone ?? "");
  const [roles, setRoles] = useState(employee?.roles.join(", ") ?? "");
  const [skills, setSkills] = useState(employee?.skills.join(", ") ?? "");
  const [maxHours, setMaxHours] = useState(employee?.max_weekly_hours?.toString() ?? "");
  const [contractType, setContractType] = useState(employee?.contract_type ?? "");
  const [barIds, setBarIds] = useState(employee?.bar_ids ?? []);
  const [availability, setAvailability] = useState<WeeklyAvailability>(employee?.availability ?? {});
  const [error, setError] = useState("");

  function updateDay(day: Weekday, status: string, field?: "start" | "end", value?: string) {
    setAvailability((current) => {
      const next = { ...current };
      if (!status) { delete next[day]; return next; }
      const existing = next[day] ?? { status: "available" as const };
      const updated: AvailabilityDay = { ...existing, status: status as AvailabilityDay["status"] };
      if (field) updated[field] = value ?? "";
      if (status !== "limited") { delete updated.start; delete updated.end; }
      else { updated.start ||= "18:00"; updated.end ||= "23:00"; }
      next[day] = updated;
      return next;
    });
  }

  function toggleBar(id: string) { setBarIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]); }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!fullName.trim()) { setError("Enter the employee’s full name."); return; }
    const max = maxHours.trim() ? Number(maxHours) : null;
    if (max !== null && (!Number.isFinite(max) || max < 0)) { setError("Maximum weekly hours must be a positive number."); return; }
    if (Object.values(availability).some((day) => day?.status === "limited" && (!day.start || !day.end || day.start >= day.end))) {
      setError("For each limited day, the available end time must be later than the start time."); return;
    }
    await onSubmit({
      full_name: fullName.trim(), email: email.trim() || null, phone: phone.trim() || null,
      roles: roles.split(",").map((value) => value.trim()).filter(Boolean), skills: skills.split(",").map((value) => value.trim()).filter(Boolean),
      availability, max_weekly_hours: max, contract_type: contractType.trim() || null, active: employee?.active ?? true, bar_ids: barIds,
    });
  }

  return <Dialog title={employee ? "Edit employee" : "Add employee"} subtitle="Add the details that help you plan. You can leave anything unused blank." onClose={onClose} size="large" footer={<><button className="button button-secondary" type="button" onClick={onClose}>Cancel</button><button className="button button-primary" form="employee-form" disabled={busy}>{busy ? <span className="spinner" /> : employee ? "Save employee" : "Add employee"}</button></>}>
    <form id="employee-form" className="form-stack" onSubmit={submit}>
      <div className="form-section"><div className="form-section-head"><strong>Basics</strong><span>Required: full name</span></div>
        <label>Full name<input autoFocus value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="e.g. Alex Morgan" required maxLength={120} /></label>
        <div className="form-two-col"><label>Email address <span className="optional-label">Optional</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="alex@example.com" /></label><label>Phone number <span className="optional-label">Optional</span><input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+31 6 1234 5678" /></label></div>
      </div>
      <div className="form-section"><div className="form-section-head"><strong>Work details</strong><span>Use commas to add more than one</span></div>
        <div className="form-two-col"><label>Roles<input value={roles} onChange={(event) => setRoles(event.target.value)} placeholder="Bartender, Server" /></label><label>Skills<input value={skills} onChange={(event) => setSkills(event.target.value)} placeholder="Cocktails, Cash register, Closing" /></label></div>
        <div className="form-two-col"><label>Maximum weekly hours <span className="optional-label">Optional</span><input type="number" min="0" max="168" step="0.5" value={maxHours} onChange={(event) => setMaxHours(event.target.value)} placeholder="40" /></label><label>Contract type <span className="optional-label">Optional</span><input value={contractType} onChange={(event) => setContractType(event.target.value)} placeholder="Part-time, Full-time…" /></label></div>
      </div>
      {bars.length > 0 && <div className="form-section"><div className="form-section-head"><strong>Works at</strong><span>Choose any bars</span></div><div className="check-chip-list">{bars.map((bar) => <label className={`check-chip ${barIds.includes(bar.id) ? "checked" : ""}`} key={bar.id}><input type="checkbox" checked={barIds.includes(bar.id)} onChange={() => toggleBar(bar.id)} /><span className="custom-check">{barIds.includes(bar.id) && <Check size={13} />}</span>{bar.name}</label>)}</div></div>}
      <div className="form-section availability-section"><div className="form-section-head"><strong>Availability</strong><span>Leave a day blank if it has no restriction</span></div>
        {DAYS.map((day) => {
          const selected = availability[day]?.status ?? "";
          return <div className="availability-row" key={day}><span>{WEEKDAY_LABELS[day]}</span><select aria-label={`${WEEKDAY_LABELS[day]} availability`} value={selected} onChange={(event) => updateDay(day, event.target.value)}><option value="">No restriction</option><option value="available">Available all day</option><option value="limited">Available between</option><option value="unavailable">Unavailable</option></select>{selected === "limited" ? <div className="availability-times"><input type="time" aria-label={`${WEEKDAY_LABELS[day]} available from`} value={availability[day]?.start ?? "18:00"} onChange={(event) => updateDay(day, selected, "start", event.target.value)} /><span>to</span><input type="time" aria-label={`${WEEKDAY_LABELS[day]} available until`} value={availability[day]?.end ?? "23:00"} onChange={(event) => updateDay(day, selected, "end", event.target.value)} /></div> : <span className="availability-hint">{selected === "unavailable" ? "Unavailable" : selected === "available" ? "No restriction" : ""}</span>}</div>;
        })}
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
    </form>
  </Dialog>;
}

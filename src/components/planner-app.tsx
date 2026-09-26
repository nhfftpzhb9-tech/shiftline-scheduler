"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CalendarDays, Clock3, LayoutDashboard, LogOut, Settings2, Store, UsersRound, Wifi, WifiOff } from "lucide-react";
import { useWorkspace } from "@/hooks/use-workspace";
import { createClient } from "@/lib/supabase/client";
import { formatDate, formatMonth, isoNowDate } from "@/lib/domain/time";
import { evaluateSchedule } from "@/lib/domain/rules";
import { DEFAULT_RULE_SETTINGS, type Bar, type Employee, type ScheduleWarning, type Shift, type StaffingRequirement } from "@/lib/domain/types";
import { copyMonth, deleteBar, deleteRequirement, deleteShift, ensureSchedule, saveBar, saveEmployee, saveRequirement, saveRuleSettings, saveShift, setEmployeeActive, type EmployeeInput, type ShiftInput } from "@/lib/data/repository";
import { ScheduleView } from "@/components/schedule-view";
import { EmployeesView } from "@/components/employees-view";
import { BarsView } from "@/components/bars-view";
import { RulesView } from "@/components/rules-view";
import { ConfirmDialog, Toast, type ToastMessage } from "@/components/ui";

type Section = "overview" | "schedule" | "employees" | "bars" | "rules";
const NAV: { key: Section; label: string; icon: typeof LayoutDashboard }[] = [
  { key: "overview", label: "Overview", icon: LayoutDashboard },
  { key: "schedule", label: "Schedule", icon: CalendarDays },
  { key: "employees", label: "Employees", icon: UsersRound },
  { key: "bars", label: "Bars", icon: Store },
  { key: "rules", label: "Rules & settings", icon: Settings2 },
];

export function PlannerApp({ userId, userEmail }: { userId: string; userEmail: string }) {
  const router = useRouter();
  const workspace = useWorkspace(userId);
  const { data, month } = workspace;
  const [section, setSection] = useState<Section>("schedule");
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<{ title: string; message: string; action: () => Promise<void>; confirmLabel?: string } | null>(null);
  const warnings = useMemo(() => evaluateSchedule({ ...data, month }), [data, month]);
  const currentShifts = data.shifts.filter((shift) => shift.date.startsWith(`${month}-`));
  const unassigned = currentShifts.filter((shift) => !shift.employee_id);
  const activeEmployees = data.employees.filter((employee) => employee.active);
  const title = NAV.find((item) => item.key === section)?.label ?? "Schedule";

  async function perform(message: string, task: () => Promise<void>, quiet = false) {
    if (busy) return;
    setBusy(true);
    try {
      await task();
      await workspace.refresh(true);
      if (!quiet) setToast({ message, type: "success" });
    } catch (cause) {
      const text = cause instanceof Error ? cause.message : "That change could not be saved.";
      setToast({ message: text, type: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    await createClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  const handlers = {
    saveBar: (input: Omit<Bar, "id" | "metadata">, id?: string) => perform(id ? "Bar updated" : "Bar added", () => saveBar(createClient(), userId, input, id)),
    deleteBar: (id: string) => perform("Bar deleted", () => deleteBar(createClient(), id)),
    saveEmployee: (input: EmployeeInput, id?: string) => perform(id ? "Employee updated" : "Employee added", () => saveEmployee(createClient(), userId, input, id)),
    setEmployeeActive: (id: string, active: boolean) => perform(active ? "Employee reactivated" : "Employee moved to inactive", () => setEmployeeActive(createClient(), id, active)),
    saveShift: (input: ShiftInput, id?: string) => perform(id ? "Shift updated" : "Shift added", () => saveShift(createClient(), userId, input, id)),
    deleteShift: (id: string) => perform("Shift removed", () => deleteShift(createClient(), id)),
    ensureSchedule: () => perform("Schedule ready", async () => { await ensureSchedule(createClient(), userId, month); }),
    copyMonth: (source: string, target: string, replace: boolean) => perform("Schedule copied", async () => {
      const copied = await copyMonth(createClient(), source, target, replace);
      setToast({ message: `Copied ${copied} ${copied === 1 ? "shift" : "shifts"} into ${formatMonth(target)}.`, type: "success" });
    }, true),
    saveRequirement: (input: Omit<StaffingRequirement, "id">, id?: string) => perform(id ? "Requirement updated" : "Requirement added", () => saveRequirement(createClient(), userId, input, id)),
    deleteRequirement: (id: string) => perform("Requirement removed", () => deleteRequirement(createClient(), id)),
    saveSettings: (settings: typeof DEFAULT_RULE_SETTINGS) => perform("Warning settings saved", () => saveRuleSettings(createClient(), userEmail, settings)),
  };

  return <div className="app-frame">
    <aside className="sidebar">
      <div className="brand-lockup sidebar-brand"><div className="brand-mark">S</div><span>Shiftline</span><span className="brand-version">MVP</span></div>
      <div className="workspace-caption">WORKSPACE</div>
      <nav className="side-nav" aria-label="Main navigation">
        {NAV.map(({ key, label, icon: Icon }) => <button key={key} className={`nav-item ${section === key ? "active" : ""}`} onClick={() => setSection(key)}><Icon size={18} strokeWidth={1.8} /><span>{label}</span>{key === "schedule" && unassigned.length > 0 && <b className="nav-count">{unassigned.length}</b>}</button>)}
      </nav>
      <div className="sidebar-spacer" />
      <div className="profile-row"><div className="avatar">{userEmail.charAt(0).toUpperCase()}</div><div className="profile-copy"><strong>Manager</strong><span title={userEmail}>{userEmail}</span></div><button className="icon-button profile-menu" title="Sign out" onClick={signOut}><LogOut size={16} /></button></div>
    </aside>

    <div className="main-column">
      <header className="topbar">
        <div className="mobile-brand brand-lockup"><div className="brand-mark">S</div><span>Shiftline</span></div>
        <div className="breadcrumbs"><span>Workspace</span><span className="crumb-slash">/</span><strong>{title}</strong></div>
        <div className="topbar-right"><div className={`sync-state ${workspace.connected ? "online" : ""}`} title={workspace.connected ? "Live sync is connected" : "Connecting to live sync"}>{workspace.connected ? <Wifi size={15} /> : <WifiOff size={15} />}<span>{workspace.connected ? "Synced" : "Connecting"}</span></div><button className="avatar avatar-small" title={userEmail}>{userEmail.charAt(0).toUpperCase()}</button></div>
      </header>
      <main className="main-content">
        {workspace.error && <div className="error-banner" role="alert"><AlertTriangle size={17} /><span>{workspace.error}</span><button className="button button-subtle button-small" onClick={() => void workspace.refresh()}>Try again</button></div>}
        {workspace.loading && data.bars.length === 0 && data.employees.length === 0 ? <div className="loading-state"><span className="spinner spinner-dark" /><span>Loading your workspace…</span></div> : <>
          {section === "overview" && <OverviewView month={month} bars={data.bars} employees={activeEmployees} shifts={currentShifts} warnings={warnings} onNavigate={setSection} />}
          {section === "schedule" && <ScheduleView month={month} setMonth={workspace.setMonth} bars={data.bars} employees={data.employees} shifts={data.shifts} schedule={data.schedule} requirements={data.requirements} warnings={warnings} busy={busy} onSaveShift={handlers.saveShift} onDeleteShift={handlers.deleteShift} onEnsureSchedule={handlers.ensureSchedule} onCopyMonth={handlers.copyMonth} />}
          {section === "employees" && <EmployeesView employees={data.employees} bars={data.bars} shifts={data.shifts} month={month} busy={busy} onSave={handlers.saveEmployee} onSetActive={handlers.setEmployeeActive} />}
          {section === "bars" && <BarsView bars={data.bars} shifts={data.shifts} busy={busy} onSave={handlers.saveBar} onDelete={(bar) => setConfirm({ title: `Delete ${bar.name}?`, message: "This will also remove its shifts and staffing requirements. This action cannot be undone.", confirmLabel: "Delete bar", action: async () => { await handlers.deleteBar(bar.id); } })} />}
          {section === "rules" && <RulesView bars={data.bars} requirements={data.requirements} settings={data.settings} busy={busy} onSaveRequirement={handlers.saveRequirement} onDeleteRequirement={handlers.deleteRequirement} onSaveSettings={handlers.saveSettings} />}
        </>}
      </main>
    </div>
    <nav className="mobile-nav" aria-label="Main navigation">{NAV.map(({ key, label, icon: Icon }) => <button key={key} className={section === key ? "active" : ""} onClick={() => setSection(key)}><Icon size={19} /><span>{key === "overview" ? "Home" : key === "rules" ? "Rules" : label}</span></button>)}</nav>
    {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
    {confirm && <ConfirmDialog title={confirm.title} message={confirm.message} confirmLabel={confirm.confirmLabel} busy={busy} onCancel={() => setConfirm(null)} onConfirm={() => { const action = confirm.action; setConfirm(null); void action(); }} />}
  </div>;
}

function OverviewView({ month, bars, employees, shifts, warnings, onNavigate }: { month: string; bars: Bar[]; employees: Employee[]; shifts: Shift[]; warnings: ScheduleWarning[]; onNavigate: (section: Section) => void }) {
  const today = isoNowDate();
  const upcoming = shifts.filter((shift) => shift.date >= today).sort((a, b) => a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time)).slice(0, 5);
  const employeeById = new Map(employees.map((employee) => [employee.id, employee]));
  const barById = new Map(bars.map((bar) => [bar.id, bar]));
  return <div className="page-stack">
    <div className="page-heading heading-with-action"><div><p className="eyebrow">YOUR VENUES, AT A GLANCE</p><h1>Good morning</h1><p className="muted">Here’s what’s happening in {formatMonth(month)}.</p></div><button className="button button-primary" onClick={() => onNavigate("schedule")}><CalendarDays size={17} />Open schedule</button></div>
    <section className="overview-stats">
      <button className="stat-tile" onClick={() => onNavigate("bars")}><span>Venues</span><strong>{bars.length}</strong><small>Bars you manage</small><Store size={19} /></button>
      <button className="stat-tile" onClick={() => onNavigate("employees")}><span>Active staff</span><strong>{employees.length}</strong><small>Across all venues</small><UsersRound size={19} /></button>
      <button className="stat-tile" onClick={() => onNavigate("schedule")}><span>Unassigned</span><strong className={shifts.some((shift) => !shift.employee_id) ? "text-warning" : ""}>{shifts.filter((shift) => !shift.employee_id).length}</strong><small>Shifts need an employee</small><Clock3 size={19} /></button>
      <button className="stat-tile" onClick={() => onNavigate("schedule")}><span>Warnings</span><strong className={warnings.length ? "text-warning" : ""}>{warnings.length}</strong><small>Across this month</small><AlertTriangle size={19} /></button>
    </section>
    <section className="overview-columns">
      <div className="surface overview-list"><div className="section-head"><div><h2>Upcoming shifts</h2><p>Next on the schedule</p></div><button className="text-button" onClick={() => onNavigate("schedule")}>View schedule</button></div>
        {upcoming.length ? upcoming.map((shift) => <div className="upcoming-row" key={shift.id}><div className="date-badge"><strong>{new Date(`${shift.date}T12:00:00`).getDate()}</strong><span>{new Intl.DateTimeFormat("en", { weekday: "short", timeZone: "UTC" }).format(new Date(`${shift.date}T12:00:00`))}</span></div><div className="upcoming-details"><strong>{employeeById.get(shift.employee_id ?? "")?.full_name ?? "Unassigned shift"}</strong><span>{barById.get(shift.bar_id)?.name ?? "Venue"} · {shift.start_time}–{shift.end_time}</span></div><span className={`status-dot ${shift.employee_id ? "" : "warning"}`} /></div>) : <div className="empty-inline"><CalendarDays size={22} /><strong>No upcoming shifts</strong><span>Add shifts to start planning your month.</span></div>}
      </div>
      <div className="surface overview-list"><div className="section-head"><div><h2>Needs attention</h2><p>Warnings are guidance, never blockers</p></div><span className="count-pill">{warnings.length}</span></div>
        {warnings.length ? warnings.slice(0, 5).map((warning) => <div className="warning-row" key={warning.id}><span className={`warning-icon ${warning.severity}`}><AlertTriangle size={16} /></span><div><strong>{warning.message}</strong><small>{warning.date ? formatDate(warning.date, { weekday: "short", month: "short", day: "numeric", year: undefined }) : "Schedule warning"}</small></div></div>) : <div className="empty-inline"><div className="success-check">✓</div><strong>Looking good</strong><span>No warnings for this month.</span></div>}
      </div>
    </section>
    <div className="footer-note">Showing {shifts.length} shifts in {formatMonth(month)} · <button className="text-button" onClick={() => onNavigate("rules")}>Review rules</button></div>
  </div>;
}

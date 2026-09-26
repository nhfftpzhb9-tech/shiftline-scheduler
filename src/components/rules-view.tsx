"use client";

import { useState, type FormEvent } from "react";
import { AlertTriangle, ArrowUpRight, Plus, Trash2 } from "lucide-react";
import type { Bar, RuleSettings, StaffingRequirement, Weekday } from "@/lib/domain/types";
import { WEEKDAY_LABELS } from "@/lib/domain/types";
import { Dialog } from "@/components/ui";

const RULES: { key: keyof RuleSettings; title: string; detail: string }[] = [
  { key: "overlaps", title: "Overlapping shifts", detail: "Flag employees scheduled for two shifts at the same time." },
  { key: "availability", title: "Availability", detail: "Compare shifts with each employee’s availability." },
  { key: "maximumHours", title: "Maximum weekly hours", detail: "Warn when an employee exceeds their weekly limit." },
  { key: "openingHours", title: "Venue opening hours", detail: "Flag shifts that begin before opening or end after closing." },
  { key: "staffing", title: "Minimum staffing", detail: "Compare scheduled staff with the venue’s staffing requirements." },
];

export function RulesView({ bars, requirements, settings, busy, onSaveRequirement, onDeleteRequirement, onSaveSettings }: {
  bars: Bar[];
  requirements: StaffingRequirement[];
  settings: RuleSettings;
  busy: boolean;
  onSaveRequirement: (input: Omit<StaffingRequirement, "id">, id?: string) => Promise<void>;
  onDeleteRequirement: (id: string) => Promise<void>;
  onSaveSettings: (settings: RuleSettings) => Promise<void>;
}) {
  const [editing, setEditing] = useState<StaffingRequirement | null | "new">(null);
  const [barFilter, setBarFilter] = useState("all");
  const barById = new Map(bars.map((bar) => [bar.id, bar]));
  const shownRequirements = requirements.filter((requirement) => barFilter === "all" || requirement.bar_id === barFilter);

  function toggleRule(key: keyof RuleSettings) {
    void onSaveSettings({ ...settings, [key]: !settings[key] });
  }

  async function submit(input: Omit<StaffingRequirement, "id">) {
    await onSaveRequirement(input, editing && editing !== "new" ? editing.id : undefined);
    setEditing(null);
  }

  return <div className="page-stack">
    <div className="page-heading"><p className="eyebrow">YOUR SCHEDULING GUIDANCE</p><h1>Rules & settings</h1><p className="muted">Choose which checks help you review a schedule. Warnings never block a save.</p></div>
    <section className="surface rule-settings-panel"><div className="section-head"><div><h2>Schedule checks</h2><p>Turn warnings on or off to fit the way you work.</p></div><span className="nonblocking-label"><AlertTriangle size={14} />Non-blocking</span></div>
      <div className="rule-toggle-list">{RULES.map((rule) => <label className="rule-toggle-row" key={rule.key}><span className="rule-toggle-copy"><strong>{rule.title}</strong><small>{rule.detail}</small></span><input type="checkbox" role="switch" aria-label={`Enable ${rule.title} warnings`} checked={settings[rule.key]} disabled={busy} onChange={() => toggleRule(rule.key)} /><span className="switch-track" /></label>)}</div>
    </section>
    <section className="surface requirements-panel"><div className="section-head"><div><h2>Minimum staffing</h2><p>Set a minimum headcount for recurring weekly periods.</p></div><button className="button button-secondary button-small" onClick={() => setEditing("new")} disabled={!bars.length}><Plus size={16} />Add requirement</button></div>
      {bars.length === 0 ? <div className="empty-inline empty-requirements"><strong>Add a bar first</strong><span>Staffing requirements are tied to a venue.</span></div> : <>
        {bars.length > 1 && <label className="filter-select small-filter">Venue<select value={barFilter} onChange={(event) => setBarFilter(event.target.value)}><option value="all">All venues</option>{bars.map((bar) => <option key={bar.id} value={bar.id}>{bar.name}</option>)}</select></label>}
        {shownRequirements.length ? <div className="requirement-list">{shownRequirements.map((requirement) => <div className="requirement-row" key={requirement.id}><div className="requirement-time"><strong>{WEEKDAY_LABELS[requirement.weekday]}</strong><span>{requirement.start_time}–{requirement.end_time}</span></div><span className="requirement-venue">{barById.get(requirement.bar_id)?.name}</span><span className="requirement-staff">{requirement.minimum_staff} <small>staff</small></span><button className="icon-button" aria-label="Edit staffing requirement" onClick={() => setEditing(requirement)}><ArrowUpRight size={16} /></button><button className="icon-button danger-icon" aria-label="Delete staffing requirement" onClick={() => void onDeleteRequirement(requirement.id)}><Trash2 size={16} /></button></div>)}</div> : <div className="empty-inline empty-requirements"><strong>No requirements yet</strong><span>Start with a busy service period where minimum coverage matters.</span><button className="text-button" onClick={() => setEditing("new")}><Plus size={15} />Add your first requirement</button></div>}
      </>}
    </section>
    <p className="settings-footer-note">Need a different check? Scheduling rules are modular and can be added in <code>src/lib/domain/rules.ts</code>.</p>
    {editing !== null && bars.length > 0 && <RequirementEditor requirement={editing === "new" ? null : editing} bars={bars} busy={busy} onClose={() => setEditing(null)} onSubmit={submit} />}
  </div>;
}

function RequirementEditor({ requirement, bars, busy, onClose, onSubmit }: { requirement: StaffingRequirement | null; bars: Bar[]; busy: boolean; onClose: () => void; onSubmit: (input: Omit<StaffingRequirement, "id">) => Promise<void> }) {
  const [barId, setBarId] = useState(requirement?.bar_id ?? bars[0]?.id ?? "");
  const [weekday, setWeekday] = useState<Weekday>(requirement?.weekday ?? 1);
  const [start, setStart] = useState(requirement?.start_time ?? "18:00");
  const [end, setEnd] = useState(requirement?.end_time ?? "22:00");
  const [minimum, setMinimum] = useState(requirement?.minimum_staff.toString() ?? "2");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSubmit({ bar_id: barId, weekday, start_time: start, end_time: end, minimum_staff: Number(minimum) });
  }

  return <Dialog title={requirement ? "Edit requirement" : "Add staffing requirement"} subtitle="Set a minimum headcount for this recurring service window." onClose={onClose} footer={<><button className="button button-secondary" type="button" onClick={onClose}>Cancel</button><button className="button button-primary" form="requirement-form" disabled={busy}>{busy ? <span className="spinner" /> : requirement ? "Save requirement" : "Add requirement"}</button></>}>
    <form id="requirement-form" className="form-stack" onSubmit={submit}>
      <label>Bar<select value={barId} onChange={(event) => setBarId(event.target.value)} required>{bars.map((bar) => <option value={bar.id} key={bar.id}>{bar.name}</option>)}</select></label>
      <label>Day of week<select value={weekday} onChange={(event) => setWeekday(Number(event.target.value) as Weekday)}>{Object.entries(WEEKDAY_LABELS).map(([day, label]) => <option value={day} key={day}>{label}</option>)}</select></label>
      <div className="form-two-col"><label>From<input type="time" value={start} onChange={(event) => setStart(event.target.value)} required /></label><label>Until<input type="time" value={end} onChange={(event) => setEnd(event.target.value)} required /></label></div>
      <p className="field-hint">An end time earlier than the start time continues into the next day.</p>
      <label>Minimum staff<input type="number" min="1" max="100" value={minimum} onChange={(event) => setMinimum(event.target.value)} required /></label>
    </form>
  </Dialog>;
}

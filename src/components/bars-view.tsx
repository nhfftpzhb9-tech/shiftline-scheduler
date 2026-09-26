"use client";

import { useState, type FormEvent } from "react";
import { Clock3, MoreHorizontal, Plus, Store, Trash2, UsersRound } from "lucide-react";
import type { Bar, Shift } from "@/lib/domain/types";
import { Dialog } from "@/components/ui";
import { DEFAULT_TIME_ZONE } from "@/lib/domain/time";

type BarInput = Omit<Bar, "id" | "metadata">;

export function BarsView({ bars, shifts, busy, onSave, onDelete }: {
  bars: Bar[];
  shifts: Shift[];
  busy: boolean;
  onSave: (input: BarInput, id?: string) => Promise<void>;
  onDelete: (bar: Bar) => void;
}) {
  const [editing, setEditing] = useState<Bar | null | "new">(null);
  const [menu, setMenu] = useState<string | null>(null);
  const barCount = shifts.reduce<Record<string, number>>((counts, shift) => ({ ...counts, [shift.bar_id]: (counts[shift.bar_id] ?? 0) + 1 }), {});

  async function submit(input: BarInput) {
    await onSave(input, editing && editing !== "new" ? editing.id : undefined);
    setEditing(null);
  }

  return <div className="page-stack">
    <div className="page-heading heading-with-action"><div><p className="eyebrow">YOUR LOCATIONS</p><h1>Bars</h1><p className="muted">Opening hours are used as context for your schedule warnings.</p></div><button className="button button-primary" onClick={() => setEditing("new")}><Plus size={17} />Add bar</button></div>
    {bars.length ? <div className="bar-list">{bars.map((bar) => <article className="bar-card" key={bar.id}>
      <div className="bar-avatar"><Store size={20} strokeWidth={1.7} /></div>
      <div className="bar-main"><div className="bar-name-line"><h2>{bar.name}</h2><span className="live-dot" title="Active venue" /></div><div className="bar-meta"><span><Clock3 size={14} />{bar.opening_time} – {bar.closing_time}</span><span><UsersRound size={14} />{barCount[bar.id] ?? 0} shifts in view</span></div><span className="bar-timezone">{bar.time_zone}</span></div>
      <div className="bar-actions"><button className="button button-secondary button-small" onClick={() => setEditing(bar)}>Edit details</button><div className="menu-wrap"><button className="icon-button" aria-label={`More options for ${bar.name}`} onClick={() => setMenu(menu === bar.id ? null : bar.id)}><MoreHorizontal size={19} /></button>{menu === bar.id && <div className="action-menu"><button className="danger-menu-item" onClick={() => { setMenu(null); onDelete(bar); }}><Trash2 size={15} />Delete bar</button></div>}</div></div>
    </article>)}</div> : <div className="empty-state surface"><div className="empty-icon"><Store size={23} /></div><h2>Your venues start here</h2><p>Add a bar and set its opening hours. You can add more venues any time.</p><button className="button button-primary" onClick={() => setEditing("new")}><Plus size={17} />Add your first bar</button></div>}
    {editing !== null && <BarEditor bar={editing === "new" ? null : editing} busy={busy} onClose={() => setEditing(null)} onSubmit={submit} />}
  </div>;
}

function BarEditor({ bar, busy, onClose, onSubmit }: { bar: Bar | null; busy: boolean; onClose: () => void; onSubmit: (input: BarInput) => Promise<void> }) {
  const [name, setName] = useState(bar?.name ?? "");
  const [opening, setOpening] = useState(bar?.opening_time ?? "18:00");
  const [closing, setClosing] = useState(bar?.closing_time ?? "03:00");
  const [timeZone, setTimeZone] = useState(bar?.time_zone ?? DEFAULT_TIME_ZONE);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!name.trim()) { setError("Enter a name for this bar."); return; }
    try { new Intl.DateTimeFormat("en", { timeZone }).format(); }
    catch { setError("Enter a valid time zone, such as Europe/Amsterdam."); return; }
    await onSubmit({ name: name.trim(), opening_time: opening, closing_time: closing, time_zone: timeZone });
  }

  return <Dialog title={bar ? "Edit bar" : "Add a bar"} subtitle={bar ? "Update the details for this venue." : "A name and opening hours are all you need to get started."} onClose={onClose} footer={<><button className="button button-secondary" type="button" onClick={onClose}>Cancel</button><button className="button button-primary" form="bar-form" disabled={busy}>{busy ? <span className="spinner" /> : bar ? "Save changes" : "Add bar"}</button></>}>
    <form id="bar-form" className="form-stack" onSubmit={submit}>
      <label>Bar name<input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. The Harbour Room" required maxLength={80} /></label>
      <div className="form-two-col"><label>Opens at<input type="time" value={opening} onChange={(event) => setOpening(event.target.value)} required /></label><label>Closes at<input type="time" value={closing} onChange={(event) => setClosing(event.target.value)} required /></label></div>
      <p className="field-hint">Overnight hours are supported. For example, 18:00 to 03:00.</p>
      <label>Time zone<input list="time-zones" value={timeZone} onChange={(event) => setTimeZone(event.target.value)} required /><datalist id="time-zones"><option value="Europe/Amsterdam" /><option value="Europe/London" /><option value="Europe/Paris" /><option value="America/New_York" /><option value="America/Los_Angeles" /><option value="Australia/Sydney" /><option value="UTC" /></datalist></label>
      {error && <p className="form-error" role="alert">{error}</p>}
    </form>
  </Dialog>;
}

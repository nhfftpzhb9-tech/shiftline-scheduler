import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, monthBounds } from "@/lib/domain/time";
import { DEFAULT_RULE_SETTINGS, type Bar, type Employee, type RuleSettings, type Schedule, type Shift, type StaffingRequirement, type WeeklyAvailability } from "@/lib/domain/types";

export interface WorkspaceSnapshot {
  bars: Bar[];
  employees: Employee[];
  shifts: Shift[];
  schedule: Schedule | null;
  requirements: StaffingRequirement[];
  settings: RuleSettings;
}

function requireData<T>(data: T | null, error: { message: string } | null): T {
  if (error) throw new Error(error.message);
  if (data === null) throw new Error("The database did not return a result.");
  return data;
}

function timeOnly(value: string): string { return value.slice(0, 5); }

export async function readWorkspace(client: SupabaseClient, month: string): Promise<WorkspaceSnapshot> {
  const { first, last } = monthBounds(month);
  const from = addDays(first, -7);
  const to = addDays(last, 7);
  const [barsResult, employeesResult, shiftsResult, scheduleResult, requirementsResult, settingsResult, employeeBarsResult] = await Promise.all([
    client.from("bars").select("id,name,opening_time,closing_time,time_zone,metadata").order("name"),
    client.from("employees").select("id,full_name,email,phone,roles,skills,availability,max_weekly_hours,contract_type,active,metadata").order("full_name"),
    client.from("shifts").select("id,schedule_id,bar_id,date,start_time,end_time,employee_id,role,required_skills,status,notes").gte("date", from).lte("date", to).order("date").order("start_time"),
    client.from("schedules").select("id,month_start,status").eq("month_start", first).maybeSingle(),
    client.from("staffing_requirements").select("id,bar_id,weekday,start_time,end_time,minimum_staff").order("weekday").order("start_time"),
    client.from("rule_settings").select("rules").maybeSingle(),
    client.from("employee_bars").select("employee_id,bar_id"),
  ]);
  const barsRows = requireData(barsResult.data, barsResult.error) as Array<Record<string, unknown>>;
  const employeeRows = requireData(employeesResult.data, employeesResult.error) as Array<Record<string, unknown>>;
  const shiftRows = requireData(shiftsResult.data, shiftsResult.error) as Array<Record<string, unknown>>;
  const requirementsRows = requireData(requirementsResult.data, requirementsResult.error) as Array<Record<string, unknown>>;
  const employeeBarRows = requireData(employeeBarsResult.data, employeeBarsResult.error) as Array<{ employee_id: string; bar_id: string }>;
  if (scheduleResult.error) throw new Error(scheduleResult.error.message);
  if (settingsResult.error) throw new Error(settingsResult.error.message);

  const bars: Bar[] = barsRows.map((row) => ({
    id: String(row.id), name: String(row.name), opening_time: timeOnly(String(row.opening_time)), closing_time: timeOnly(String(row.closing_time)),
    time_zone: String(row.time_zone), metadata: (row.metadata as Record<string, unknown>) ?? {},
  }));
  const barsByEmployee = new Map<string, string[]>();
  for (const relation of employeeBarRows) barsByEmployee.set(relation.employee_id, [...(barsByEmployee.get(relation.employee_id) ?? []), relation.bar_id]);
  const employees: Employee[] = employeeRows.map((row) => ({
    id: String(row.id), full_name: String(row.full_name), email: row.email as string | null, phone: row.phone as string | null,
    roles: (row.roles as string[]) ?? [], skills: (row.skills as string[]) ?? [], availability: (row.availability as WeeklyAvailability) ?? {},
    max_weekly_hours: row.max_weekly_hours === null ? null : Number(row.max_weekly_hours), contract_type: row.contract_type as string | null,
    active: Boolean(row.active), bar_ids: barsByEmployee.get(String(row.id)) ?? [], metadata: (row.metadata as Record<string, unknown>) ?? {},
  }));
  const shifts: Shift[] = shiftRows.map((row) => ({
    id: String(row.id), schedule_id: String(row.schedule_id), bar_id: String(row.bar_id), date: String(row.date).slice(0, 10),
    start_time: timeOnly(String(row.start_time)), end_time: timeOnly(String(row.end_time)), employee_id: row.employee_id as string | null,
    role: row.role as string | null, required_skills: (row.required_skills as string[]) ?? [], status: row.status as Shift["status"], notes: row.notes as string | null,
  }));
  const requirements: StaffingRequirement[] = requirementsRows.map((row) => ({
    id: String(row.id), bar_id: String(row.bar_id), weekday: Number(row.weekday) as StaffingRequirement["weekday"],
    start_time: timeOnly(String(row.start_time)), end_time: timeOnly(String(row.end_time)), minimum_staff: Number(row.minimum_staff),
  }));
  const scheduleRow = scheduleResult.data as { id: string; month_start: string; status: "draft" | "published" } | null;
  const schedule = scheduleRow ? { ...scheduleRow, month_start: String(scheduleRow.month_start).slice(0, 10) } : null;
  const savedSettings = (settingsResult.data as { rules?: Partial<RuleSettings> } | null)?.rules;
  return { bars, employees, shifts, schedule, requirements, settings: { ...DEFAULT_RULE_SETTINGS, ...savedSettings } };
}

export async function saveBar(client: SupabaseClient, userId: string, input: Omit<Bar, "id" | "metadata">, id?: string): Promise<void> {
  const row = { ...input, user_id: userId };
  const result = id ? await client.from("bars").update(row).eq("id", id) : await client.from("bars").insert(row);
  if (result.error) throw new Error(result.error.message);
}

export async function deleteBar(client: SupabaseClient, id: string): Promise<void> {
  const { error } = await client.from("bars").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export interface EmployeeInput {
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
}

export async function saveEmployee(client: SupabaseClient, userId: string, input: EmployeeInput, id?: string): Promise<void> {
  const { bar_ids, ...details } = input;
  const employeeResult = id
    ? await client.from("employees").update({ ...details, updated_at: new Date().toISOString() }).eq("id", id).select("id").single()
    : await client.from("employees").insert({ ...details, user_id: userId }).select("id").single();
  if (employeeResult.error) throw new Error(employeeResult.error.message);
  const employeeId = String(employeeResult.data.id);
  const removeResult = await client.from("employee_bars").delete().eq("employee_id", employeeId);
  if (removeResult.error) throw new Error(removeResult.error.message);
  if (bar_ids.length) {
    const linkResult = await client.from("employee_bars").insert(bar_ids.map((bar_id) => ({ user_id: userId, employee_id: employeeId, bar_id })));
    if (linkResult.error) throw new Error(linkResult.error.message);
  }
}

export async function setEmployeeActive(client: SupabaseClient, id: string, active: boolean): Promise<void> {
  const { error } = await client.from("employees").update({ active, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function ensureSchedule(client: SupabaseClient, userId: string, month: string): Promise<Schedule> {
  const monthStart = `${month}-01`;
  const { data, error } = await client.from("schedules").upsert({ user_id: userId, month_start: monthStart }, { onConflict: "user_id,month_start" })
    .select("id,month_start,status").single();
  if (error) throw new Error(error.message);
  return { id: String(data.id), month_start: String(data.month_start).slice(0, 10), status: data.status as Schedule["status"] };
}

export interface ShiftInput {
  date: string;
  start_time: string;
  end_time: string;
  bar_id: string;
  employee_id: string | null;
  role: string | null;
  required_skills: string[];
  status: Shift["status"];
  notes: string | null;
}

export async function saveShift(client: SupabaseClient, userId: string, input: ShiftInput, existingId?: string): Promise<void> {
  const schedule = await ensureSchedule(client, userId, input.date.slice(0, 7));
  const row = { ...input, schedule_id: schedule.id, user_id: userId, updated_at: new Date().toISOString() };
  const result = existingId ? await client.from("shifts").update(row).eq("id", existingId) : await client.from("shifts").insert(row);
  if (result.error) throw new Error(result.error.message);
}

export async function deleteShift(client: SupabaseClient, id: string): Promise<void> {
  const { error } = await client.from("shifts").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function copyMonth(client: SupabaseClient, sourceMonth: string, targetMonth: string, replaceExisting: boolean): Promise<number> {
  const { data, error } = await client.rpc("copy_schedule_month", {
    p_source_month: `${sourceMonth}-01`, p_target_month: `${targetMonth}-01`, p_replace_existing: replaceExisting,
  });
  if (error) throw new Error(error.message);
  return Number(data ?? 0);
}

export async function saveRequirement(client: SupabaseClient, userId: string, input: Omit<StaffingRequirement, "id">, id?: string): Promise<void> {
  const row = { ...input, user_id: userId, updated_at: new Date().toISOString() };
  const result = id ? await client.from("staffing_requirements").update(row).eq("id", id) : await client.from("staffing_requirements").insert(row);
  if (result.error) throw new Error(result.error.message);
}

export async function deleteRequirement(client: SupabaseClient, id: string): Promise<void> {
  const { error } = await client.from("staffing_requirements").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function saveRuleSettings(client: SupabaseClient, userId: string, rules: RuleSettings): Promise<void> {
  const { error } = await client.from("rule_settings").upsert({ user_id: userId, rules, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
}

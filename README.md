# Shiftline

Shiftline is an open-source staff scheduling workspace for managers who look after multiple bars or venues. It focuses on a fast monthly planning flow, clear non-blocking warnings, and a responsive interface for desktop and phone.

Employees do not sign in. The manager creates and edits schedules; staff can continue viewing published schedules in their existing service.

## Product and architecture

The app is a Next.js App Router web application. Supabase provides hosted Postgres, manager authentication, row-level security, and Realtime updates. The browser talks to Supabase with the authenticated manager's session; the database enforces ownership on every table. Do not put a Supabase service role key in the app.

The code is split into four practical areas:

- `src/lib/domain/` contains the schedule types, local-time calculations, and independent rules engine. It has no UI or database dependency.
- `src/lib/data/` contains the small persistence layer for Supabase reads and writes.
- `src/components/` contains the responsive shell and feature-specific schedule, employee, bar, and settings views.
- `supabase/schema.sql` defines the data model, RLS policies, Realtime publication, and the transactional month-copy operation.

Shift dates and wall-clock times are stored in the venue's time zone. `@js-temporal/polyfill` resolves those local times to instants for durations and overlaps, including daylight-saving changes. Overnight shifts whose end time is earlier than their start time end on the next local date. Shifts with equal start and end times are rejected by the editor. Breaks are not deducted.

The interface is installable from iPhone Safari as a home-screen web app. Next.js serves the web app manifest from `src/app/manifest.ts`; icons and Apple web-app metadata are configured in `src/app/layout.tsx`. The app still requires a network connection for sign-in and synchronized schedule data.

## Database model

| Table | Purpose |
| --- | --- |
| `bars` | Venue name, opening and closing time, time zone, and extensible JSON metadata. |
| `employees` | Contact details, many roles and skills, optional weekly availability, maximum hours, contract type, and active state. |
| `employee_bars` | Many-to-many employee-to-venue assignments. |
| `schedules` | One monthly draft/published schedule per manager and calendar month. |
| `shifts` | Venue, local date and times, optional employee, role, required skills, status, and notes. Unassigned shifts have a null employee. |
| `staffing_requirements` | Recurring minimum headcount by venue, ISO weekday, and time window. |
| `rule_settings` | Per-manager switches for each warning rule. |

Each table is scoped by `user_id`. RLS checks `auth.uid()` and composite foreign keys keep related rows within the same account. Warnings are calculated from the current data; they are not stored as a second, potentially stale copy.

## Local setup

### Requirements

- Node.js 20.9 or later
- pnpm 11+
- A Supabase project

### 1. Create the database

Create a Supabase project. In the Supabase SQL Editor, run all of [`supabase/schema.sql`](supabase/schema.sql). This creates tables, indexes, RLS, policies, and Realtime subscriptions.

In **Authentication → Providers / Sign In**, keep email and password enabled and turn off public sign-ups. Under **Authentication → Users**, create the one manager account. You can reset its password from the Supabase dashboard.

### 2. Configure the app

```sh
cp .env.example .env.local
```

In Supabase **Project Settings → API**, copy the project URL and the publishable key (or legacy anon key) into `.env.local`:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-publishable-key
```

These values are intentionally browser-visible. The key is safe to expose only because the schema enables RLS; never use the service-role key here. Restart Next.js after changing environment variables.

### 3. Run locally

```sh
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) and sign in with the manager account. Add a bar, add employees, and start a monthly schedule. If Supabase credentials are missing, the app displays the connection setup steps instead of saving data locally.

## Tests and quality checks

```sh
pnpm test
pnpm lint
pnpm build
```

The unit tests exercise time calculations, monthly and weekly totals, availability and overlap warnings, staffing coverage, opening-hour checks, and replacement candidate ranking without rendering the UI or contacting Supabase.

## Deploying

The app needs a Node.js runtime and server-side environment variables. Vercel is a convenient hosted option; a Node.js container or another Next.js-compatible host works too.

1. Push the repository to your Git host.
2. Create a production Supabase project and run `supabase/schema.sql` there.
3. Create the manager account and disable public sign-ups.
4. Configure `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in the deployment environment.
5. Deploy the project with `pnpm build` and `pnpm start` (or the host's Next.js integration).
6. Add the production app URL to Supabase Auth's allowed site and redirect URLs, then verify sign-in on desktop and phone.
7. Open the HTTPS deployment in iPhone Safari, choose **Share → Add to Home Screen**, enable **Open as Web App**, and tap **Add**.

Supabase Realtime is enabled for the app tables by the schema migration. The client subscribes only while a manager is signed in and refreshes the workspace when a table changes. RLS applies to Realtime events as well as queries.

## Adding a scheduling rule

1. Add a rule key and its setting in `src/lib/domain/types.ts` (`RuleSettings` and `DEFAULT_RULE_SETTINGS`).
2. Add the pure calculation to `src/lib/domain/rules.ts` and return a `ScheduleWarning` with a stable ID, clear message, severity, date, and related shift or venue IDs.
3. Register the setting label in `src/components/rules-view.tsx` if managers should be able to switch it off.
4. Add a focused test in `src/lib/domain/rules.test.ts`.

Keep rule calculations independent of React and Supabase. The manager can save a schedule with any warning; rules explain issues rather than blocking work.

## Adding fields or features

For persistent data, update the SQL schema, the domain type, and the mapping/write functions in `src/lib/data/repository.ts`. Add a migration instead of editing an already-deployed production schema in place. Keep optional employee fields nullable or defaulted so not every manager has to fill them in. Add the corresponding input to the feature component, and add a domain test when the field changes scheduling behavior.

For a new view, add a focused component under `src/components/` and register its navigation item in `src/components/planner-app.tsx`. Shared layout and tokens live in `src/app/globals.css`.

## Current behavior and future additions

- Weekly hour reports assign a shift's full duration to the week in which that shift starts. Duration itself respects the venue's time zone and daylight-saving changes.
- A limited availability window is on one weekday. For an overnight shift, configure the after-midnight portion on the following weekday as well.
- Staffing requirements repeat each week and support overnight time ranges.
- Bar deletion is confirmed and removes that bar's shifts and staffing rules. Employees can be made inactive to preserve historic assignments.

Good next steps include schedule publishing and exports, audit history, employee availability requests, notifications, labor cost estimates, and more detailed staffing templates. None are needed for the first manager-only workflow.

## License

MIT. See [`LICENSE`](LICENSE).

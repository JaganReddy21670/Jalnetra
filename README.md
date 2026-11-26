# JalNetra (Jal = water, Netra = eye): daily field device inspection

Next.js 15.5 · Tailwind (glassmorphism, Apple HIG style) · Cloudflare Workers + D1 (local runs use a JSON file) · ExcelJS.

## Run

```bash
npm install
npm run dev      # http://localhost:3000
```

## How it works

1. **Choose a role:** Administrator or Engineer.
2. **Sign in or create an account** (email + password, or Google).
   - The **first Administrator** signs up freely.
   - After that, new Administrator accounts need the **admin access code**, shown to admins on the *Engineers* page. `ADMIN_EMAILS` in `.env.local` also works.
   - Signing in with the wrong role is refused, for example an engineer account on the Administrator card.
3. **Instructions** (5 short lines), then **pick device types**: Water Level, Retrofit, Borewell, Current Sensor, Rain Gauge, TDS, Flow, pH, Pressure, Other.
4. **Add every deployed device** with a name and a **required location**. The target icon fills in GPS coordinates.
5. **Daily node check (one per device per day):**
   - *Is data coming?* Yes or No, plus when data was last received.
   - If **offline**, a reason (Power failure, Battery, Network/SIM, Sensor fault, ...) and the action taken are required.
   - After 5:00 PM IST, checks are marked *late*.
6. **Excel workbook (admin only).** Download it via `GET /api/export`; it is also auto-saved to `data/FieldCheck-Devices.xlsx`.
   - Sheets: *Summary*, one sub-sheet per device type (31-day ✓ / ! / L / ✗ grid, where ! = offline), *Inspection Log* (data coming?, last data, offline reason, action taken) and *Engineers*.

## Map, uptime and weekly email

- **Map** (`/map`, both roles): every device that has GPS coordinates is a dot coloured by today's status (online / offline / missed / not yet checked). Coordinates are read from the location text; the 🎯 button in any location field adds them.
- **Uptime %** is the share of checked days (last 30) on which data was coming. It appears on device cards, the admin Overview (worst first, plus fleet uptime) and the Excel sheets (`Uptime % (30d)` column, plus fleet uptime on Summary).
- **Weekly summary email** (admin → Settings) covers the previous 7 days: completion, uptime, offline reasons, per-engineer table and the lowest-uptime devices, with the **Excel workbook attached**.
  - Pick the day and time (IST) and the recipients. Send from Gmail (needs an [App Password](https://myaccount.google.com/apppasswords)), Outlook or any SMTP server.
  - **Preview Email** shows it in the browser; **Send Now** sends it immediately.
  - The scheduler (`src/instrumentation.ts` → `src/server/scheduler.ts`) checks every minute and sends at most once per day. It only runs while the server is running.

## Data

All data lives in `data/` (git-ignored):

| File | Contents |
|---|---|
| `db.json` | Users (passwords hashed with scrypt), devices, inspections, audit trail |
| `FieldCheck-Devices.xlsx` | The auto-generated workbook |
| `.session-secret` | Cookie-signing key (auto-created) |

Delete the `data/` folder to start fresh.

## Enable "Continue with Google"

1. Go to https://console.cloud.google.com/apis/credentials, choose **Create credentials**, then **OAuth client ID**, with type **Web application**.
2. Under **Authorised JavaScript origins**, add `http://localhost:3000` (and your real domain later).
3. Create `.env.local` in this folder:
   ```
   GOOGLE_CLIENT_ID=1234567890-xxxx.apps.googleusercontent.com
   ```
4. Restart `npm run dev`. The Google button becomes active.

## Optional env vars

| Var | Purpose |
|---|---|
| `GOOGLE_CLIENT_ID` | Enables Google sign-in |
| `ADMIN_EMAILS` | Comma-separated emails that are always admins |
| `SESSION_SECRET` | Overrides the auto-generated cookie key (set this in production) |

## Code map

| Path | Purpose |
|---|---|
| `src/server/db.ts` | JSON store with serialised writes; triggers the Excel rebuild |
| `src/server/auth.ts` | Password hashing, signed session cookies, role guards |
| `src/server/excel.ts` | Workbook builder (one sheet per device type) |
| `src/app/api/*` | Auth, onboarding, devices, inspections, users, export |
| `src/app/{login,onboarding,checklist,devices,history,engineers,excel}` | Pages; `/` is the admin Overview |
| `src/components/ui.tsx` | Glass/Apple UI kit (segmented control, toggles, sheets, device icons) |
| `src/lib/devices.ts` | Device-type catalogue and shared types |

## Deploy (Cloudflare)

JalNetra runs on **Cloudflare Workers** (free plan) with its data in **Cloudflare D1**.

| What | Where |
|---|---|
| Main link | **https://jalnetra.pages.dev** (Pages project `jalnetra`, forwards to the app through a service binding) |
| App Worker | `jalnetra-app` at https://jalnetra-app.jalnetra.workers.dev (config: `wrangler.jsonc`) |
| Database | D1 `jalnetra-db` (APAC), one table `jalnetra_store` |
| Weekly email | Cron Trigger `30 3 * * *` (09:00 IST) calls `/api/cron/weekly` |
| Secrets | `ADMIN_SETUP_CODE`, `SESSION_SECRET`, `CRON_SECRET` (`npx wrangler secret put NAME`) |

### Deploy an update
```bash
npm run cf:deploy          # builds with OpenNext and deploys the Worker
```
The `jalnetra.pages.dev` forwarder (`cloudflare-proxy/pages/`) only needs redeploying if it changes:
`cd cloudflare-proxy/pages && npx wrangler pages deploy --branch main`.

### Test locally in the Workers runtime
Create `.dev.vars` with the three secrets, then `npm run cf:build && npx wrangler dev --local` (this uses a local D1 copy).

### Back up the database
```bash
npx wrangler d1 export jalnetra-db --remote --output jalnetra-backup.sql
```

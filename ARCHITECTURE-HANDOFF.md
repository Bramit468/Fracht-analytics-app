# Architecture handoff

Context for continuing work on this repo. Written 2026-09-30. Read `AGENTS.md`
and `PROJECT.md` first — this file adds what is not in them.

## 1. System overview

Trip profitability for a Lithuanian haulier (company **Mitrena**, ~22 trucks).
Replaces an Excel sheet (`Ikainio skaiciavimas Omniva projektas.xlsx`) that
computed one trip's cost and profit.

Four data sources, deliberately separate:

- **Manual / planned** — the Excel model, in `lib/calc.ts` (pure functions).
  "What should this trip cost."
- **Telematika.lt** — the customer's telematics. `CANDaily` gives km and litres
  per truck per day; `Supplies` gives fuel, AdBlue and paid tolls.
  Parsed in `lib/telematics-costs.ts`. "What it actually cost."
- **PTV Developer** — address → truck route, per-country tolls, map tiles,
  driver hours, emissions. `lib/ptv-route.ts`, `lib/ptv-*.ts`.
  "What it will cost before driving."
- **Supabase** — Postgres + Auth + RLS. All app data.

UI is Next.js App Router under `app/`. Business logic lives in `lib/` as pure
functions with vitest tests; components only render.

## 2. Decisions (settled unless marked)

- **Money in integer cents.** Rates/norms `numeric(10,4)`, km `numeric(12,2)`.
  Each cost component is rounded, then summed, so the shown breakdown always
  equals the total. See `lib/money.ts`; `parseEuroToCents` parses text, never
  `Number(x)*100`.
- **Two parsers for machine money.** `parseEuroToCents` is strict (human
  input, ≤2 decimals). Telematics sends `"344.140"`, so
  `lib/telematics-costs.ts` rounds internally. Do not loosen the strict one.
- **Trips store a frozen copy of truck daily costs** (`trips.truck_costs`
  jsonb, migration `0006`). Built server-side by
  `public.truck_cost_snapshot()`, client input ignored. Without this, editing
  a truck would silently rewrite the profit of past trips.
- **One RPC for insert and update** — `save_trip_with_legs` (`0004`, `0007`).
  With `trip_data.id` it updates and replaces legs; without, it inserts. Trip
  and legs must change together or not at all. Rejected: a second function.
- **Real tolls beat estimated tolls.** `Supplies` contains actual paid tolls
  (`Toll_Norway`, `Maut`, `péage`, …), so per-country km from GPS is
  unnecessary for accounting. This killed an earlier GPS-snapshot design
  (closed PR #45, never merged, migration never applied).
- **Nothing is dropped silently.** `parseSupplies` returns `SupplyIssues`:
  unassigned rows (no plate) with their euro total, non-EUR rows, and
  ECB-converted rows counted separately. `other` costs get their own column
  and are excluded from `totalCents` on purpose.
- **Plate matching ignores spaces.** `plateKey()` — CANDaily sends
  `"LZR 118"`, Supplies `"LZR118"`. `normalizePlate` (`lib/truck.ts`) is for
  display only and keeps the space.
- **Secrets stay server-side.** No `NEXT_PUBLIC_` prefix on telematics or PTV
  keys; all calls go through server actions or route handlers.
- **PTV is feature-flagged by key presence** —
  `routeLookup={Boolean(process.env.PTV_API_KEY)}` in `app/trips/new/page.tsx`.
  Without a key the app degrades cleanly instead of breaking.
- **Archive stores raw provider rows**, not summaries (`0008`,
  `lib/telematics-archive.ts`). Classification keeps changing; raw rows can be
  recomputed, summaries cannot. Triggered by a button, not cron — a cron would
  need a `service_role` key that bypasses all RLS.
- **Tentative:** telematics key lives in env, not per company in the DB. Fine
  while there is one company; issue #44 assumes the DB eventually.
- **Tentative:** `gps_time` / provider timestamps are stored without a time
  zone, exactly as sent. The provider's zone is still unknown.

## 3. Current state

Implemented and merged (`main`, 463 tests, tsc/lint/build clean):

- Trucks: create, edit, delete, bulk cost and weight tables
  (`app/trucks/`, `app/trucks/kastai/`).
- Trips: create, edit, delete, copy, filter, export, "on the road now"
  (`app/trips/`).
- Company workspaces + invitations (`0005`, `0009`, `app/imone/`).
- Actual costs screen `app/telematika/page.tsx` + archive button.
- Route lookup, map, alternatives, driver hours, emissions, ferries
  (`app/trips/new/route-lookup.ts`, `lib/ptv-*.ts`, `lib/ferry-pricing.ts`).
- Dashboard: per truck, per direction, per period, 12-month trend, variance.

Open PR: **#152** — prefill fuel/AdBlue rates when a truck is picked
(issue #151). Reviewed, green, not merged.

**Not applied to the live database: migrations `0009` and `0010`.** Verified
by probing PostgREST: `company_invitations` returns `PGRST205`,
`trucks.empty_weight_kg` returns `42703`. Invitations and truck weights will
fail in production until someone runs them in the Supabase SQL editor.

## 4. Open questions

- **187 unassigned purchases totalling −19 226,94 €** (a credit, likely fuel-card
  VAT refunds). Currently only shown under the table. Should they be spread
  across trucks by litres, or shown as a company-level line? Model question,
  not a code question.
- **Non-EUR amounts** are converted with ECB daily rates and flagged as an
  estimate. The card issuer charges its own rate with a margin. Check first
  whether the provider's response already carries a EUR amount
  (`CurrencyExchangeRate` is present but unused).
- **PTV licensing.** The free plan is self-service but excludes productive
  use. HERE Routing v8 is the closest alternative that also returns toll costs.
- **All 22 trucks still share one daily cost (269 €/day)**, copied from
  `NNN 888` during import. Until corrected, every trip profit is wrong by that
  component. `app/trucks/kastai/` exists to fix this; the data entry is the
  customer's job.

## 5. Constraints and conventions

- Next.js 16 + React 19, Tailwind v4, TypeScript strict, vitest. Check
  `node_modules/next/dist/docs/` before writing Next-specific code.
- One issue = one branch (`feature/<name>`) = one PR. Never commit to `main`.
- UI text and code comments in Lithuanian; identifiers in English.
- Comments explain *why*, not *what*.
- Do not call `Date.now()` in component render scope — the React compiler lint
  rejects it. Put it in a module-level helper.
- Windows: Node is at `C:\Program Files\nodejs`
  (`export PATH="/c/Program Files/nodejs:$PATH"` in bash). `gh` is at
  `C:\Program Files\GitHub CLI\gh.exe` and may not be on PATH.
- The user's terminal is **PowerShell**; bash snippets are for the agent only.
  Label anything meant for them and write it in PowerShell.

## 6. Known problems

- Migrations `0009`, `0010` unapplied (see above). The recurring failure mode
  in this project: code merged, migration forgotten, screen shows an error.
- PR #152 adds a full `CANDaily` + `Supplies` fetch (~2,7 MB) on every truck
  selection. Acceptable at this size; cache when it slows down.
- `#56`'s warning prints empty parentheses if a purchase has a plate and a
  null currency. Not reachable with today's data.
- Vercel: `TELEMATIKA_*` are set for **Production only**, not Preview, so PR
  preview deployments show no telematics data.
- The provider returns a rolling ~3-month window and ignores `date_from` /
  `date_to`. Anything older must come from the archive.

## 7. Next steps

1. Run migrations `0009` and `0010` in Supabase; verify invitations and the
   weight table.
2. Merge PR #152.
3. Enter real per-truck daily costs via `app/trucks/kastai/`.
4. Decide what the −19 k € credits mean, then implement.
5. Press the archive button weekly until an automated path is agreed.
6. Issue #88 (GPS track matching) — blocked on GPS data, keep last.

## 8. Corrections worth not repeating

- **Never enter the user's passwords anywhere**, even when they paste them and
  ask. This happened; the answer stands.
- Reading a truck's cost live instead of from the trip snapshot rewrites
  history. Fixed in `0006` — do not "simplify" it back.
- GitHub says "no conflicts" for two identical additions in slightly different
  places, then TypeScript fails on the duplicate. Merge PR branches locally
  and run the suite before merging anything that touches the same file.
- Tests passed while the real data was wrong twice: plates split by spacing,
  and tolls named in other languages. Run parsers against a live response
  before trusting green tests.
- An API URL pasted into chat is burned. Move secrets to `.env.local` and pipe
  them through the clipboard or env vars, never into chat or a Note field.
- `gh pr diff <n> -- <path>` does not exist; `gh pr diff` takes only a number.

# CLAUDE.md

Read `AGENTS.md` and `PROJECT.md` first; they hold the workflow rules. This file
holds what stays true long-term.

## Overview

Trip profitability app for a Lithuanian haulier (Mitrena, ~22 trucks), replacing
an Excel cost model. Four deliberately separate data sources: the planned model
(`lib/calc.ts`), Telematika.lt (actual km, fuel, AdBlue, tolls), PTV Developer
(route, tolls, map before driving) and Supabase (Postgres + Auth + RLS, all app
data).

## Stack and commands

Next.js 16 (App Router) + React 19, Tailwind v4, TypeScript strict, Supabase,
MapLibre, vitest. Check `node_modules/next/dist/docs/` before writing
Next-specific code.

- `npm run dev` runs the dev server
- `npm run build` does a production build (must pass before a PR)
- `npm test` runs vitest once
- `npm run lint` runs eslint; `npx tsc --noEmit` type-checks

## Layout

- `app/` holds routes: `trips/`, `trucks/` (list, bulk costs and weights as
  `?skiltis=` tabs; `kastai/` only redirects),
  `telematika/`, `imone/` (company + invitations), `api/`, `auth/`, `login/`.
- `lib/` holds pure business logic, each file next to its `*.test.ts`:
  `calc`, `money`, `telematics-*`, `ptv-*`, `dashboard`, `ferry-pricing`, etc.
- `supabase/migrations/` holds numbered SQL migrations, applied manually in the
  Supabase SQL editor.

## Settled decisions

- Money is integer cents; rates `numeric(10,4)`, km `numeric(12,2)`. Each cost
  component is rounded, then summed, so the breakdown always equals the total.
- `parseEuroToCents` is strict (human input, ≤2 decimals); telematics parsing
  rounds internally because the provider sends `"344.140"`. Don't loosen the
  strict one.
- Trips store a frozen `truck_costs` snapshot, built server-side by
  `truck_cost_snapshot()`. Reading live truck costs would rewrite past profit.
- One RPC, `save_trip_with_legs`, inserts or updates (with `trip_data.id`) so
  trip and legs change atomically.
- Real paid tolls from Telematika `Supplies` beat GPS-estimated per-country
  tolls.
- Nothing is dropped silently: `parseSupplies` returns `SupplyIssues`
  (unassigned, non-EUR, ECB-converted); `other` costs are excluded from
  `totalCents` on purpose.
- Plates are matched with `plateKey()` (spaces ignored). `normalizePlate` is for
  display only.
- Secrets stay server-side: no `NEXT_PUBLIC_` on telematics or PTV keys; calls go
  through server actions or route handlers.
- PTV is feature-flagged by `PTV_API_KEY` presence, so the app degrades cleanly
  without it.
- The archive stores raw provider rows (classification changes, summaries can't
  be recomputed) and is button-triggered; cron would need a `service_role` key
  that bypasses RLS.

## Conventions

- UI text and code comments in Lithuanian; identifiers in English. Comments
  explain why, not what.
- Cost/profit math goes in `lib/` pure functions with unit tests, never in
  components. Guard division by zero on revenue and distance.
- No `any` without a real need. No `Date.now()` in component render scope (React
  compiler lint); use a module-level helper.
- Every schema change is a new numbered migration; note in the PR that it must be
  run manually.

## Avoid

- Never enter the user's passwords or paste secrets/API URLs into chat; use
  `.env.local`.
- Don't trust green tests alone on parsers: run them against a live provider
  response.
- Before merging PRs touching the same file, merge locally and run the suite
  (GitHub misses duplicate additions).
- Windows: user's terminal is PowerShell. Give them PowerShell commands and no
  `&&`. Node is at `C:\Program Files\nodejs`; `gh` may not be on PATH.

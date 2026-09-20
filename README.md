# Fracht Analytics App

Logistics app that shows the real profitability of every trip.

Read [PROJECT.md](PROJECT.md) for scope and [AGENTS.md](AGENTS.md) for the rules AI
agents (Claude, Codex) must follow in this repo.

## Stack

| Layer | Choice |
| --- | --- |
| Frontend | Next.js (React, App Router, TypeScript) |
| Backend | Next.js server actions / route handlers |
| Database | PostgreSQL (Supabase) |
| Auth | Supabase Auth |
| Hosting | Vercel |

A separate Python/FastAPI service can be added later if heavy optimization or data
processing is needed. Not part of the MVP.

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in Supabase URL and keys
npm run dev
```

App runs at http://localhost:3000

Get `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from the
Supabase project's API settings. The application creates the Supabase client
only when it is first needed, so builds do not require production credentials.

## Authentication

The application uses Supabase email/password authentication. A signed-out
visitor is redirected to `/login`. Accounts are created or invited by the
administrator in Supabase; public self-registration is not shown in the app.
If email invitations or confirmation are enabled, add this URL to the allowed
Auth redirect URLs:

```text
https://your-app-domain.example/auth/callback
```

Migration `0005_company_workspaces.sql` assigns every authenticated user to one
company and applies Row Level Security to trucks, trips and trip legs. Existing
data and users are assigned to the initial workspace; each later Auth user gets
a separate workspace automatically.

## Workflow

Nobody commits straight to `main`.

```
GitHub Issue -> assign yourself -> create branch -> code -> run & test
  -> commit -> push -> Pull Request -> review by the other person -> merge into main
```

Branch naming:

```
feature/trip-form
feature/profit-calculation
feature/database
feature/excel-import
```

## Never commit

- API keys, passwords, Supabase service-role keys
- `.env.local` or any real credentials

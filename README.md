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

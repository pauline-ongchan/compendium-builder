# Relay event operations

Relay is a Next.js event-operations workspace for schedules, staffing,
availability, reusable roles, prep, judging, and event resources.

## Runtime

- Next.js 16 App Router on Vercel Functions
- Neon Postgres through Drizzle ORM
- Node.js 24

## Local setup

Install dependencies:

```bash
npm install
```

Copy `.env.example` to `.env.local` and set a Neon Postgres connection string:

```text
DATABASE_URL=postgresql://...
```

Start the app:

```bash
npm run dev
```

## Database

Generate a migration after changing `db/schema.ts`:

```bash
npm run db:generate
```

The API creates the `event_states` table defensively on first use. The checked-in
Postgres migration remains the canonical schema history for managed environments.

## Validation

```bash
npm test
```

## Vercel deployment

Connect the GitHub repository to Vercel, use the Next.js framework preset, and
attach a Neon integration from the Vercel Marketplace. The integration provides
`DATABASE_URL` to Preview and Production deployments.

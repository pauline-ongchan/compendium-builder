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

Configure portal authentication with a Google OAuth web application. Its
authorized callback URL is `http://localhost:3000/api/auth/callback/google` for
local development and `https://<your-domain>/api/auth/callback/google` in the
deployed environment.

```text
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=<a long random secret>
GOOGLE_CLIENT_ID=<google oauth client id>
GOOGLE_CLIENT_SECRET=<google oauth client secret>
RELAY_GOOGLE_DOMAIN=ubcbiztech.com
```

`RELAY_GOOGLE_DOMAIN` defaults to `ubcbiztech.com` when omitted. The former
`RELAY_ADMIN_EMAILS` variable is no longer used.

Only verified Google accounts in `RELAY_GOOGLE_DOMAIN` can open the Relay portal
or call its APIs. Everyone in the domain can edit the shared workspace. The Exec
View is read-only, remembers the selected name on the current device, and shows
only that person's roles from the last published schedule. Availability is
updated in People + Availability inside the portal.

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

Add the authentication variables above to each Vercel environment and use that
environment's public URL for `NEXTAUTH_URL` and the Google callback URL.

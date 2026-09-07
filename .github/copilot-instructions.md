# Copilot / AI agent instructions for this repository ✅

Purpose: Give immediate context so an AI coding agent can be productive without human hand-holding. Focus on architecture, developer workflows, notable conventions, and integration points specific to this codebase.

## Quick facts 🔧
- Framework: **Next.js (App Router, Next 15+)** with mixed **TypeScript** and **JavaScript** files.
- DB: **Prisma** (MySQL) — schema at `prisma/schema.prisma`, seeding at `prisma/seed.ts`.
- Auth: **NextAuth + PrismaAdapter** (`app/api/auth/[...nextauth]/options.ts`).
- i18n: `next-intl` with default locale **Arabic**; config in `middleware.ts` and `i18n/*`.
- Build/dev scripts: see `package.json` scripts. Dev: `npm run dev` (uses turbopack). Build: `npm run build` (runs `prisma generate && next build`).

## Important developer commands ✅
- Start dev server (hot reload): `npm run dev`
- Build (production): `npm run build` — note `prisma generate` runs before build.
- Start production server: `npm run start`
- Run Prisma seeds: `npx prisma db seed` (seed script is `prisma/seed.ts`)
- Apply migrations: `npx prisma migrate dev --name <desc>` (project targets MySQL via `DATABASE_URL`).
- Lint: `npm run lint` (note: `next.config.ts` disables lint errors during build).

## Repo structure & patterns (what agents should know) 🧭
- `app/` (main app router pages and server components) — prefer to add server code in `app/api/*` Route Handlers (exported `GET`/`POST` etc.) as shown in `app/api/login/route.js`.
- `components/` contains UI components (mixed `.jsx` and `.tsx`). Follow existing file extension when adding components to match surrounding code.
- `lib/prisma.ts` exports a singleton `prisma` client; use `import { prisma } from '@/lib/prisma'` for DB access.
- Auth flow: `NextAuth` configured in `app/api/auth/[...nextauth]`; sign-in callback upserts users into Prisma `user` table.
- External integrations: many `app/api/*` endpoints proxy to an external service (e.g. `https://minberiaksa.org:1880/napi`) using env vars like `NEXT_PUBLIC_API_KEY` / `NEXT_PUBLIC_API_SECRET` (see `app/api/login/route.js`).

## Conventions & gotchas ⚠️
- **Secrets in repo:** There are hard-coded OAuth client IDs/secrets in `app/api/auth/[...nextauth]/options.ts`. Treat these as sensitive; prefer using environment variables. Do NOT introduce new secrets into source.
- **TypeScript/Lint build behavior:** Project intentionally **ignores TypeScript and ESLint errors during build** (`typescript.ignoreBuildErrors` and `eslint.ignoreDuringBuilds` in `next.config.ts`, and `TSC_COMPILE_ON_ERROR=true` in `package.json`). Avoid introducing widespread type regressions—CI or policy might tighten this later.
- **Localization:** Only `ar` locale is configured. Use `next-intl` patterns and `i18n/messages/*.json` for translations.
- **Mixed ESM/CommonJS patterns:** Some files use CommonJS-style requires and `.js` route handlers. Match the style of the directory when implementing changes.
- **No test suite:** There are no automated tests in `package.json`. If adding tests, document test commands and ensure they are runnable locally.

## When making changes — checklist ✅
- Ensure the change respects localization (if UI text is added, update `i18n/messages/ar.json` and `en.json` when relevant).
- For DB schema changes: add Prisma schema edits, run `npx prisma migrate dev --name <desc>`, and confirm `prisma generate` runs (or run it manually).
- Verify no secrets are committed — prefer `process.env.*` and list vars in `types/env.d.ts`.
- Validate API route changes by hitting `http://localhost:3000/api/<route>` or via the relevant page flows.

## Quick examples (copy/paste patterns) 💡
- Database access (server code):
  - `import { prisma } from '@/lib/prisma';` then `await prisma.campaign.create(...)`
- API route pattern (server):
  - `export async function POST(req) { const body = await req.json(); /* ... */ }` (see `app/api/login/route.js`).
- NextAuth: check `authOptions` in `app/api/auth/[...nextauth]/options.ts` for callbacks and provider patterns.

## Integration & deployment notes 🔗
- Image domains are permitted in `next.config.ts` — when adding external images add domains there.
- Cloudinary and several third-party services are used; look for `cloudinary` usage in `lib/cloudinary.ts`.
- Deployment target: typical Vercel/Next.js setup — confirm env vars and Prisma database URL in deployment environment.

## Security & PR guidance 🔒
- Remove or rotate any hard-coded credentials before merging (see `app/api/auth/[...nextauth]/options.ts`).
- If you must commit migration/seed data, document why and what it contains (avoid shipping production secrets).

---
If any of the above items are unclear or you want more examples (e.g., a sample API change PR or a small end-to-end task for me to implement), tell me which area to expand and I'll iterate. ✨

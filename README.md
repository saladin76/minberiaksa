# Minber-i Aksa Public Frontend

Public-facing Next.js frontend foundation for Minber-i Aksa.

## Scope

This repository contains the public website UI foundation only:

- Next.js App Router
- TypeScript
- Tailwind CSS design tokens
- Locale-aware routing for Arabic, Turkish, and English
- Public page route structure
- Frontend-only donation basket utilities using `localStorage`

This foundation does not include backend code, admin dashboards, campaign management, internal tools, AI assistants, or ad platform integrations.

## Getting started

```bash
npm install
npm run dev
```

Open `http://localhost:3000/tr` for the Turkish route, `http://localhost:3000/ar` for Arabic, or `http://localhost:3000/en` for English.

## Build

```bash
npm run build
```

## Project structure

```txt
app/
  [locale]/
    layout.tsx
    page.tsx
    projects/
    zakat/
    waqf/
    recurring-donation/
    checkout/
    success/
    failure/
    pending/
    certificates/
    my-impact/
    achievements/
    field-updates/
    reels/
    knowledge/
    about/
    volunteer-with-us/
    bank-accounts/
    contact/
    privacy-policy/
    terms-and-conditions/
    donation-policy/
components/
lib/
data/
styles/
```

## Design notes

The visual foundation follows the Minber-i Aksa public identity direction:

- Trust Navy `#10212B`
- Deep Green `#556B2F`
- Aqsa Gold `#C98A2B`
- Minber Red `#B34732`
- Ivory `#FFFDF8`
- Soft Sand `#F7F2EA`

Arabic routes render RTL. Turkish and English routes render LTR. In English copy, the site uses **Al-Quds**.

# Design

This document covers two things: the **visual design system** this repo now ships (the existing dark app UI, plus the new parchment marketing surface), and the **site architecture** — what lives where, and why the homepage changed.

It was produced with the [`kami`](.agents/skills/kami/SKILL.md) skill for the marketing surface; the dashboard/practice/report app UI is explicitly out of kami's scope (`SKILL.md` → "When not to use this skill" → "Web dynamic app UI") and is documented here as-is, unchanged.

## 1. Two design systems, on purpose

| | App UI (`/dashboard`, `/practice`, `/report`, …) | Marketing page (`/`) |
|---|---|---|
| Surface | Dynamic web app | Static/screen-first landing page |
| Background | `slate-950` (dashboard/practice), `slate-50` (report) | Parchment `#f5f4ed` |
| Accent | `sky-400` focus rings, `emerald`/`amber`/`red` grade badges | Ink-blue `#1B365D`, single accent |
| Type | Geist Sans (Tailwind default) | Charter/Georgia serif, weight 500, no bold |
| Styling | Tailwind CSS v4 utility classes + shadcn/ui | Hand-authored CSS scoped under `.kami-landing` (`src/app/landing.css`) |
| Source of truth | `src/app/globals.css`, `tailwind` config | kami's parchment design system (`.agents/skills/kami/references/design.md` §1–§3) |

These are intentionally **not** unified. kami's own rules exclude dynamic app UI from its design language ("this is for print / static documents"), and retrofitting the dashboard/teleprompter/analytics screens into a serif/parchment aesthetic would fight their information density (live meters, charts, dark-mode camera preview) for no real benefit. The two systems meet at exactly one seam: the `/dashboard` CTA on the landing page.

### App UI tokens (unchanged, documented for reference)

- Dashboard & Studio Mode: `bg-slate-950` page, `bg-slate-900` cards, `slate-100` text, `sky-400` focus rings.
- Report/Analytics: `bg-slate-50` (light), grade-tier colors (`emerald`=A, `amber`=B, `red`=C or below).
- Components: `src/components/ui/*` (shadcn primitives), `AppShell.tsx` (sidebar shell), `WebcamTile.tsx`, `MetricsChart.tsx`.

### Marketing page tokens (new, from kami)

```css
--parchment:  #f5f4ed;   /* page background */
--ivory:      #faf9f5;   /* lifted surface */
--brand:      #1B365D;   /* single accent — CTA, links, active tab */
--near-black: #141413;   /* primary text */
--olive:      #504e49;   /* secondary text */
--serif: Charter, Georgia, Palatino, "Times New Roman", serif;
```

Full spec: `.agents/skills/kami/references/design.md` and `CHEATSHEET.md`. All 813 lines of the original kami `landing-page-en.html` template's `<style>` block are preserved verbatim in `src/app/landing.css`, mechanically rescoped from `:root`/`body`/bare-tag selectors to `.kami-landing` (script used for the rescoping is not checked in; the transform was a 1:1 selector-prefix rewrite — see verification below for how it was validated) so the marketing page's typography and colors can never leak into the dark app shell, and vice versa.

## 2. Site map

| Route | Before | After |
|---|---|---|
| `/` | Dashboard (paste script, recent sessions) — inside `AppShell` sidebar | **New marketing landing page** — full-bleed, no sidebar |
| `/dashboard` | *(did not exist)* | The former `/` page, verbatim, now a section of the app (inside `AppShell` sidebar, same as Studio Mode/Analytics) |
| `/practice`, `/report`, `/feedback`, `/settings`, `/support` | unchanged | unchanged |

The dashboard was **moved, not rewritten** (`git mv src/app/page.tsx src/app/dashboard/page.tsx`, zero content diff). Everything that used to point at `/` as "the dashboard" now points at `/dashboard`:

- `AppShell.tsx`: `Dashboard` nav item href, `SHELL_BYPASS_PATHS` (renamed from `FULLSCREEN_PREFIXES`, now covers `/` and `/practice` — both routes render full-bleed without the sidebar).
- `practice/page.tsx`: the back-button handler (`onBack`) now returns to `/dashboard` instead of `/`.
- `report/page.tsx`: the empty-state "Start a new session" link now points to `/dashboard`.

`isActive()` in `AppShell.tsx` dropped its `href === "/"` special case — dead code once no nav item targets `/`.

## 3. The landing page

### Why a candidate, and where it lives

`design/landing-page-candidate/` is the kami deliverable proper: `content.json` (validated content IR), `landing-page-en.html` (filled template, standalone/self-contained with its own images and favicon), and `evidence/` (responsive screenshots). It's kept as the source-of-truth artifact for reviewing copy and layout independent of the Next.js app. **`src/app/page.tsx` + `src/components/LandingGallery.tsx` + `src/app/landing.css` is the live integration** — same content and CSS, ported into React/Next.js:

- Static content (hero, features, principles, pricing, FAQ, footer) → plain JSX in `page.tsx` (Server Component, no client JS needed).
- The interactive screenshot carousel → `LandingGallery.tsx` (Client Component), a 1:1 React port of the template's vanilla-JS carousel (auto-rotate every 4.5s, pause on hover/focus, click-tab-to-jump, click-half-of-frame-to-step, `prefers-reduced-motion` respected).
- Gallery images use `next/image` with explicit intrinsic dimensions (not `fill` — the CSS crossfade relies on the *active* panel being `position: relative` to size the frame, which `fill`'s forced absolute-positioning would break).

### Content, sourced honestly

Per kami's anti-fabrication rules, every claim on the page traces to something real in this repo, not invented copy:

- **Scoring formula** ("100, minus filler count, minus 5 per long pause, minus a pace penalty outside 110–170 WPM") — copied from `src/lib/grading.ts`.
- **Browser requirements** ("Chrome or Edge for speech recognition", "Chrome 94+ or Safari 16.4+ for recording") — copied from `README.md`.
- **Gallery screenshots are real captures**, not mockups:
  - Dashboard & Studio Mode: captured live against the running dev server this session (`design/landing-page-candidate/img/dashboard.webp`, `practice.webp`).
  - Analytics: reused `.playwright-mcp/report-populated.png`, a prior real capture already in the repo. Cross-checked its numbers against `grading.ts` (score 81 = 100 − 4 fillers − 5×1 long pause − 10 pace penalty ✓) before trusting it as current.
- **No pricing comparisons** — the schema supports a `comparisons` array against named competitors; none were verified, so the field was omitted rather than guessed. The product is free, so pricing is stated as free with real benefits, no invented "vs. X" claims.
- **No testimonials, no fake metrics, no stock imagery.**

### Known gaps (flagged, not papered over)

- **Product naming, resolved**: the repo/package/Vercel-project identifiers stay `stage-ready-assist` / `stage-ready` (git remote, `package.json` `name`, Vercel project name, the `stage-ready:v1` localStorage key) — those are technical identifiers, not user-facing copy. Every human-facing mention of the product name (`README.md` title, the landing page, `<title>`/`AppShell` wordmark) now says **"PresentPro"** consistently.
- **`CANONICAL_URL` / `og:url`** in the standalone candidate HTML is a placeholder (`https://example.com` — the value the kami template itself uses as its own "not set" example). No production domain was confirmed (Vercel project is named `stage-ready`, no custom domain found in `vercel.json`/`.vercel/repo.json`). The live Next.js integration avoids this gap entirely — `metadataBase` in `src/app/layout.tsx` resolves from `VERCEL_PROJECT_PRODUCTION_URL`/`VERCEL_URL` at deploy time, never a guessed string.
- **Social share image**: reused a real product screenshot (`/landing/analytics.png`) as the `og:image` rather than commissioning a dedicated social card — real image, not a designed one.

## 4. Verification

- `python3 .agents/skills/kami/scripts/build.py --check-placeholders design/landing-page-candidate/landing-page-en.html` → **OK, no placeholders**.
- `python3 .agents/skills/kami/scripts/build.py --check-style design/landing-page-candidate/landing-page-en.html` → **OK, no style drift**.
- `python3 .agents/skills/kami/scripts/build.py landing-page` → **OK, static HTML template**.
- `python3 .agents/skills/kami/scripts/build.py --check-content content.json landing-page-en.html` → reports **"indeterminate"**, not pass/fail. Root cause isolated by hand: kami's checker fails closed (treats visible-text evidence as unproven) whenever the stylesheet contains a pseudo-class function (`:not()`, `:nth-child()`, etc.) anywhere, and the shipped template's own CSS has one. This trips on any styled kami landing page, not just this one. Manually verified every `content.json` value is present in the rendered markup via `grep` (see the checked strings in the working session; all matched).
- **Screen verify** (kami's required check for browser-delivered surfaces): screenshotted the standalone candidate at 1280px and 375px, full scroll depth, no line widows or sparse blocks — saved to `design/landing-page-candidate/evidence/`.
- **Live integration**: `pnpm build` — clean production build, `/` and `/dashboard` both prerender as static. Clicked through `/` → "Start Practicing Free" → `/dashboard` (sidebar renders, "Dashboard" nav active) → confirmed in a real browser (Next.js dev server). Confirmed `/report`'s empty-state CTA points at `/dashboard`. Confirmed the gallery carousel is interactive post-hydration (tab click switches the active panel). Checked the browser console: no errors.
- `pnpm lint` reports 2 pre-existing errors (`feedback/page.tsx`, `dashboard/page.tsx` — both `react-hooks/set-state-in-effect`) and 2 pre-existing warnings (`practice/page.tsx` unused var, `useSpeechRecognition.ts` missing dep). All four predate this change — confirmed via `git diff --stat`, which shows zero content changes to `feedback/page.tsx` and exactly one line changed in each of `practice/page.tsx` and `report/page.tsx`. Left as-is; out of scope for this change.

## 5. File map

```
DESIGN.md                                 # this file
design/landing-page-candidate/            # kami deliverable (standalone, reviewable)
  content.json                            #   validated content IR
  landing-page-en.html                    #   filled kami template, self-contained
  img/                                    #   dashboard.webp, practice.webp, analytics.png
  favicon.ico
  evidence/                               #   375px/1280px screenshots
src/app/
  page.tsx                                # NEW — live marketing landing page (was: Dashboard)
  landing.css                             # NEW — kami CSS, scoped to .kami-landing
  layout.tsx                              # +metadataBase for correct OG image resolution
  dashboard/page.tsx                      # MOVED from src/app/page.tsx, unchanged
  practice/page.tsx                       # 1 line: back-button target → /dashboard
  report/page.tsx                         # 1 line: empty-state CTA → /dashboard
src/components/
  LandingGallery.tsx                       # NEW — client component, carousel logic
  AppShell.tsx                             # nav href + bypass-path rename/extension
public/landing/                            # NEW — dashboard.webp, practice.webp, analytics.png
```

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Dev server (pnpm must be used — npm install will break the lockfile)
pnpm dev                        # starts on http://localhost:3000
./node_modules/.bin/next dev    # fallback if pnpm not in PATH

# Build & lint
pnpm build                      # production build + TypeScript check
pnpm lint                       # ESLint

# Deploy
vercel --prod                   # deploy to production
vercel                          # preview deploy
vercel env ls                   # verify env vars are set
```

There are no tests. Always run `pnpm build` to verify TypeScript and catch errors before committing.

## Architecture

This is a **Next.js 16 App Router** app (all pages are client components; no server components are used in the UI). The app is a speech-practice teleprompter.

### Data flow

```
Dashboard (/) → paste script → store.setScript()
                             → store.saveRecentScript()
                                     ↓
Practice (/practice) ← reads store.script
  useAudioMetrics   → RMS volume, pause detection (Web Audio API)
  useSpeechRecognition → transcript, WPM, filler words (Web Speech API)
  useWebcam         → camera preview only
                             ↓ onStop()
                    builds SessionResult → store.setResult()
                                     ↓
Report (/report)    ← reads store.result
```

### State management — Zustand (`src/lib/store.ts`)

Single store with `persist` middleware. Only `recentScripts` and `scriptFontSize` are persisted to `localStorage` (key `stage-ready:v1`). `skipHydration: true` is set; `AppShell` calls `useAppStore.persist.rehydrate()` on mount to avoid SSR hydration mismatches.

**Critical**: never add `Date.now()` as a `useSyncExternalStore` snapshot — it causes infinite re-renders in React 19. Use `useState` + `useEffect` instead (see `src/app/page.tsx`).

### Pages & routing

- `/` — Dashboard: paste script, view recent sessions
- `/practice` — Fullscreen teleprompter (bypasses AppShell sidebar; see `FULLSCREEN_PREFIXES`)
- `/report` — Session analytics (reads `store.result`; redirects to empty state if null)
- `/feedback` — Feedback form + paginated list backed by Neon Postgres
- `/settings`, `/support` — Placeholder pages

### Practice page (`src/app/practice/page.tsx`)

The most complex file (~1150 lines). Key patterns:
- `currentSentenceIndex` is derived from `speech.spokenWordCount + wordCountOffset`. The offset enables random-start and scroll-to-position features.
- `displayedCurrentIndex` overrides the index while idle with a random/scroll-chosen start.
- `mergedSamplesRef` combines audio volume samples with the current WPM snapshot into `MetricsSample[]` for the chart and session result.
- Filler counts use a ref + 5s interval pattern to avoid the interval restarting every time `fillerCounts` changes.
- The scroll listener (attached once via `useEffect`) finds the sentence nearest viewport center and sets `randomStartIndex` while idle.

### Hooks

- **`useAudioMetrics`** — Web Audio API: `AnalyserNode` + `getFloatTimeDomainData` for RMS volume. 6-sample rolling average for silence detection. Emits `MetricsSample[]` and `PauseEvent[]`.
- **`useSpeechRecognition`** — `webkitSpeechRecognition`. Dual timestamp queues (`finalWordTimesRef` / `interimWordTimesRef`) for 15-second rolling WPM. Filler words scanned on both final and interim results (Chrome strips "um"/"hmm" from finals). Filler list in `src/lib/fillers.ts`.

### Scoring (`src/lib/grading.ts`)

Score = `100 - fillerCount - 5*longPauseCount - wpmPenalty`. Optimal WPM: 110–170. Long pause threshold: 1500ms.

### Backend

`/api/feedback` — Next.js route handler using `@neondatabase/serverless`. `DATABASE_URL` is injected by the Neon Vercel Marketplace integration. `ensureSchema()` runs `CREATE TABLE IF NOT EXISTS` on every request (idempotent). The db client is lazily initialized so builds succeed without `DATABASE_URL`.

### UI

- Tailwind CSS v4 + shadcn/ui (`src/components/ui/`)
- `@base-ui/react` for `AlertDialog`, `Dialog`, `Menu` (used in practice page)
- `AppShell` (`src/components/AppShell.tsx`) renders the sidebar nav for all routes except `/practice`
- Dark theme throughout: `slate-950` backgrounds, `slate-900` cards, `slate-100` text

### Path alias

`@/` maps to `src/` (configured in `tsconfig.json`).

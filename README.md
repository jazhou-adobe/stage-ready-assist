# Stage Ready Assist

A speech-practice teleprompter app for rehearsing and analysing your delivery. Paste a script, record a session, and get instant analytics on pace, filler words, and pauses — plus a downloadable MP4 of your practice run.

## Features

- **Teleprompter** — fullscreen scrolling script with sentence-level highlighting, fade effect, and font size controls
- **Speech recognition** — real-time WPM tracking and filler-word detection via Web Speech API (Chrome/Edge)
- **Audio metrics** — RMS volume monitoring and long-pause detection via Web Audio API
- **Webcam preview** — live camera tile during practice
- **Session recording** — local MP4 recording (webcam + mic) using WebCodecs; download link appears on the report page
- **Session analytics** — score, grade, pace-by-sentence breakdown, filler word timeline, and a metrics chart
- **Recent scripts** — last 10 scripts with per-session summaries, persisted to `localStorage`
- **Feedback** — in-app feedback form backed by Neon Postgres

## Getting Started

```bash
# pnpm is required — npm install will break the lockfile
pnpm install
pnpm dev        # starts on http://localhost:3000
```

To run on a different port:

```bash
pnpm dev -- --port 3001
```

## Usage

1. **Dashboard (`/`)** — paste your script and give it a title, then click **Start Practice**
2. **Practice (`/practice`)** — the teleprompter starts in idle mode; press **Space** or the play button to begin recording
3. **Report (`/report`)** — view your score, pace analysis, filler words, and metrics chart; download the session MP4 if webcam/mic were active

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router, all client components) |
| Language | TypeScript |
| State | Zustand 5 with `persist` middleware |
| Styling | Tailwind CSS v4 + shadcn/ui |
| Charts | Recharts |
| Dialogs/Menus | @base-ui/react |
| Recording | WebCodecs API + mp4-muxer |
| Database | Neon Postgres (feedback only) |
| Package manager | pnpm |

## Browser Requirements

- **Speech recognition** — Chrome or Edge (Web Speech API)
- **Session recording** — Chrome 94+ or Safari 16.4+ (WebCodecs API)

## Development

```bash
pnpm build      # production build + TypeScript check
pnpm lint       # ESLint
```

There are no automated tests. Run `pnpm build` before committing to catch type errors.

## Deployment

```bash
vercel          # preview deploy
vercel --prod   # production deploy
vercel env ls   # verify environment variables
```

The `DATABASE_URL` environment variable is injected automatically by the Neon Vercel Marketplace integration.

## Project Structure

```
src/
  app/
    page.tsx          # Dashboard
    practice/         # Teleprompter + recording
    report/           # Session analytics + MP4 download
    feedback/         # Feedback form
    api/feedback/     # Route handler (Neon Postgres)
  hooks/
    useAudioMetrics.ts
    useRecording.ts
    useSpeechRecognition.ts
    useWebcam.ts
  lib/
    store.ts              # Zustand store
    recordingBlobStore.ts # In-memory MP4 blob (practice → report)
    grading.ts
    types.ts
  components/
    AppShell.tsx
    MetricsChart.tsx
    WebcamTile.tsx
    ui/                   # shadcn/ui primitives
```

# Chrome Extension — Practice Anywhere (DRAFT SPEC)

Status: **DRAFT — under review (grilling in progress).** Decisions marked
`[OPEN]` are unresolved; `[RESOLVED]` records the agreed answer.

## 1. Goal

Ship a Chrome extension that lets a user launch the presentation-practice
experience (the `/start` page and a full practice session) from the browser
toolbar, without navigating to the website manually.

## 2. Grounding facts (from the codebase)

- App is **Next.js 16 (App Router)**. The practice flow is **100% client-side**:
  `/start` → `/practice2` (or `/practice`) → `/report2`.
- State lives in **zustand** persisted to **localStorage** (prefs, recent
  scripts) and **sessionStorage** (current result); recordings in **IndexedDB**.
- Practice uses browser APIs: **`getUserMedia`** (mic + camera preview),
  **Web Speech API** (`webkitSpeechRecognition`, needs network + mic perm),
  **WebCodecs `AudioEncoder` + `mp4-muxer`** (audio `.m4a` export).
- Quick-start scripts are static assets under `public/assets/*.txt`.
- The **only** server dependency is `/api/feedback` (Neon Postgres) — **not**
  used by the practice flow. Everything practice needs can run static.

Implication: the practice experience can run either as the hosted web app or as
a statically-exported bundle inside the extension. Web Speech API still requires
a network connection at runtime regardless.

## 3. Proposed scope

**In scope (v1):** toolbar action that opens `/start`; running a full practice
session (teleprompter, mic metrics, voice "start recording", audio recording)
and viewing `/report2`.

**Out of scope (v1):** the `/feedback` DB feature, `/dashboard`, auth, Chrome
Web Store publishing (dev/unpacked first), non-Chrome browsers.

## 4. Decision tree

- **D1 [RESOLVED] Deployment model → Launcher.** The extension opens the
  *hosted* web app; no static export / bundling in v1.
- **D2 [RESOLVED] Surface → dedicated popup window.** ~~Side panel~~ was ruled
  out: the spike hit a hard Chrome limitation — a side panel has no `tabId` and
  its cross-origin iframe can't obtain camera/mic, so `getUserMedia` fails with
  `NotAllowedError` (no prompt) and Web Speech is blocked with it. The
  extension instead opens the app in a **narrow popup window docked to the
  right edge** of the current window (`chrome.windows.create({type:"popup"})`),
  a real top-level context where mic/camera/Web Speech work normally.
- **D6 [RESOLVED] Target URL → `https://stage-ready-ashen.vercel.app/start`.**
- **D8 [RESOLVED] Speech-in-iframe gate → FAILED, pivoted.** Spike confirmed
  mic/camera are denied in a side-panel iframe (verified on real Chrome +
  Chromium docs). Practice cannot run in the panel; pivoted to the popup
  window above.
- **D5b [RESOLVED] Location → same repo, `/extension/`.**
- **D3 [DEFAULT] Reuse the app as-is** for v1 (narrow-width polish later).
- **D4 [RESOLVED] Permissions → `storage` only.** Opening a URL in a popup
  window needs no host/tabs/mic permission; `storage` (session) tracks the open
  panel window to avoid duplicates.
- **D5 [DEFAULT] MV3, hand-written manifest, no bundler.**
- **D6b [DEFAULT] Localhost override deferred** (options page later).
- **D7 [DEFAULT] Unpacked (dev) for v1;** Web Store later.

## 5. Open risks

- **Narrow popup width:** the teleprompter + camera + report are designed for
  wide viewports; the ~480px panel may need a responsive/narrow layout pass.
- **Popup window ergonomics:** it's a separate OS window (floats beside the
  page), not embedded in the tab viewport like a native side panel.
- **Service-worker lifetime:** the tracked window id is kept in
  `storage.session` so it survives SW restarts (avoids duplicate windows).

## 6. v1 build (current)

MV3 extension under `/extension/`: clicking the toolbar action opens (or
focuses) a narrow popup window docked to the right edge, loading
`…/start`.

**Acceptance (manual, real Chrome):** load unpacked → click the toolbar icon →
narrow window opens beside the page on the start page → run a session and
confirm: (1) mic/camera prompt + camera preview; (2) WPM / filler /
teleprompter update as you speak; (3) "start recording" voice command triggers
the countdown; (4) `.m4a` download works from the report.

## 7. Milestones (after v1 verified)

1. Options page: target URL (prod default + localhost dev override) and panel
   width.
2. Narrow-width layout pass on `/start` + practice if needed.
3. Icons + packaging; optional Web Store listing.

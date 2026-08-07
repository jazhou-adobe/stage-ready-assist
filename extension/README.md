# Stage Ready — Practice Panel

MV3 extension that opens the hosted practice app in a **narrow popup window
docked to the right edge** of your current window, so you can practice beside
whatever page you're viewing.

Why a popup window and not a side panel: Chrome side panels have no `tabId` and
their cross-origin iframe is denied camera/mic (`getUserMedia` →
`NotAllowedError`), which also blocks Web Speech. A popup window is a real
top-level context where mic/camera/speech work normally. See
`../docs/chrome-extension-spec.md`.

## Load it (unpacked)

1. Open `chrome://extensions`.
2. Toggle **Developer mode** (top-right).
3. Click **Load unpacked** and select this `extension/` folder.
4. Pin **Stage Ready — Practice Panel** and click its toolbar icon → a narrow
   window opens beside your page on the start screen. Clicking again focuses the
   existing window instead of opening a second one.

## What to verify

Start a practice session in the panel window and confirm:

1. **Camera + mic**: the permission prompt appears and the camera preview shows.
2. **Speech metrics**: WPM, filler counts, and teleprompter tracking update as
   you speak.
3. **Voice command**: saying **"start recording"** triggers the 3-2-1 countdown.
4. **Download**: the audio **.m4a** download works on the report screen.

All four should now work, since the app runs in a normal top-level window.

## Notes / next

- Target URL and panel width are constants in `background.js` for now; a later
  options page will make them configurable (incl. a localhost dev override).
- No host/mic/tabs permissions are requested — only `storage` (session), used
  to remember the open panel window and avoid duplicates.

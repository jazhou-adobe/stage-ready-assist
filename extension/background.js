// Stage Ready — open the hosted practice app in a narrow popup window docked to
// the right edge of the current window. A popup window is a real top-level
// browsing context, so mic/camera/Web Speech work (unlike a side panel, whose
// cross-origin iframe is denied getUserMedia — see docs/chrome-extension-spec.md).

const APP_URL = "https://stage-ready-ashen.vercel.app/start";
const PANEL_WIDTH = 480;
const TRACK_KEY = "panelWindowId";

async function getTrackedId() {
  const { [TRACK_KEY]: id } = await chrome.storage.session.get(TRACK_KEY);
  return typeof id === "number" ? id : null;
}

async function setTrackedId(id) {
  await chrome.storage.session.set({ [TRACK_KEY]: id ?? null });
}

async function openPanel() {
  // Reuse the existing panel window if it's still open.
  const trackedId = await getTrackedId();
  if (trackedId !== null) {
    try {
      await chrome.windows.get(trackedId);
      await chrome.windows.update(trackedId, { focused: true });
      return;
    } catch {
      await setTrackedId(null); // stale id — window was closed
    }
  }

  // Dock to the right edge of the currently focused window.
  let width = PANEL_WIDTH;
  let height = 800;
  let top = 0;
  let left = 0;
  try {
    const cur = await chrome.windows.getCurrent();
    height = cur.height ?? height;
    top = cur.top ?? 0;
    left = Math.max(0, (cur.left ?? 0) + (cur.width ?? 1280) - PANEL_WIDTH);
  } catch {
    /* fall back to defaults */
  }

  const win = await chrome.windows.create({
    url: APP_URL,
    type: "popup",
    width,
    height,
    top,
    left,
    focused: true,
  });
  await setTrackedId(win?.id ?? null);
}

chrome.action.onClicked.addListener(() => {
  openPanel().catch((err) =>
    console.warn("[stage-ready] openPanel failed:", err),
  );
});

chrome.windows.onRemoved.addListener(async (windowId) => {
  if (windowId === (await getTrackedId())) await setTrackedId(null);
});

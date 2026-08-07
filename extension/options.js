// Options for the Stage Ready practice panel. Persisted to chrome.storage.sync
// and read by the background service worker when opening the panel window.

const DEFAULTS = {
  appUrl: "https://stage-ready-ashen.vercel.app/start",
  panelWidth: 480,
};
const WIDTH_MIN = 320;
const WIDTH_MAX = 1200;

const urlEl = document.getElementById("url");
const widthEl = document.getElementById("width");
const statusEl = document.getElementById("status");

function showStatus(message, isError) {
  statusEl.textContent = message;
  statusEl.classList.toggle("err", Boolean(isError));
  statusEl.classList.add("show");
  window.setTimeout(() => statusEl.classList.remove("show"), 1600);
}

async function load() {
  const cfg = await chrome.storage.sync.get(DEFAULTS);
  urlEl.value = cfg.appUrl || DEFAULTS.appUrl;
  widthEl.value = String(cfg.panelWidth || DEFAULTS.panelWidth);
}

function validUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

async function save() {
  const appUrl = urlEl.value.trim();
  if (!validUrl(appUrl)) {
    showStatus("Enter a valid http(s) URL", true);
    return;
  }
  let panelWidth = Math.round(Number(widthEl.value));
  if (!Number.isFinite(panelWidth)) panelWidth = DEFAULTS.panelWidth;
  panelWidth = Math.min(WIDTH_MAX, Math.max(WIDTH_MIN, panelWidth));
  widthEl.value = String(panelWidth);

  await chrome.storage.sync.set({ appUrl, panelWidth });
  showStatus("Saved");
}

async function reset() {
  await chrome.storage.sync.set(DEFAULTS);
  await load();
  showStatus("Reset to defaults");
}

document.getElementById("save").addEventListener("click", save);
document.getElementById("reset").addEventListener("click", reset);
load();

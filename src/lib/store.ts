import { create } from "zustand";
import { persist, createJSONStorage, type StateStorage } from "zustand/middleware";
import type { RecentScript, SessionResult, SessionSummary } from "./types";

const STORAGE_KEY = "stage-ready:v1";
const FONT_MIN = 14;
const FONT_MAX = 48;
const FONT_DEFAULT = 20;
const FONT_STEP = 2;
const RECENT_LIMIT = 10;
const PREVIEW_LEN = 100;

const noopStorage: StateStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

const safeLocalStorage = (): StateStorage => {
  if (typeof window === "undefined") return noopStorage;
  try {
    const probe = "__stage_ready_probe__";
    window.localStorage.setItem(probe, probe);
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return noopStorage;
  }
};

// The session `result` is kept in sessionStorage (NOT localStorage): it must
// survive a page refresh but is intentionally discarded when the tab closes,
// and is never written to the persisted, disk-backed localStorage bucket.
const SESSION_RESULT_KEY = "stage-ready:result";

const safeSessionStorage = (): Storage | null => {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
};

const readSessionResult = (): SessionResult | null => {
  const ss = safeSessionStorage();
  if (!ss) return null;
  try {
    const raw = ss.getItem(SESSION_RESULT_KEY);
    return raw ? (JSON.parse(raw) as SessionResult) : null;
  } catch {
    return null;
  }
};

const writeSessionResult = (result: SessionResult | null): void => {
  const ss = safeSessionStorage();
  if (!ss) return;
  try {
    if (result) {
      // chartSnapshot is a heavy PNG data URL that nothing reads — drop it so
      // we stay well under the sessionStorage quota.
      const persisted: SessionResult = { ...result, chartSnapshot: "" };
      ss.setItem(SESSION_RESULT_KEY, JSON.stringify(persisted));
    } else {
      ss.removeItem(SESSION_RESULT_KEY);
    }
  } catch {
    // Quota exceeded or storage disabled — non-fatal; the report just won't
    // survive a refresh in that case.
  }
};

const makePreview = (text: string): string => {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= PREVIEW_LEN ? flat : flat.slice(0, PREVIEW_LEN);
};

const makeId = (): string => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
};

type HintState = {
  active: boolean;
  sentenceIndex: number | null;
};

type Theme = "light" | "dark";

type AppState = {
  script: string;
  scriptTitle: string;
  result: SessionResult | null;
  hint: HintState;
  scriptFontSize: number;
  theme: Theme;
  recentScripts: RecentScript[];

  setScript: (script: string) => void;
  setScriptTitle: (title: string) => void;
  setResult: (result: SessionResult | null) => void;
  clearResult: () => void;
  reset: () => void;
  hydrateResult: () => void;

  showHint: (sentenceIndex: number) => void;
  clearHint: () => void;

  increaseFont: () => void;
  decreaseFont: () => void;

  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;

  saveRecentScript: (input: { title: string; text: string }) => string;
  saveScriptSession: (scriptId: string, summary: SessionSummary) => void;
  deleteRecentScript: (id: string) => void;
  clearRecentScripts: () => void;
};

const initialHint: HintState = { active: false, sentenceIndex: null };

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      script: "",
      scriptTitle: "",
      result: null,
      hint: initialHint,
      scriptFontSize: FONT_DEFAULT,
      theme: "light",
      recentScripts: [],

      setScript: (script) => set({ script }),
      setScriptTitle: (scriptTitle) => set({ scriptTitle }),
      setResult: (result) => {
        set({ result });
        writeSessionResult(result);
      },
      clearResult: () => {
        set({ result: null });
        writeSessionResult(null);
      },
      reset: () => {
        set({
          script: "",
          scriptTitle: "",
          result: null,
          hint: initialHint,
        });
        writeSessionResult(null);
      },
      // Restore the session from sessionStorage after a refresh. Only fills a
      // null slot so an in-memory result from client-side navigation wins.
      hydrateResult: () => {
        if (get().result) return;
        const restored = readSessionResult();
        if (restored) set({ result: restored });
      },

      showHint: (sentenceIndex) =>
        set({ hint: { active: true, sentenceIndex } }),
      clearHint: () => set({ hint: initialHint }),

      increaseFont: () =>
        set((s) => ({
          scriptFontSize: Math.min(FONT_MAX, s.scriptFontSize + FONT_STEP),
        })),
      decreaseFont: () =>
        set((s) => ({
          scriptFontSize: Math.max(FONT_MIN, s.scriptFontSize - FONT_STEP),
        })),

      setTheme: (theme) => set({ theme }),
      toggleTheme: () =>
        set((s) => ({ theme: s.theme === "dark" ? "light" : "dark" })),

      saveRecentScript: ({ title, text }) => {
        const trimmedTitle = title.trim();
        const existing = get().recentScripts;
        const match = existing.find(
          (r) => r.title === trimmedTitle && r.text === text,
        );
        const id = match?.id ?? makeId();
        const now = Date.now();
        const entry: RecentScript = {
          id,
          title: trimmedTitle,
          text,
          preview: makePreview(text),
          savedAt: now,
          lastSession: match?.lastSession,
        };
        const next = [
          entry,
          ...existing.filter((r) => r.id !== id),
        ].slice(0, RECENT_LIMIT);
        set({ recentScripts: next });
        return id;
      },

      saveScriptSession: (scriptId, summary) => {
        const existing = get().recentScripts;
        if (!existing.some((r) => r.id === scriptId)) return;
        const now = Date.now();
        const updated = existing.map((r) =>
          r.id === scriptId
            ? { ...r, lastSession: summary, savedAt: now }
            : r,
        );
        updated.sort((a, b) => b.savedAt - a.savedAt);
        set({ recentScripts: updated });
      },

      deleteRecentScript: (id) =>
        set((s) => ({
          recentScripts: s.recentScripts.filter((r) => r.id !== id),
        })),

      clearRecentScripts: () => set({ recentScripts: [] }),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(safeLocalStorage),
      partialize: (state) => ({
        recentScripts: state.recentScripts,
        scriptFontSize: state.scriptFontSize,
        theme: state.theme,
      }),
      skipHydration: true,
    },
  ),
);

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

type AppState = {
  script: string;
  scriptTitle: string;
  result: SessionResult | null;
  hint: HintState;
  scriptFontSize: number;
  recentScripts: RecentScript[];

  setScript: (script: string) => void;
  setScriptTitle: (title: string) => void;
  setResult: (result: SessionResult | null) => void;
  clearResult: () => void;
  reset: () => void;

  showHint: (sentenceIndex: number) => void;
  clearHint: () => void;

  increaseFont: () => void;
  decreaseFont: () => void;

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
      recentScripts: [],

      setScript: (script) => set({ script }),
      setScriptTitle: (scriptTitle) => set({ scriptTitle }),
      setResult: (result) => set({ result }),
      clearResult: () => set({ result: null }),
      reset: () =>
        set({
          script: "",
          scriptTitle: "",
          result: null,
          hint: initialHint,
        }),

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
      }),
      skipHydration: true,
    },
  ),
);

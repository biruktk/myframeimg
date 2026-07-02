import { create } from "zustand";

import { DEV_APIS, groupApisByCategory } from "../data/apis";
import { paramDefaultsForApi } from "../lib/param-defaults";
import type { Api, ConsoleEntry, ExecutionResult, CodeLanguage, MenuSection, LiveBootstrap } from "../types";

const THEME_KEY = "myframe-dev-theme";

function getStoredTheme(): "light" | "dark" | "system" {
  if (typeof localStorage === "undefined") return "system";
  const v = localStorage.getItem(THEME_KEY);
  if (v === "light" || v === "dark" || v === "system") return v;
  return "system";
}

interface DevStore {
  theme: "light" | "dark" | "system";
  setTheme: (theme: "light" | "dark" | "system") => void;
  debugMode: boolean;
  toggleDebug: () => void;
  selectedSection: MenuSection;
  setSelectedSection: (section: MenuSection) => void;
  selectedApi: Api | null;
  setSelectedApi: (api: Api | null) => void;
  selectedItemId: string | null;
  setSelectedItemId: (id: string | null) => void;
  groupedApis: Record<string, Api[]>;
  allApis: Api[];
  liveBootstrap: LiveBootstrap | null;
  liveBootstrapLoading: boolean;
  setLiveBootstrap: (data: LiveBootstrap | null) => void;
  setLiveBootstrapLoading: (loading: boolean) => void;
  executionResult: ExecutionResult;
  setExecutionResult: (result: ExecutionResult) => void;
  paramValues: Record<string, string>;
  setParamValue: (name: string, value: string) => void;
  selectedLanguage: CodeLanguage;
  setSelectedLanguage: (lang: CodeLanguage) => void;
  consoleEntries: ConsoleEntry[];
  addConsoleEntry: (entry: ConsoleEntry) => void;
  clearConsole: () => void;
}

export const useDevStore = create<DevStore>((set, get) => ({
  theme: getStoredTheme(),
  setTheme: (theme) => {
    localStorage.setItem(THEME_KEY, theme);
    set({ theme });
  },
  debugMode: true,
  toggleDebug: () => set((s) => ({ debugMode: !s.debugMode })),
  selectedSection: "quick-guide",
  setSelectedSection: (section) => set({ selectedSection: section, selectedApi: null, selectedItemId: null }),
  selectedApi: null,
  setSelectedApi: (api) => {
    const bootstrap = get().liveBootstrap;
    set({
      selectedApi: api,
      selectedSection: api ? "api-list" : get().selectedSection,
      selectedItemId: api ? api.id : null,
      paramValues: api ? paramDefaultsForApi(api, bootstrap) : {},
      executionResult: { status: "idle" },
    });
  },
  selectedItemId: "auth",
  setSelectedItemId: (id) => set({ selectedItemId: id }),
  allApis: DEV_APIS,
  groupedApis: groupApisByCategory(),
  liveBootstrap: null,
  liveBootstrapLoading: false,
  setLiveBootstrap: (data) => {
    set({ liveBootstrap: data });
    const api = get().selectedApi;
    if (api && data) {
      set({ paramValues: paramDefaultsForApi(api, data) });
    }
  },
  setLiveBootstrapLoading: (loading) => set({ liveBootstrapLoading: loading }),
  executionResult: { status: "idle" },
  setExecutionResult: (result) => set({ executionResult: result }),
  paramValues: {},
  setParamValue: (name, value) => set((s) => ({ paramValues: { ...s.paramValues, [name]: value } })),
  selectedLanguage: "curl",
  setSelectedLanguage: (lang) => set({ selectedLanguage: lang }),
  consoleEntries: [],
  addConsoleEntry: (entry) => set((s) => ({ consoleEntries: [...s.consoleEntries, entry].slice(-300) })),
  clearConsole: () => set({ consoleEntries: [] }),
}));

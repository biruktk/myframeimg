import { create } from "zustand";
import type { Api, MenuSection, ConsoleEntry, ExecutionResult, CodeLanguage } from "../types";
import apisData from "../data/apis.json";

const THEME_KEY = "myframe-dev-theme";

function getStoredTheme(): "light" | "dark" | "system" {
  if (typeof localStorage === "undefined") return "system";
  const v = localStorage.getItem(THEME_KEY);
  if (v === "light" || v === "dark" || v === "system") return v;
  return "system";
}

function groupApisByCategory(): Record<string, Api[]> {
  const apis = (apisData as { apis: Api[] }).apis;
  const grouped: Record<string, Api[]> = {};
  for (const api of apis) {
    if (!grouped[api.category]) grouped[api.category] = [];
    grouped[api.category].push(api);
  }
  return grouped;
}

interface AppState {
  // Theme
  theme: "light" | "dark" | "system";
  setTheme: (theme: "light" | "dark" | "system") => void;

  // Debug mode
  debugMode: boolean;
  toggleDebug: () => void;

  // Menu
  selectedSection: MenuSection;
  setSelectedSection: (section: MenuSection) => void;
  selectedApi: Api | null;
  setSelectedApi: (api: Api | null) => void;
  selectedItemId: string | null;
  setSelectedItemId: (id: string | null) => void;

  // Derived data
  groupedApis: Record<string, Api[]>;
  allApis: Api[];

  // API execution
  executionResult: ExecutionResult;
  setExecutionResult: (result: ExecutionResult) => void;
  paramValues: Record<string, string>;
  setParamValue: (name: string, value: string) => void;
  resetParams: () => void;

  // Code generation
  selectedLanguage: CodeLanguage;
  setSelectedLanguage: (lang: CodeLanguage) => void;

  // Console
  consoleEntries: ConsoleEntry[];
  addConsoleEntry: (entry: ConsoleEntry) => void;
  clearConsole: () => void;
}

export const useStore = create<AppState>((set, get) => ({
  // Theme
  theme: getStoredTheme(),
  setTheme: (theme) => {
    localStorage.setItem(THEME_KEY, theme);
    set({ theme });
  },

  // Debug mode (on by default)
  debugMode: true,
  toggleDebug: () => set((s) => ({ debugMode: !s.debugMode })),

  // Menu
  selectedSection: "api-list",
  setSelectedSection: (section) => set({ selectedSection: section, selectedApi: null, selectedItemId: null }),
  selectedApi: null,
  setSelectedApi: (api) =>
    set({
      selectedApi: api,
      selectedSection: api ? "api-list" : get().selectedSection,
      selectedItemId: api ? api.id : null,
      paramValues: {},
      executionResult: { status: "idle" },
    }),
  selectedItemId: null,
  setSelectedItemId: (id) => set({ selectedItemId: id }),

  // Derived data
  allApis: (apisData as { apis: Api[] }).apis,
  groupedApis: groupApisByCategory(),

  // API execution
  executionResult: { status: "idle" },
  setExecutionResult: (result) => set({ executionResult: result }),
  paramValues: {},
  setParamValue: (name, value) =>
    set((s) => ({ paramValues: { ...s.paramValues, [name]: value } })),
  resetParams: () => set({ paramValues: {}, executionResult: { status: "idle" } }),

  // Code generation
  selectedLanguage: "javascript",
  setSelectedLanguage: (lang) => set({ selectedLanguage: lang }),

  // Console
  consoleEntries: [],
  addConsoleEntry: (entry) =>
    set((s) => ({
      consoleEntries: [...s.consoleEntries, entry].slice(-200),
    })),
  clearConsole: () => set({ consoleEntries: [] }),
}));

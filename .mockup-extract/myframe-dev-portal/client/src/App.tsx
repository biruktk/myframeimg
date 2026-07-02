import { useState, useEffect, useRef } from "react";
import { Menu as MenuIcon, X, Sun, Moon, Monitor, Bug, BugOff, Terminal } from "lucide-react";
import Menu from "./components/Menu";
import Description from "./components/Description";
import ApiPanel from "./components/ApiPanel";
import ConsoleBar from "./components/Console";
import { useThemeSync } from "./hooks/useThemeSync";
import { useStore } from "./store/useStore";
import { DOC_VERSION } from "./const";

function App() {
  const { theme, setTheme, debugMode, toggleDebug, selectedSection, selectedApi } = useStore();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [apiPanelOpen, setApiPanelOpen] = useState(false);
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const isLargeScreen = useRef(window.innerWidth >= 1024);

  useThemeSync();

  // Show API panel on large screens by default
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    isLargeScreen.current = mq.matches;
    if (mq.matches) setApiPanelOpen(true);
    const handler = (e: MediaQueryListEvent) => {
      isLargeScreen.current = e.matches;
      setApiPanelOpen(e.matches);
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Auto-open API panel when an API is selected on mobile
  useEffect(() => {
    if (selectedApi && !isLargeScreen.current) {
      setApiPanelOpen(true);
    }
  }, [selectedApi]);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Header */}
      <header className="h-14 bg-card border-b border-border flex items-center px-4 flex-shrink-0 sticky top-0 z-40">
        <div className="flex items-center gap-1 sm:gap-3 flex-1 min-w-0">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="lg:hidden p-2 hover:bg-secondary rounded-lg transition-colors flex-shrink-0"
            aria-label="Toggle sidebar"
          >
            {sidebarOpen ? <X size={20} /> : <MenuIcon size={20} />}
          </button>

          <div className="flex items-center gap-2 min-w-0">
            <div className="w-6 h-6 bg-gradient-to-br from-amber-400 to-orange-500 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
              MF
            </div>
            <span className="text-sm font-semibold truncate">MyFrame Dev</span>
            <span className="text-xs text-muted-foreground hidden lg:inline">v{DOC_VERSION}</span>
          </div>
        </div>

        <div className="flex items-center gap-1 sm:gap-2 ml-auto flex-shrink-0">
          {/* API Panel Toggle (mobile/tablet) */}
          <button
            onClick={() => setApiPanelOpen(!apiPanelOpen)}
            className={`lg:hidden flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              apiPanelOpen
                ? "bg-primary/15 text-primary"
                : "text-foreground bg-secondary hover:bg-border"
            }`}
            aria-label="Toggle API panel"
          >
            <Terminal size={15} />
            API
          </button>

          {/* Debug Toggle */}
          <button
            onClick={toggleDebug}
            className={`p-2 rounded-lg transition-colors ${
              debugMode
                ? "bg-amber-500/15 text-amber-400 hover:bg-amber-500/25"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary"
            }`}
            aria-label="Toggle debug console"
            title={debugMode ? "Disable debug console" : "Enable debug console"}
          >
            {debugMode ? <Bug size={18} /> : <BugOff size={18} />}
          </button>

          {/* Theme Switch */}
          <div className="relative">
            <button
              onClick={() => setThemeMenuOpen((o) => !o)}
              className="p-2 hover:bg-secondary rounded-lg transition-colors text-muted-foreground hover:text-foreground"
              aria-label="Theme"
              title="Theme"
            >
              {theme === "light" && <Sun size={18} />}
              {theme === "dark" && <Moon size={18} />}
              {theme === "system" && <Monitor size={18} />}
            </button>
            {themeMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" aria-hidden onClick={() => setThemeMenuOpen(false)} />
                <div className="absolute right-0 top-full mt-1 py-1 w-36 bg-popover border border-border rounded-lg shadow-lg z-50">
                  {(["light", "dark", "system"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => { setTheme(t); setThemeMenuOpen(false); }}
                      className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 ${
                        theme === t ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                      }`}
                    >
                      {t === "light" && <Sun size={16} />}
                      {t === "dark" && <Moon size={16} />}
                      {t === "system" && <Monitor size={16} />}
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Menu — sliding overlay on < lg, persistent sidebar on lg+ */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/30 z-20 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}
        <aside
          className={[
            "fixed lg:relative inset-y-0 left-0 z-30",
            "w-64 lg:w-56 xl:w-64",
            "bg-card border-r border-border overflow-y-auto flex-shrink-0",
            "transition-transform duration-200 ease-in-out",
            sidebarOpen ? "translate-x-0" : "-translate-x-full",
            "lg:translate-x-0",
          ].join(" ")}
        >
          <Menu />
        </aside>

        {/* Center: Description + Console */}
        <div className="flex-1 flex flex-col min-w-0">
          <main className="flex-1 overflow-y-auto min-h-0">
            <Description />
          </main>
          {debugMode && (
            <div className="flex-1 flex flex-col border-t border-border min-h-0">
              <ConsoleBar />
            </div>
          )}
        </div>

        {/* Right: API Panel — bottom sheet on mobile, sidebar on desktop */}
        {apiPanelOpen && (
          <div
            className="fixed inset-0 bg-black/20 z-20 lg:hidden"
            onClick={() => setApiPanelOpen(false)}
          />
        )}
        <aside
          className={[
            // Mobile: bottom sheet
            "fixed bottom-0 left-0 right-0 z-30 lg:static",
            "max-h-[70vh] lg:max-h-none",
            "bg-card border-t lg:border-t-0 lg:border-l border-border",
            "overflow-y-auto flex-shrink-0",
            "rounded-t-2xl lg:rounded-none",
            "shadow-2xl lg:shadow-none",
            // Slide up/down on mobile, static on desktop
            "transition-transform duration-200 ease-in-out",
            apiPanelOpen ? "translate-y-0" : "translate-y-full",
            "lg:translate-y-0",
            // Desktop sidebar sizing
            "lg:w-80 xl:w-96",
          ].join(" ")}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-border lg:hidden">
            <div className="w-8 h-1 rounded-full bg-border mx-auto absolute left-1/2 -translate-x-1/2 top-2" />
            <span className="text-sm font-semibold">API Panel</span>
            <button
              onClick={() => setApiPanelOpen(false)}
              className="p-1 hover:bg-secondary rounded transition-colors"
            >
              <X size={18} />
            </button>
          </div>
          <ApiPanel />
        </aside>
      </div>
    </div>
  );
}

export default App;

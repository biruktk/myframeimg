import { useEffect } from "react";

import { useDevStore } from "../store/use-dev-store";

export function useThemeSync(rootRef: React.RefObject<HTMLElement | null>) {
  const theme = useDevStore((s) => s.theme);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;

    const apply = (isDark: boolean) => {
      if (isDark) el.classList.add("dark");
      else el.classList.remove("dark");
    };

    if (theme === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      apply(mq.matches);
      const handler = (e: MediaQueryListEvent) => apply(e.matches);
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    }

    apply(theme === "dark");
  }, [theme, rootRef]);
}

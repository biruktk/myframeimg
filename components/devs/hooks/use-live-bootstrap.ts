"use client";

import { useEffect } from "react";

import { useDevStore } from "../store/use-dev-store";

export function useLiveBootstrap() {
  const { liveBootstrap, liveBootstrapLoading, setLiveBootstrap, setLiveBootstrapLoading } = useDevStore();

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLiveBootstrapLoading(true);
      try {
        const res = await fetch("/api/devs/bootstrap", { cache: "no-store", credentials: "include" });
        if (!res.ok) return;
        const data = (await res.json()) as { ok?: boolean };
        if (!cancelled && data.ok) setLiveBootstrap(data as Parameters<typeof setLiveBootstrap>[0]);
      } finally {
        if (!cancelled) setLiveBootstrapLoading(false);
      }
    }

    void load();
    const t = setInterval(() => void load(), 60_000);

    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [setLiveBootstrap, setLiveBootstrapLoading]);

  return { liveBootstrap, liveBootstrapLoading };
}

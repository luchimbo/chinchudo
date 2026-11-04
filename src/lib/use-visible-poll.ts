"use client";
import { useEffect, useRef } from "react";

/** One request at a time, canceled on unmount, with visibility pause and backoff. */
export function useVisiblePoll<T>(url: string | null, receive: (value: T) => void, active = true) {
  const callback = useRef(receive);
  callback.current = receive;
  useEffect(() => {
    if (!url) return;
    let stopped = false, running = false, failures = 0;
    let timer: ReturnType<typeof setTimeout>;
    let controller: AbortController | undefined;
    const poll = async () => {
      clearTimeout(timer);
      if (stopped || running || document.hidden) return;
      running = true;
      controller = new AbortController();
      try {
        const response = await fetch(url, { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]) });
        if (response.status === 401 || response.status === 403) { stopped = true; return; }
        if (!response.ok) throw new Error("poll_failed");
        const value = await response.json() as T;
        if (!stopped) callback.current(value);
        failures = 0;
      } catch { failures++; }
      finally { running = false; if (!stopped && !document.hidden) timer = setTimeout(poll, Math.min(60_000, (active ? 3000 : 20_000) * 2 ** Math.min(failures, 4))); }
    };
    const wake = () => { if (document.hidden) { clearTimeout(timer); controller?.abort(); } else void poll(); };
    document.addEventListener("visibilitychange", wake);
    void poll();
    return () => { stopped = true; clearTimeout(timer); controller?.abort(); document.removeEventListener("visibilitychange", wake); };
  }, [url, active]);
}

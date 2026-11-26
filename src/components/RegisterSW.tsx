"use client";

import { useEffect } from "react";

/** Registers the service worker (installable app + offline page). */
export function RegisterSW() {
  useEffect(() => {
    if ("serviceWorker" in navigator && location.protocol === "https:") {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
  }, []);
  return null;
}

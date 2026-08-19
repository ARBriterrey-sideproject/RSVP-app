"use client";

import { useEffect } from "react";

/**
 * Registers `/sw.js` — see that file for the caching strategy. Production
 * only: Turbopack's dev server rewrites `_next/static` chunks on every save,
 * and a service worker sitting in front of that turns Fast Refresh into
 * "edit, save, still see the old page" with nothing in the console to explain
 * it. Nothing here is guest-specific; unlike `InstallPrompt`'s manifest link,
 * offline caching should apply to every visitor, not just ones with a
 * recovery code.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js");
  }, []);

  return null;
}

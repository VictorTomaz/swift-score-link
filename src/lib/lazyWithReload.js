import { lazy } from "react";

const RELOAD_KEY = "lazy-chunk-reload-attempted";

/**
 * Reload once when a deployed lazy chunk is missing from the current client.
 * The session flag prevents a broken deployment from causing a reload loop.
 */
export function lazyWithReload(importer) {
  return lazy(async () => {
    try {
      const module = await importer();
      try { window.sessionStorage.removeItem(RELOAD_KEY); } catch { /* storage may be unavailable */ }
      return module;
    } catch (error) {
      let alreadyReloaded = false;
      try {
        alreadyReloaded = window.sessionStorage.getItem(RELOAD_KEY) === "1";
        if (!alreadyReloaded) window.sessionStorage.setItem(RELOAD_KEY, "1");
      } catch { alreadyReloaded = true; }

      if (!alreadyReloaded && typeof window !== "undefined") {
        window.location.reload();
        return new Promise(() => {});
      }
      throw error;
    }
  });
}

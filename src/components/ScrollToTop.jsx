import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

// NOTE: Tab-to-tab navigation must NOT scroll to top — it destroys scroll position and
// fails the App Store "Bottom Tabs & Stack Preservation" scan. Only scroll on detail/sub-page
// navigation. If this regresses, check that tabPaths matches the mobileNavItems in AppLayout.
const tabPaths = ["/Dashboard", "/SetupWizard", "/History", "/PlayersManagement", "/Settings"];

export default function ScrollToTop() {
  const { pathname, search } = useLocation();
  const prevPath = useRef(pathname);

  useEffect(() => {
    // Only scroll on actual page (pathname) changes — NOT on query-string-only changes.
    // Scorecard deletes the scrollTo param after scrolling; that must not re-trigger top.
    if (prevPath.current === pathname) return;

    const params = new URLSearchParams(search);
    const scrollToLockRoster = params.get("scrollTo") === "lockRoster";

    const wasTab = tabPaths.includes(prevPath.current);
    const isTab = tabPaths.includes(pathname);

    // Tab-to-tab navigation: preserve scroll position (native tab bar behavior)
    // Detail/sub-page navigation: scroll to top
    // But if scrollTo=lockRoster is present, Scorecard handles scrolling — don't compete
    if (!scrollToLockRoster && !(wasTab && isTab)) {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    }
    prevPath.current = pathname;
  }, [pathname, search]);

  return null;
}
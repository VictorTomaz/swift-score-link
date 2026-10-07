// The app uses HashRouter, so route query params live inside the hash
// (`/#/Scorecard?id=abc`) and `window.location.search` is always empty.
// Use this when a param is needed outside the router hooks; inside components
// prefer `useLocation()` / `useSearchParams()`.
export function getRouteParam(name) {
  try {
    const hash = window.location.hash || "";
    const queryStart = hash.indexOf("?");
    if (queryStart !== -1) {
      const value = new URLSearchParams(hash.slice(queryStart + 1)).get(name);
      if (value !== null) return value;
    }
    return new URLSearchParams(window.location.search).get(name);
  } catch {
    return null;
  }
}

# Scroll-to-Lock-Roster Fix

## Symptom
Navigating from TournamentLogistics back to Scorecard via the "Back to Locking in Roster and Entering Scores" button failed to scroll the page down to the "Lock Roster & Start Scoring" button.

## Root Causes
1. **Interval killed before it could scroll** — the `useEffect` depended on `[round]`, so every refetch (initial load, cache invalidation, realtime broadcast) tore down and restarted the interval. If refetches happened within 150ms, no tick ever executed.
2. **`else` branch scrolled to "bottom" of a tiny skeleton page** — while the round was loading, the page was just a skeleton (~200px tall), so `scrollTo(0, scrollHeight)` put you at the top.
3. **No `scrollTo` param in the URL when no round was selected** — `selectedRound` is `null` when TournamentLogistics first loads, so the param was dropped.

## Fix
- `src/pages/Scorecard.jsx`: scroll effect now runs mount-only (`[]` dependency), waits patiently for the button to appear (no else-branch scroll), then scrolls once and cleans up the URL param.
- `src/pages/TournamentLogistics.jsx`: navigation button falls back to `sessionStorage.getItem("lastRoundId")` when `selectedRound` is null, ensuring the `scrollTo=lockRoster` param is always included.

## Key Principle
Scroll effects that poll for a DOM element should NOT depend on the data they're waiting for — data refetches tear down the interval before it can fire.
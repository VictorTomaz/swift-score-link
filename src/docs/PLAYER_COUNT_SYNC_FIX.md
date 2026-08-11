# Player Count Sync Fix — PlayerRoster

## Problem
The blue reminder banner in `PlayerRoster.jsx` ("You originally set up this round for X players…") showed a stale `player_count` when the user returned from the Setup Wizard after changing the count.

## Root Cause
`originalPlayerCount` was captured **once** (only when falsy) from `round.player_count` during the initial Scorecard load. When the wizard updated `player_count` and the user navigated back, the React Query cache might briefly return the old value — which then got locked in permanently and never updated to the new value.

## Fix
Changed the sync logic to **always** update `originalPlayerCount` from `round.player_count` whenever it changes (not just when falsy). This is safe because the wizard saves `player_count` as a configuration field and does **not** auto-update it on roster add/remove — so `round.player_count` always reflects the latest wizard-set value.

### Location
`src/components/scorecard/PlayerRoster.jsx` — the `useEffect` that syncs `originalPlayerCount`.

```js
// Always sync originalPlayerCount with round.player_count.
if (round.player_count) {
  setOriginalPlayerCount(round.player_count);
}
```

## Related
- SetupWizard save logic was refactored to send only config fields (not the entire Round entity), preventing roster/score data from being overwritten by stale snapshots.
- `Step6PlayerCount` was updated to initialize from the `form` object so previously selected counts persist when navigating backward through wizard steps.
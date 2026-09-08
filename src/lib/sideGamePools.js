// Side game player pools (KP, gross/net skins, deuce).
//
// Historically an empty pool list meant "everyone participates" — it was the
// default for a round that had never been configured. That made it impossible
// to record "nobody" (unchecking every player just snapped all boxes back on
// and the pot still paid the whole field).
//
// A cleared pool is now stored as [POOL_NONE], which is unambiguous:
//   undefined / []        → never configured → all players
//   [POOL_NONE]           → explicitly nobody
//   [id, id, ...]         → exactly those players

export const POOL_NONE = '__NONE__';

/** True when the pool was explicitly cleared (nobody participates). */
export function isPoolNone(poolIds) {
  return Array.isArray(poolIds) && poolIds.length === 1 && poolIds[0] === POOL_NONE;
}

/** Convert a UI selection into the value to persist. */
export function toStoredPoolIds(selectedIds) {
  const ids = (selectedIds || []).filter(id => id && id !== POOL_NONE);
  return ids.length > 0 ? ids : [POOL_NONE];
}

/** Convert a stored pool into the list of checked player ids for the UI. */
export function toSelectedPoolIds(poolIds, allPlayerIds) {
  if (isPoolNone(poolIds)) return [];
  if (Array.isArray(poolIds) && poolIds.length > 0) return poolIds;
  return allPlayerIds;
}
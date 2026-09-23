/**
 * A declared gross playoff winner should read as THE winner, so within a tie for
 * the same gross score they're listed ahead of the players they beat.
 * Ordering only — scores, ranks and payouts are untouched.
 */
export function orderChampionsFirst(grossResults, round) {
  const champIds = new Set(
    (Array.isArray(round?.flight_champions) ? round.flight_champions : [])
      .filter((c) => (c.division || "gross") === "gross")
      .map((c) => c.player_id)
      .filter(Boolean)
  );
  if (!round?.champion_enabled || champIds.size === 0) return grossResults || [];
  return (grossResults || [])
    .map((r, i) => ({ r, i }))
    .sort((a, b) => {
      if (a.r.gross_total === b.r.gross_total) {
        const diff = (champIds.has(b.r.player_id) ? 1 : 0) - (champIds.has(a.r.player_id) ? 1 : 0);
        if (diff !== 0) return diff;
      }
      return a.i - b.i;
    })
    .map(({ r }) => r);
}
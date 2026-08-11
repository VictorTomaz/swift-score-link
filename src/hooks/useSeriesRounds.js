import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

/**
 * Shared, cached fetch of every round in a multi-day series (parent + all
 * children). Both the Results page (final-day check) and the CumulativeScorecard
 * call this with the same anchor id, so React Query deduplicates them into ONE
 * network call per series and serves the 5-minute cache on rapid refreshes.
 *
 * The getSeriesRounds backend function enforces RLS via a user-context get
 * (with retries) then fetches the rest of the series via the service role —
 * reliable, no intermittent empty results.
 */
export function useSeriesRounds(round) {
  const anchorId = round?.parent_round_id || round?.id;
  return useQuery({
    queryKey: ["series-rounds", anchorId],
    queryFn: async () => {
      if (!round) return [];
      try {
        const res = await base44.functions.invoke("getSeriesRounds", { roundId: round.id });
        const data = res?.data || res;
        // Only trust the function result if it found more than just the
        // current round AND the anchor (parent) round is actually included.
        // The function's service-role get for the parent intermittently
        // fails in the Deno runtime — when that happens it silently replaces
        // the parent with the current round, so the parent (Flight 1) and its
        // side games vanish from the Results page.
        if (data?.rounds && data.rounds.length > 1) {
          const hasAnchor = data.rounds.some(r => r.id === anchorId);
          if (hasAnchor) return data.rounds;
        }
      } catch (e) { /* fall back below */ }
      // Fallback: fetch parent + children directly via user-context SDK.
      // The user owns all their rounds, so RLS allows this.
      try {
        const anchorId = round.parent_round_id || round.id;
        const children = await base44.entities.Round.filter({ parent_round_id: anchorId });
        let parent = round;
        if (round.parent_round_id) {
          // Use .get() — filter({ id }) does not work for the built-in id field.
          parent = await base44.entities.Round.get(anchorId);
        }
        const all = [parent, ...children].filter(Boolean);
        const seen = new Set();
        const unique = all.filter(r => (seen.has(r.id) ? false : (seen.add(r.id), true)));
        if (unique.length > 1) return unique;
      } catch (e2) { /* final fallback below */ }
      return [round];
    },
    enabled: !!(round?.is_multi_day || round?.is_multi_flight) && !!anchorId,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

/**
 * True when `round` belongs to the final flight of a hybrid series.
 * Uses the explicit `is_final_flight` flag when set; otherwise auto-detects
 * by checking if this round's flight_number is the highest in the series.
 */
export function isFinalFlightRound(round, seriesRounds) {
  if (!round?.is_multi_flight) return true;
  // The is_final_flight flag is ONLY meaningful for hybrid (multi-day +
  // multi-flight) tournaments. For multi-flight-only, the final flight is
  // always auto-detected from flight_number — the flag defaults to false and
  // must not short-circuit the detection.
  const isHybrid = !!(round?.is_multi_day && round?.is_multi_flight);
  if (isHybrid) {
    if (round.is_final_flight === true) return true;
    if (round.is_final_flight === false) return false;
  }
  const all = seriesRounds || [];
  if (all.length === 0) return true;
  const maxFlight = Math.max(...all.map(r => r.flight_number || 1));
  return (round.flight_number || 1) >= maxFlight;
}

/**
 * True when `round` is the final day of its series — the raw is_series_final
 * flag (explicit or auto-detected from dates), WITHOUT the final-flight
 * check. For hybrid tournaments, use isSeriesFinalDay (requires both).
 */
export function isFinalDayRaw(round, seriesRounds) {
  if ((!round?.is_multi_day && !round?.is_multi_flight) || !round?.parent_round_id) return false;
  if (round.is_series_final === true) return true;
  if (round.is_series_final === false) return false;
  const children = (seriesRounds || []).filter(r => r.parent_round_id);
  if (children.length === 0) return false;
  const sorted = [...children].sort((a, b) => new Date(b.date) - new Date(a.date));
  return sorted[0]?.id === round.id;
}

/**
 * True when `round` is the final day of its multi-day series — the point at
 * which the main gross/net purse pays out.
 *
 * For hybrid (multi-day + multi-flight) tournaments, the main purse pays
 * only on the final day of the FINAL flight. Both conditions must be true:
 *   1. isFinalFlightRound — this round is in the last flight
 *   2. isFinalDayRaw — this round is the latest-dated (or explicitly flagged)
 *
 * For non-hybrid series, the single is_series_final flag (or date inference)
 * is sufficient — there's only one "flight" of the same players.
 */
export function isSeriesFinalDay(round, seriesRounds) {
  if ((!round?.is_multi_day && !round?.is_multi_flight) || !round?.parent_round_id) return false;
  const isHybrid = !!(round?.is_multi_day && round?.is_multi_flight);
  if (isHybrid) {
    if (!isFinalFlightRound(round, seriesRounds)) return false;
    return isFinalDayRaw(round, seriesRounds);
  }
  return isFinalDayRaw(round, seriesRounds);
}
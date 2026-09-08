import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

/**
 * Loads every round of a tournament series (parent + all flights/days) from a
 * single anchor id. Same fetch strategy as TournamentResults: prefer the
 * service-role backend function, fall back to a user-context children filter
 * when it intermittently returns only the parent.
 */
export function useTournamentSeries(anchorId) {
  return useQuery({
    queryKey: ["tournament-series", anchorId],
    queryFn: async () => {
      let rounds = [];
      try {
        const res = await base44.functions.invoke("getSeriesRounds", { roundId: anchorId });
        const data = res?.data || res;
        rounds = data?.rounds || [];
      } catch (e) { /* fall back below */ }

      if (rounds.length <= 1) {
        try {
          const children = await base44.entities.Round.filter({ parent_round_id: anchorId }, '-created_date', 200);
          let parent = rounds[0];
          if (!parent) {
            try { parent = await base44.entities.Round.get(anchorId); }
            catch (e) { parent = null; }
          }
          const seen = new Set();
          rounds = [parent, ...children].filter(Boolean)
            .filter(r => (seen.has(r.id) ? false : (seen.add(r.id), true)));
        } catch (e2) { /* keep whatever we have */ }
      }
      return rounds;
    },
    enabled: !!anchorId,
  });
}

/** True when a score value counts as entered. */
const hasScore = (s) => s !== '' && s !== null && s !== undefined;

/**
 * Shapes the flat series into ordered flights, each with its days and a
 * scoring-progress summary. Pure display logic — no payout math.
 */
export function buildFlightStructure(seriesRounds) {
  const byFlight = new Map();
  (seriesRounds || []).filter(Boolean).forEach(r => {
    const fn = r.flight_number || 1;
    if (!byFlight.has(fn)) byFlight.set(fn, []);
    byFlight.get(fn).push(r);
  });

  return [...byFlight.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([flightNumber, rounds]) => {
      const days = [...rounds]
        .sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0))
        .map((r, i) => {
          const players = r.players || [];
          const scored = players.filter(p => (p.scores || []).some(hasScore)).length;
          return {
            round: r,
            dayNumber: i + 1,
            scored,
            total: players.length,
            complete: players.length > 0 && scored === players.length,
          };
        });
      return {
        flightNumber,
        label: rounds.find(r => r.flight_name)?.flight_name || `Flight ${flightNumber}`,
        days,
        allComplete: days.length > 0 && days.every(d => d.complete),
      };
    });
}

/**
 * The round that carries the combined tournament results: the latest day of
 * the highest-numbered flight. Finalizing sets the series flags here.
 */
export function findFinalRound(seriesRounds) {
  const pool = (seriesRounds || []).filter(Boolean);
  if (pool.length === 0) return null;
  return pool.reduce((best, r) => {
    const rFn = r.flight_number || 1;
    const bFn = best.flight_number || 1;
    if (rFn !== bFn) return rFn > bFn ? r : best;
    return new Date(r.date || 0) > new Date(best.date || 0) ? r : best;
  }, pool[0]);
}
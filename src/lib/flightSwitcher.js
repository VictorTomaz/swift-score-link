/**
 * Helpers for the Scorecard flight switcher.
 */

const isValidScore = (s) => {
  if (s === null || s === undefined || s === "") return false;
  const str = String(s).trim().toUpperCase();
  if (str === "X") return true;
  const n = parseInt(str, 10);
  return !isNaN(n) && n >= 1 && n <= 20;
};

/** Display name for a flight round. */
export function flightLabel(round) {
  return round?.flight_name || `Flight ${round?.flight_number || 1}`;
}

/**
 * Scoring status of a flight: 'complete' (results computed), 'in_progress'
 * (some scores entered), or 'not_started'.
 */
export function flightScoringStatus(round) {
  if (round?.status === "completed") return "complete";
  const players = round?.players || [];
  const hasAny = players.some(p => (p.scores || []).some(isValidScore));
  return hasAny ? "in_progress" : "not_started";
}

/**
 * Status of an entire flight across all of its days: 'complete' only when every
 * round in that flight is completed.
 */
export function flightAggregateStatus(flightNumber, seriesRounds, activeRound) {
  const all = (seriesRounds || []).filter(Boolean);
  const rounds = all
    .filter(r => (r.flight_number || 1) === flightNumber)
    .map(r => (activeRound && r.id === activeRound.id ? activeRound : r));
  if (rounds.length === 0) return "not_started";
  const statuses = rounds.map(flightScoringStatus);
  if (statuses.every(s => s === "complete")) {
    // A flight is only truly complete when it has a round for EVERY day being
    // played across the tournament. If another flight has a round on a date this
    // flight doesn't (e.g. its Day 2 round hasn't been created yet), the flight
    // is still in progress for that day — not complete.
    const flightDates = new Set(rounds.map(r => r.date || ""));
    const allDates = new Set(all.map(r => r.date || "").filter(Boolean));
    for (const d of allDates) {
      if (!flightDates.has(d)) return "in_progress";
    }
    return "complete";
  }
  if (statuses.some(s => s !== "not_started")) return "in_progress";
  return "not_started";
}

/**
 * One target round per flight in this tournament, sorted by flight number.
 * For each flight we prefer the round on the same date as `round`; if that
 * flight isn't playing that date, fall back to its latest-dated round so the
 * organizer can still jump to it.
 */
export function sameDayFlights(round, seriesRounds) {
  if (!round?.is_multi_flight) return [];
  const all = (seriesRounds || []).filter(Boolean);
  if (all.length === 0) return [];
  // Priority for each flight's jump target: a round still being scored beats
  // a finished one; otherwise the latest-dated round of that flight.
  const rank = (r) => (r.status !== "completed" ? 2 : 1);
  const byFlight = new Map();
  for (const r of all) {
    const fn = r.flight_number || 1;
    const current = byFlight.get(fn);
    if (!current) { byFlight.set(fn, r); continue; }
    if (rank(r) > rank(current)) byFlight.set(fn, r);
    else if (rank(r) === rank(current) && (r.date || "") > (current.date || "")) byFlight.set(fn, r);
  }
  // The round being viewed always represents its own flight (keeps the chip highlighted)
  byFlight.set(round.flight_number || 1, round);
  return [...byFlight.entries()].sort((a, b) => a[0] - b[0]).map(([, r]) => r);
}
import { base44 } from "@/api/base44Client";

const d = (s) => new Date(String(s || "").replace(/-/g, "/"));

/**
 * All prior (earlier-dated) rounds this round should be seeded from.
 * Multi-flight: prior days of the SAME flight (other flights are different
 * people). Multi-day: every earlier day in the series (parent + siblings).
 */
export async function getSeedSourceRounds(round) {
  if (!round?.parent_round_id) return [];
  const anchorId = round.parent_round_id;
  const [anchor, children] = await Promise.all([
    base44.entities.Round.get(anchorId).catch(() => null),
    base44.entities.Round.filter({ parent_round_id: anchorId }, "-created_date", 200).catch(() => []),
  ]);
  const series = [anchor, ...(children || [])].filter(Boolean);
  const sameFlight = (r) =>
    !round.is_multi_flight || (r.flight_number || 1) === (round.flight_number || 1);
  const prior = series
    .filter((r) => r.id !== round.id && sameFlight(r) && r.date && round.date && d(r.date) < d(round.date))
    .sort((a, b) => d(a.date) - d(b.date));
  // A final round's saved results are already cumulative — use it alone.
  const cumulative = [...prior].reverse().find((r) => r.results?.is_series_cumulative);
  return cumulative ? [cumulative] : prior;
}

/** Cumulative individual gross/net total per player across the source rounds. */
export function individualSeedScores(sourceRounds, seedType) {
  const key = seedType === "gross" ? "gross_results" : "net_results";
  const field = seedType === "gross" ? "gross_total" : "net_total";
  const totals = {};
  for (const r of sourceRounds) {
    for (const row of r.results?.[key] || []) {
      if (row.disqualified || row[field] == null) continue;
      totals[row.player_id] = (totals[row.player_id] || 0) + row[field];
    }
  }
  return totals;
}

/**
 * Cumulative team gross/net total credited to each PLAYER (their team's score
 * on each day). Matching by player, not team tag, so re-tagged or untagged
 * teams still seed correctly.
 */
export function teamSeedScoresByPlayer(sourceRounds, seedType) {
  const key = seedType === "gross" ? "team_gross_results" : "team_net_results";
  const field = seedType === "gross" ? "best_ball_gross" : "best_ball_net";
  const totals = {};
  for (const r of sourceRounds) {
    for (const t of r.results?.[key] || []) {
      if (t.disqualified || t[field] == null) continue;
      for (const m of t.members || []) {
        const pid = typeof m === "string" ? m : m.player_id;
        if (pid) totals[pid] = (totals[pid] || 0) + t[field];
      }
    }
  }
  return totals;
}

/** Day-1 team membership (player_id → team_id) from the earliest source round. */
export function priorTeamOfPlayer(sourceRounds) {
  const map = {};
  const first = sourceRounds[0];
  for (const t of first?.results?.team_gross_results || []) {
    for (const m of t.members || []) {
      const pid = typeof m === "string" ? m : m.player_id;
      if (pid) map[pid] = t.team_id;
    }
  }
  return map;
}
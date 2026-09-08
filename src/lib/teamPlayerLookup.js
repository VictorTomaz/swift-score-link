import { buildTeams, teamSideGamesActive } from "@/lib/teamScoreEngine";

/**
 * SINGLE SOURCE OF TRUTH for naming side-game winners (skins, KPs, deuces).
 *
 * In a team event the side game is won by the TEAM, so the team label is shown
 * as the winner and the individual who made the shot/score appears in
 * parentheses. Every side-game display component MUST use
 * getSideGameDisplayName — do not re-implement this rule locally. Copies of it
 * living in individual cards is exactly what caused the same bug (individual
 * names showing in a team event) to reappear repeatedly.
 */

/**
 * Tournament-wide player → team lookup, built from every round in the series.
 * Needed because pooled side games (KP) list winners from other flights/days,
 * whose players aren't in the round being displayed.
 *
 * Returns { [player_id]: { name, size } } — team display name and member count
 * (used to show each player's share of a team side-game win).
 */
export function buildTeamNameByPlayer(rounds = []) {
  const map = {};
  rounds.forEach(r => {
    if (!r || !teamSideGamesActive(r)) return;
    buildTeams(r).forEach(t => {
      const name = t.members.map(m => m.name).join(" / ") || t.team_name;
      t.members.forEach(m => {
        if (m.player_id && !map[m.player_id]) map[m.player_id] = { name, size: t.members.length };
      });
    });
  });
  return map;
}

// Per-round lookups are reused across every rendered row.
const roundCache = new WeakMap();

function lookupForRound(round) {
  if (!round || typeof round !== "object") return {};
  if (roundCache.has(round)) return roundCache.get(round);
  const map = buildTeamNameByPlayer([round]);
  roundCache.set(round, map);
  return map;
}

/**
 * Resolves how one side-game winner should be displayed.
 * @returns {{ primary: string, secondary: string|null, teamSize: number }}
 *   secondary is null for individual play (no team wrapper).
 */
export function getSideGameDisplayName(round, playerId, fallbackName, teamNameByPlayer) {
  const playerName =
    (round?.players || []).find(p => p.player_id === playerId)?.name ||
    fallbackName ||
    playerId;

  // This round's own teams first, then the tournament-wide map (pooled winners
  // from other flights/days aren't in this round's roster).
  const team = lookupForRound(round)[playerId] || teamNameByPlayer?.[playerId];
  if (!team?.name) return { primary: playerName, secondary: null, teamSize: 1 };

  return { primary: team.name, secondary: playerName, teamSize: team.size || 1 };
}
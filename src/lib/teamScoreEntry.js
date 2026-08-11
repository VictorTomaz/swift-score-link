import { getScorecardGroups } from "@/lib/scorecardGroups";

/**
 * True for team formats where a single score is turned in per hole for the
 * whole team (Scramble, Chapman, 6-6-6). Best Ball and individual play keep
 * per-player entry.
 */
export function isSingleTeamScoreFormat(round) {
  if (!round) return false;
  const gt = round.game_type;
  if (gt === "team_scramble" || gt === "team_chapman" || gt === "team_6_6_6") return true;
  if (round.team_mode === true && round.team_format === "scramble") return true;
  return false;
}

/**
 * Returns the entry teams for a single-team-score round. Each team is a
 * scoring unit: one score per hole applies to every member.
 * Teams mirror the scorecard grouping (tee_group tag, else auto-split by
 * team_size) so entry matches the printed card.
 */
export function getEntryTeams(round) {
  const roster = round?.players || [];
  const groups = getScorecardGroups(round, roster);
  return groups.map((members, i) => {
    const tagged = members.find(p => (p.tee_group || "").trim());
    const tag = tagged ? (tagged.tee_group || "").trim() : "";
    const lastNames = members
      .map(p => (p.name || "").trim().split(/\s+/).pop())
      .filter(Boolean);
    const name = tag ? `Team ${tag}` : `Team ${String.fromCharCode(65 + i)}`;
    return {
      id: tag || `team_${i}`,
      name,
      label: lastNames.length ? lastNames.join(" / ") : name,
      memberIds: members.map(p => p.player_id),
      members,
    };
  });
}

/**
 * Returns the entry team that a player belongs to (for single-team-score
 * rounds), or null.
 */
export function getTeamOfPlayer(round, playerId) {
  if (!playerId) return null;
  const teams = getEntryTeams(round);
  return teams.find(t => t.memberIds.includes(playerId)) || null;
}
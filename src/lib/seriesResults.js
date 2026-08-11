/**
 * Multi-day series results.
 *
 * On the final round of a multi-day series the main (gross/net) purse pays out
 * based on CUMULATIVE standings across every day in the series. Side games
 * (skins, KPs, deuces) are per-day and stay in the final round's results as-is.
 */
import { assignPlacePayouts, applyConflictResolution, buildFinalPayouts } from "@/lib/swiftScoreEngine";
import { applyTeamConflictResolution } from "@/lib/teamScoreEngine";

/**
 * Returns true if `round` is the latest-dated round in its multi-day series.
 * `allSeriesRounds` should include the parent plus every child round.
 */
export function isSeriesFinalDay(round, allSeriesRounds) {
  if (!round || (!round.is_multi_day && !round.is_multi_flight)) return false;
  if (!round.parent_round_id) return false; // the parent (Day 1) is never the final round
  const sorted = [...(allSeriesRounds || [])]
    .filter(Boolean)
    .sort((a, b) => new Date(b.date) - new Date(a.date));
  return sorted[0]?.id === round.id;
}

/**
 * Merge per-day results into cumulative series standings and recompute the
 * gross/net payouts from the parent's series purse + place table.
 *
 * @param {object} finalRound      - the final round record (this day)
 * @param {object} finalResults    - this day's computed results (side games kept)
 * @param {Array}  siblingResults  - results objects for the other days in the series
 * @param {object} parentRound     - the parent (Day 1) round — source of purse & places
 * @returns {object} merged results with cumulative gross/net + this day's side games
 */
export function computeSeriesResults(finalRound, finalResults, siblingResults, parentRound) {
  const descending = !!finalResults.stableford;

  // Aggregate per-player gross/net totals across every day in the series.
  const playerMap = {};
  const collect = (results) => {
    (results.gross_results || []).forEach(r => {
      if (!playerMap[r.player_id]) {
        playerMap[r.player_id] = { player_id: r.player_id, name: r.name, gross_total: 0, net_total: 0, dq: false };
      }
      const p = playerMap[r.player_id];
      if (!r.disqualified && r.gross_total != null) p.gross_total += r.gross_total;
      else p.dq = true;
    });
    (results.net_results || []).forEach(r => {
      const p = playerMap[r.player_id];
      if (!p) return;
      if (!r.disqualified && r.net_total != null) p.net_total += r.net_total;
      else p.dq = true;
    });
  };
  collect(finalResults);
  siblingResults.forEach(collect);

  const allPlayers = Object.values(playerMap);
  const sortFn = (a, b, key) => {
    if (a.disqualified && !b.disqualified) return 1;
    if (!a.disqualified && b.disqualified) return -1;
    const av = a[key] ?? (descending ? -1 : 999);
    const bv = b[key] ?? (descending ? -1 : 999);
    const d = descending ? bv - av : av - bv;
    return d !== 0 ? d : a.name.localeCompare(b.name);
  };

  const cumulativeGross = allPlayers.map(p => ({
    player_id: p.player_id,
    name: p.name,
    gross_total: p.dq ? null : p.gross_total,
    disqualified: p.dq,
  })).sort((a, b) => sortFn(a, b, "gross_total"));

  const cumulativeNet = allPlayers.map(p => ({
    player_id: p.player_id,
    name: p.name,
    net_total: p.dq ? null : p.net_total,
    net_scores: [],
    disqualified: p.dq,
  })).sort((a, b) => sortFn(a, b, "net_total"));

  // Reuse the parent's place amounts and purse (the series buy-in was collected there).
  const grossPlaces = parentRound?.results?.gross_places || finalResults.gross_places || [];
  const netPlaces = parentRound?.results?.net_places || finalResults.net_places || [];
  const totalPot = parentRound?.results?.total_pot ?? finalResults.total_pot ?? 0;
  const grossPot = parentRound?.results?.gross_pot ?? finalResults.gross_pot ?? 0;
  const netPot = parentRound?.results?.net_pot ?? finalResults.net_pot ?? 0;

  const eligibleGross = cumulativeGross.filter(r => !r.disqualified);
  const eligibleNet = cumulativeNet.filter(r => !r.disqualified);
  const rawGross = assignPlacePayouts(eligibleGross, grossPlaces, "gross_total", {});
  const rawNet = assignPlacePayouts(eligibleNet, netPlaces, "net_total", {});
  const { grossPayouts, netPayouts } = applyConflictResolution(
    rawGross, rawNet, eligibleGross, eligibleNet, grossPlaces, netPlaces, descending
  );

  // Preserve this day's side-game payouts (per-day), keyed by player_id.
  const sideMap = (key) => Object.fromEntries(
    (finalResults.payouts || []).map(p => [p.player_id, p[key] || 0])
  );
  const sideTotalPot =
    (finalResults.gross_skins_allocated_pot || finalResults.gross_skins_separate_pot || 0) +
    (finalResults.net_skins_allocated_pot || finalResults.net_skins_separate_pot || 0) +
    (finalResults.kp_separate_pot || 0) +
    (finalResults.deuce_pot || 0);

  // Every series participant appears in the payout table (they all paid the series buy-in).
  const roster = allPlayers.map(p => ({ player_id: p.player_id, name: p.name }));
  const payoutList = buildFinalPayouts(roster, {
    grossPayouts,
    netPayouts,
    kpPayouts: sideMap("kp_payout"),
    grossSkinsPayouts: sideMap("gross_skins_payout"),
    netSkinsPayouts: sideMap("net_skins_payout"),
    deucePayouts: sideMap("deuce_payout"),
  }, Math.round(grossPot + netPot + sideTotalPot));

  return {
    ...finalResults,
    total_pot: totalPot,
    gross_pot: grossPot,
    net_pot: netPot,
    gross_places: grossPlaces,
    net_places: netPlaces,
    gross_results: cumulativeGross,
    net_results: cumulativeNet,
    is_series_cumulative: true,
    series_days: 1 + siblingResults.length,
    payouts: payoutList.sort((a, b) => b.total_payout - a.total_payout),
  };
}

/**
 * Team-format multi-day series: aggregate each team's gross/net best-ball total
 * across every day, then recompute team payouts from the parent's series purse +
 * place table. Side games (skins, KPs, deuces) stay per-day from the final round.
 *
 * Teams are matched by `team_id` (the tee_group tag) across days, so carrying over
 * the roster + team tags from Day 1 keeps teams consistent throughout the series.
 */
export function computeTeamSeriesResults(finalRound, finalResults, siblingResults, parentRound) {
  const teamMap = {};
  const collectTeam = (results) => {
    (results.team_gross_results || []).forEach(t => {
      if (!teamMap[t.team_id]) {
        teamMap[t.team_id] = {
          team_id: t.team_id,
          team_name: t.team_name,
          members: t.members || [],
          gross: 0,
          net: 0,
          dq: false,
        };
      }
      const e = teamMap[t.team_id];
      if (!t.disqualified && t.best_ball_gross != null) e.gross += t.best_ball_gross;
      else e.dq = true;
    });
    (results.team_net_results || []).forEach(t => {
      const e = teamMap[t.team_id];
      if (!e) return;
      if (!t.disqualified && t.best_ball_net != null) e.net += t.best_ball_net;
      else e.dq = true;
    });
  };
  collectTeam(finalResults);
  siblingResults.forEach(collectTeam);

  const sortFn = (a, b) => {
    if (a.disqualified && !b.disqualified) return 1;
    if (!a.disqualified && b.disqualified) return -1;
    return (a.score ?? 999) - (b.score ?? 999);
  };

  const cumulativeGross = Object.values(teamMap).map(t => ({
    team_id: t.team_id,
    team_name: t.team_name,
    members: t.members,
    best_ball_gross: t.dq ? null : t.gross,
    gross_payout: 0,
    disqualified: t.dq,
  })).sort((a, b) => sortFn({ ...a, score: a.best_ball_gross }, { ...b, score: b.best_ball_gross }));

  const cumulativeNet = Object.values(teamMap).map(t => ({
    team_id: t.team_id,
    team_name: t.team_name,
    members: t.members,
    best_ball_net: t.dq ? null : t.net,
    net_payout: 0,
    disqualified: t.dq,
  })).sort((a, b) => sortFn({ ...a, score: a.best_ball_net }, { ...b, score: b.best_ball_net }));

  const grossPlaces = parentRound?.results?.gross_places || finalResults.gross_places || [];
  const netPlaces = parentRound?.results?.net_places || finalResults.net_places || [];
  const { grossPayouts, netPayouts } = applyTeamConflictResolution(
    cumulativeGross, cumulativeNet, grossPlaces, netPlaces
  );
  cumulativeGross.forEach(t => { t.gross_payout = grossPayouts[t.team_id] || 0; });
  cumulativeNet.forEach(t => { t.net_payout = netPayouts[t.team_id] || 0; });

  // Per-player shares of team payouts.
  const playerGross = {};
  const playerNet = {};
  cumulativeGross.forEach(t => {
    if (t.gross_payout > 0 && t.members?.length) {
      const share = t.gross_payout / t.members.length;
      t.members.forEach(m => { playerGross[m.player_id] = share; });
    }
  });
  cumulativeNet.forEach(t => {
    if (t.net_payout > 0 && t.members?.length) {
      const share = t.net_payout / t.members.length;
      t.members.forEach(m => { playerNet[m.player_id] = share; });
    }
  });

  // Side games from the final day (per-day), keyed by player_id.
  const sideMap = (key) => Object.fromEntries(
    (finalResults.payouts || []).map(p => [p.player_id, p[key] || 0])
  );
  const kpSide = sideMap("kp_payout");
  const grossSkinsSide = sideMap("gross_skins_payout");
  const netSkinsSide = sideMap("net_skins_payout");
  const deuceSide = sideMap("deuce_payout");

  // Roster = every player on every team (deduped by player_id).
  const seen = {};
  const roster = Object.values(teamMap)
    .flatMap(t => t.members.map(m => ({ player_id: m.player_id, name: m.name })))
    .filter(p => { if (seen[p.player_id]) return false; seen[p.player_id] = true; return true; });

  const payoutList = roster.map(p => {
    const g = playerGross[p.player_id] || 0;
    const n = playerNet[p.player_id] || 0;
    const kp = kpSide[p.player_id] || 0;
    const gs = grossSkinsSide[p.player_id] || 0;
    const ns = netSkinsSide[p.player_id] || 0;
    const d = deuceSide[p.player_id] || 0;
    return {
      player_id: p.player_id,
      name: p.name,
      gross_payout: g,
      net_payout: n,
      kp_payout: kp,
      gross_skins_payout: gs,
      net_skins_payout: ns,
      deuce_payout: d,
      total_payout: g + n + kp + gs + ns + d,
    };
  }).sort((a, b) => b.total_payout - a.total_payout);

  const totalPot = parentRound?.results?.total_pot ?? finalResults.total_pot ?? 0;
  const grossPot = parentRound?.results?.gross_pot ?? finalResults.gross_pot ?? 0;
  const netPot = parentRound?.results?.net_pot ?? finalResults.net_pot ?? 0;

  return {
    ...finalResults,
    total_pot: totalPot,
    gross_pot: grossPot,
    net_pot: netPot,
    gross_places: grossPlaces,
    net_places: netPlaces,
    team_gross_results: cumulativeGross,
    team_net_results: cumulativeNet,
    is_series_cumulative: true,
    series_days: 1 + siblingResults.length,
    payouts: payoutList,
  };
}
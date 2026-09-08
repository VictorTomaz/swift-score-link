/**
 * Multi-day cumulative standings for the Las Vegas (1 Gross / 2 Net) format.
 * Each team's per-day combined totals are summed, then the single prize list is
 * paid from the parent round's place table (gross place + net place per finish).
 */

function assignVegasPayouts(teams, placeAmounts) {
  const payouts = {};
  const eligible = teams.filter(t => !t.disqualified);
  let placeIdx = 0;
  let i = 0;
  while (i < eligible.length && placeIdx < placeAmounts.length) {
    const score = eligible[i].vegas_total;
    const tied = eligible.filter(t => t.vegas_total === score);
    const placesConsumed = Math.min(tied.length, placeAmounts.length - placeIdx);
    const combined = placeAmounts.slice(placeIdx, placeIdx + placesConsumed).reduce((a, b) => a + b, 0);
    const share = combined / tied.length;
    tied.forEach(t => { payouts[t.team_id] = (payouts[t.team_id] || 0) + share; });
    placeIdx += placesConsumed;
    i += tied.length;
  }
  return payouts;
}

export function computeVegasSeriesResults(finalRound, finalResults, siblingResults, parentRound) {
  const teamMap = {};
  const collect = (results) => {
    (results.team_vegas_results || []).forEach(t => {
      if (!teamMap[t.team_id]) {
        teamMap[t.team_id] = {
          team_id: t.team_id,
          team_name: t.team_name,
          members: t.members || [],
          total: 0,
          dq: false,
        };
      }
      const e = teamMap[t.team_id];
      if (!t.disqualified && t.vegas_total != null) e.total += t.vegas_total;
      else e.dq = true;
    });
  };
  collect(finalResults);
  (siblingResults || []).forEach(collect);

  const cumulative = Object.values(teamMap).map(t => ({
    team_id: t.team_id,
    team_name: t.team_name,
    members: t.members,
    vegas_total: t.dq ? null : t.total,
    payout: 0,
    disqualified: t.dq,
  })).sort((a, b) => {
    if (a.disqualified && !b.disqualified) return 1;
    if (!a.disqualified && b.disqualified) return -1;
    return (a.vegas_total ?? 999) - (b.vegas_total ?? 999);
  });

  const gp = parentRound?.results?.gross_places || finalResults.gross_places || [];
  const np = parentRound?.results?.net_places || finalResults.net_places || [];
  const numPlaces = Math.min(Math.max(gp.length, np.length) || 3, cumulative.length);
  const placeAmounts = Array.from({ length: numPlaces }, (_, i) => (gp[i] || 0) + (np[i] || 0));

  const teamPayouts = assignVegasPayouts(cumulative, placeAmounts);
  cumulative.forEach(t => { t.payout = teamPayouts[t.team_id] || 0; });

  const playerMain = {};
  cumulative.forEach(t => {
    if (t.payout > 0 && t.members?.length) {
      const share = t.payout / t.members.length;
      t.members.forEach(m => { playerMain[m.player_id] = share; });
    }
  });

  // Side games settle on the final day, carried through per player.
  const sideMap = (key) => Object.fromEntries(
    (finalResults.payouts || []).map(p => [p.player_id, p[key] || 0])
  );
  const kpSide = sideMap("kp_payout");
  const grossSkinsSide = sideMap("gross_skins_payout");
  const netSkinsSide = sideMap("net_skins_payout");
  const deuceSide = sideMap("deuce_payout");

  const seen = {};
  const roster = Object.values(teamMap)
    .flatMap(t => (t.members || []).map(m => ({ player_id: m.player_id, name: m.name })))
    .filter(p => { if (seen[p.player_id]) return false; seen[p.player_id] = true; return true; });

  const payouts = roster.map(p => {
    const main = playerMain[p.player_id] || 0;
    const kp = kpSide[p.player_id] || 0;
    const gs = grossSkinsSide[p.player_id] || 0;
    const ns = netSkinsSide[p.player_id] || 0;
    const d = deuceSide[p.player_id] || 0;
    return {
      player_id: p.player_id,
      name: p.name,
      gross_payout: main,
      net_payout: 0,
      kp_payout: kp,
      gross_skins_payout: gs,
      net_skins_payout: ns,
      deuce_payout: d,
      total_payout: main + kp + gs + ns + d,
    };
  }).sort((a, b) => b.total_payout - a.total_payout);

  return {
    ...finalResults,
    total_pot: parentRound?.results?.total_pot ?? finalResults.total_pot ?? 0,
    gross_pot: parentRound?.results?.gross_pot ?? finalResults.gross_pot ?? 0,
    net_pot: parentRound?.results?.net_pot ?? finalResults.net_pot ?? 0,
    gross_places: gp,
    net_places: np,
    team_vegas_results: cumulative,
    team_gross_results: [],
    team_net_results: [],
    is_series_cumulative: true,
    series_days: 1 + (siblingResults || []).length,
    payouts,
  };
}
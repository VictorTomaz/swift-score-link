/**
 * Shared standings ranking logic used by both the GrossNetResults UI component
 * and the formatResultsText function for SMS/email output.
 *
 * Each player is assigned to ONE side only — gross or net — based on where
 * they're paid or (if unpaid) where they rank best. Players assigned to the
 * other side are fully excluded from ranking and tie computation, so a player
 * like Jeff Ferguson is rank 4 (not T4) when everyone else at his score went
 * gross.
 *
 * Two passes: the first (excluding only paid players) determines each
 * player's side; the second recomputes ranks excluding ALL players showing
 * on the opposite side.
 */
export function computeStandingsDisplay(grossResults, netResults, payouts, descending = false) {
  const gross = grossResults || [];
  const net = netResults || [];

  const isPaidOn = (playerId, key) =>
    payouts?.find(p => p.player_id === playerId)?.[key] > 0;

  const grossPaidIds = new Set(
    gross.filter(r => isPaidOn(r.player_id, "gross_payout")).map(r => r.player_id)
  );
  const netPaidIds = new Set(
    gross.filter(r => isPaidOn(r.player_id, "net_payout")).map(r => r.player_id)
  );

  const computeSideRanks = (list, scoreKey, excludeSet) => {
    const eligible = list.filter(r => !r.disqualified && !excludeSet.has(r.player_id));
    const ranks = {};
    const ties = {};
    list.forEach(r => {
      if (r.disqualified || excludeSet.has(r.player_id)) {
        ranks[r.player_id] = null;
        ties[r.player_id] = false;
      } else {
        ranks[r.player_id] = eligible.filter(x => descending ? x[scoreKey] > r[scoreKey] : x[scoreKey] < r[scoreKey]).length + 1;
        ties[r.player_id] = eligible.filter(x => x[scoreKey] === r[scoreKey]).length > 1;
      }
    });
    return { ranks, ties };
  };

  const playerIdSet = new Set();
  gross.forEach(r => playerIdSet.add(r.player_id));
  net.forEach(r => playerIdSet.add(r.player_id));

  // Pass 1: approximate ranks (excluding only paid players from opposite side)
  const pass1Gross = computeSideRanks(gross, "gross_total", netPaidIds);
  const pass1Net = computeSideRanks(net, "net_total", grossPaidIds);

  // Determine each player's assigned side
  const showingOnGross = new Set();
  const showingOnNet = new Set();

  const getPayout = (playerId, key) =>
    payouts?.find(p => p.player_id === playerId)?.[key] || 0;

  playerIdSet.forEach(playerId => {
    const grossRank = pass1Gross.ranks[playerId] ?? null;
    const netRank = pass1Net.ranks[playerId] ?? null;
    const grossPayout = getPayout(playerId, "gross_payout");
    const netPayout = getPayout(playerId, "net_payout");

    if (grossPayout > 0 || netPayout > 0) {
      // Paid: assign to whichever side pays more (best payout)
      if (grossPayout >= netPayout) {
        showingOnGross.add(playerId);
      } else {
        showingOnNet.add(playerId);
      }
    } else if (grossRank !== null && (netRank === null || grossRank <= netRank)) {
      // Unpaid: assign to side where they rank best (would pay best)
      showingOnGross.add(playerId);
    } else if (netRank !== null) {
      showingOnNet.add(playerId);
    }
  });

  // Pass 2: final ranks excluding ALL players showing on the opposite side
  const { ranks: grossRanks, ties: grossTies } = computeSideRanks(gross, "gross_total", showingOnNet);
  const { ranks: netRanks, ties: netTies } = computeSideRanks(net, "net_total", showingOnGross);

  const grossDisplay = {};
  const netDisplay = {};

  playerIdSet.forEach(playerId => {
    grossDisplay[playerId] = {
      showRank: showingOnGross.has(playerId),
      rank: grossRanks[playerId] ?? null,
      tied: grossTies[playerId] || false,
    };
    netDisplay[playerId] = {
      showRank: showingOnNet.has(playerId),
      rank: netRanks[playerId] ?? null,
      tied: netTies[playerId] || false,
    };
  });

  return { grossDisplay, netDisplay };
}

/**
 * Returns the display label for a player's rank on a given side,
 * e.g. "1", "T3", or "—" when not shown.
 */
export function rankLabel(display) {
  if (!display || !display.showRank || display.rank == null) return "—";
  return `${display.tied ? "T" : ""}${display.rank}`;
}

/**
 * Team equivalent of computeStandingsDisplay. Same two-pass logic, but each
 * team carries its own gross_payout / net_payout (no separate payouts array)
 * and uses best_ball_gross / best_ball_net as the score keys.
 */
export function computeTeamStandingsDisplay(grossResults, netResults, descending = false) {
  const gross = grossResults || [];
  const net = netResults || [];

  const grossPaidIds = new Set(gross.filter(t => (t.gross_payout || 0) > 0).map(t => t.team_id));
  const netPaidIds = new Set(net.filter(t => (t.net_payout || 0) > 0).map(t => t.team_id));

  const computeSideRanks = (list, scoreKey, excludeSet) => {
    const eligible = list.filter(t => !t.disqualified && !excludeSet.has(t.team_id));
    const ranks = {};
    const ties = {};
    list.forEach(t => {
      if (t.disqualified || excludeSet.has(t.team_id)) {
        ranks[t.team_id] = null;
        ties[t.team_id] = false;
      } else {
        ranks[t.team_id] = eligible.filter(x => descending ? x[scoreKey] > t[scoreKey] : x[scoreKey] < t[scoreKey]).length + 1;
        ties[t.team_id] = eligible.filter(x => x[scoreKey] === t[scoreKey]).length > 1;
      }
    });
    return { ranks, ties };
  };

  const idSet = new Set();
  gross.forEach(t => idSet.add(t.team_id));
  net.forEach(t => idSet.add(t.team_id));

  const pass1Gross = computeSideRanks(gross, "best_ball_gross", netPaidIds);
  const pass1Net = computeSideRanks(net, "best_ball_net", grossPaidIds);

  const byId = {};
  gross.forEach(t => { byId[t.team_id] = { g: t, ...(byId[t.team_id] || {}) }; });
  net.forEach(t => { byId[t.team_id] = { n: t, ...(byId[t.team_id] || {}) }; });

  const showingOnGross = new Set();
  const showingOnNet = new Set();

  idSet.forEach(id => {
    const gPay = byId[id].g?.gross_payout || 0;
    const nPay = byId[id].n?.net_payout || 0;
    const grossRank = pass1Gross.ranks[id] ?? null;
    const netRank = pass1Net.ranks[id] ?? null;
    if (gPay > 0 || nPay > 0) {
      if (gPay >= nPay) showingOnGross.add(id);
      else showingOnNet.add(id);
    } else if (grossRank !== null && (netRank === null || grossRank <= netRank)) {
      showingOnGross.add(id);
    } else if (netRank !== null) {
      showingOnNet.add(id);
    }
  });

  const { ranks: grossRanks, ties: grossTies } = computeSideRanks(gross, "best_ball_gross", showingOnNet);
  const { ranks: netRanks, ties: netTies } = computeSideRanks(net, "best_ball_net", showingOnGross);

  const grossDisplay = {};
  const netDisplay = {};
  idSet.forEach(id => {
    grossDisplay[id] = { showRank: showingOnGross.has(id), rank: grossRanks[id] ?? null, tied: grossTies[id] || false };
    netDisplay[id] = { showRank: showingOnNet.has(id), rank: netRanks[id] ?? null, tied: netTies[id] || false };
  });
  return { grossDisplay, netDisplay };
}
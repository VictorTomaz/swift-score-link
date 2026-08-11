/**
 * Multi-flight tournament field standings.
 *
 * Unlike multi-day (same players, scores summed across days), multi-flight
 * tournaments have DIFFERENT players in each flight. Each player plays exactly
 * one flight. This function collects every player's gross/net from their
 * respective flight and ranks them all together — producing the Low Gross of
 * the Field and Low Net of the Field.
 *
 * Payouts for the field standings come from the parent round's purse (the
 * tournament entry fee collected on Flight 1). Each flight's own side games
 * (skins, KPs, deuces) stay within that flight.
 */


/**
 * Hybrid multi-day + multi-flight tournament results.
 *
 * Each flight has the SAME players across multiple days (scores summed for
 * cumulative standings within the flight). Different flights have DIFFERENT
 * players. Field standings rank all players across all flights.
 *
 * Two-stage computation:
 *   1. For each flight, merge gross/net totals across days (cumulative).
 *   2. Pass cumulative per-flight results to computeFlightSeriesResults for
 *      field standings, field prizes, and per-flight payout distribution.
 *
 * Side games (skins, KPs, deuces) are per-day within each flight — all days
 * of all flights are collected and merged by computeFlightSeriesResults.
 *
 * @param {object} finalRound      - the final round of the tournament (last day of any flight)
 * @param {object} finalResults    - the final round's per-day computed results
 * @param {Array}  siblingPairs    - [{ round, results }] for ALL other rounds (all flights, all days)
 * @param {object} parentRound     - the parent (Flight 1 / Day 1) round — source of purse & places
 * @returns {object} merged results with field standings + per-flight cumulative standings
 */
export function computeHybridSeriesResults(finalRound, finalResults, siblingPairs, parentRound) {
  const currentFlight = finalRound.flight_number || 1;

  // Group ALL rounds (current + siblings) by flight_number
  const flightGroups = {};
  const ensureGroup = (fn) => { if (!flightGroups[fn]) flightGroups[fn] = []; };

  ensureGroup(currentFlight);
  flightGroups[currentFlight].push({ round: finalRound, results: finalResults });

  siblingPairs.forEach(({ round, results }) => {
    const fn = round?.flight_number || 1;
    ensureGroup(fn);
    flightGroups[fn].push({ round, results });
  });

  // For each flight: merge days into cumulative results
  const flightMerged = [];
  for (const [fn, days] of Object.entries(flightGroups)) {
    // Deduplicate by date: if multiple rounds share the same date within a
    // flight (e.g. a duplicate Day 2 was created), keep only one — the
    // current/final round takes priority. Without this, scores are
    // double-counted and inflated (e.g. 227 instead of ~152).
    const seenDates = new Set();
    const deduped = [...days]
      .sort((a, b) => {
        const aCurrent = a.round?.id === finalRound.id;
        const bCurrent = b.round?.id === finalRound.id;
        if (aCurrent && !bCurrent) return -1;
        if (!aCurrent && bCurrent) return 1;
        return new Date(a.round?.date) - new Date(b.round?.date);
      })
      .filter(d => {
        const dateKey = d.round?.date || '';
        if (seenDates.has(dateKey)) return false;
        seenDates.add(dateKey);
        return true;
      });

    const sorted = deduped.sort((a, b) => new Date(a.round?.date) - new Date(b.round?.date));
    const day1 = sorted[0]; // Day 1 has the pot (buy-in collected here)

    // Sum gross/net totals per player across all days of this flight
    const playerMap = {};
    sorted.forEach(({ results }) => {
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
    });

    const allPlayers = Object.values(playerMap);
    const flightLabel = sorted[0]?.round?.event_name || `Flight ${fn}`;
    // Sort by score ascending (or descending for stableford). Without this,
    // the standings arrays are in insertion order and the payout loop in
    // computeFlightSeriesResults (which assumes sorted input) assigns prizes
    // to the wrong players — e.g. the 1st-place gross payout goes to whoever
    // was inserted first, not the lowest score.
    const descending = !!finalResults.stableford;
    const sortByScore = (arr, key) => arr.sort((a, b) => {
      if (a.disqualified && !b.disqualified) return 1;
      if (!a.disqualified && b.disqualified) return -1;
      const av = a[key] ?? (descending ? -1 : 999);
      const bv = b[key] ?? (descending ? -1 : 999);
      const d = descending ? bv - av : av - bv;
      return d !== 0 ? d : a.name.localeCompare(b.name);
    });
    const mergedResults = {
      gross_results: sortByScore(allPlayers.map(p => ({
        player_id: p.player_id, name: p.name,
        gross_total: p.dq ? null : p.gross_total,
        flight: flightLabel,
        disqualified: p.dq,
      })), "gross_total"),
      net_results: sortByScore(allPlayers.map(p => ({
        player_id: p.player_id, name: p.name,
        net_total: p.dq ? null : p.net_total,
        flight: flightLabel,
        disqualified: p.dq,
      })), "net_total"),
      // Day 1's pot values (buy-in collected there; subsequent days have buy_in=0)
      total_pot: day1.results?.total_pot ?? 0,
      gross_pot: day1.results?.gross_pot ?? 0,
      net_pot: day1.results?.net_pot ?? 0,
      gross_places: day1.results?.gross_places || [],
      net_places: day1.results?.net_places || [],
      // Collect side games from ALL days (computeFlightSeriesResults merges by player_id)
      payouts: sorted.flatMap(({ results }) => results.payouts || []),
      stableford: finalResults.stableford,
    };

    flightMerged.push({
      round: sorted[sorted.length - 1].round,
      results: mergedResults,
      flightNumber: Number(fn),
    });
  }

  // Build a complete player→flight map BEFORE any field-winner removal.
  // Field prize winners are removed from their flight's per-flight standings
  // (no double dipping), so the Results page can't map them to a flight from
  // the standings alone. This map includes every player, so field winners'
  // payouts (field_gross_payout / field_net_payout) appear in the correct
  // flight's per-flight payout table.
  const playerFlightMap = {};
  flightMerged.forEach(f => {
    [...(f.results.gross_results || []), ...(f.results.net_results || [])].forEach(r => {
      if (r.player_id) playerFlightMap[r.player_id] = String(f.flightNumber);
    });
  });

  // Split into final (current flight) and siblings (other flights)
  const finalFlight = flightMerged.find(f => f.flightNumber === currentFlight) || flightMerged[0];
  const otherFlights = flightMerged.filter(f => f.flightNumber !== currentFlight);

  const hybridResults = computeFlightSeriesResults(
    finalRound,
    finalFlight.results,
    otherFlights,
    parentRound
  );

  // Hybrid: also filter field winners from OTHER flights' per-flight standings.
  // (Gross winners were already removed from net standings by
  // computeFlightSeriesResults — no double dipping. Field winners are
  // removed here as well so they don't appear as flight winners too.)
  const fgwId = hybridResults.field_gross_winner?.player_id;
  const fnwId = hybridResults.field_net_winner?.player_id;
  otherFlights.forEach(f => {
    if (Array.isArray(f.results?.gross_results)) {
      f.results.gross_results = f.results.gross_results.filter(r =>
        r.player_id !== fgwId && r.player_id !== fnwId
      );
    }
    if (Array.isArray(f.results?.net_results)) {
      f.results.net_results = f.results.net_results.filter(r =>
        r.player_id !== fnwId &&
        r.player_id !== fgwId
      );
    }
  });

  // Store the current (final) day's per-day payouts BEFORE transformation —
  // after computeFlightSeriesResults, the payouts have SUMMED side games (all
  // days merged). The PayoutTable needs per-day side game values to render
  // per-day columns without double-counting; prior days' per-day payouts come
  // from their own saved results, but the current day's are lost after the
  // merge, so we preserve them here.
  const currentDayPayouts = (finalResults.payouts || []).map(p => ({ ...p }));

  // Include per-flight cumulative standings for ALL flights — the final round's
  // results only stores flight_own_gross/net for the current flight. Without
  // this, non-current flights' per-flight standings cards are empty because
  // their saved results are per-day (not cumulative) or were cleared.
  const allFlightStandings = [
    {
      flightNumber: currentFlight,
      gross_results: hybridResults.flight_own_gross || [],
      net_results: hybridResults.flight_own_net || [],
    },
    ...otherFlights.map(f => ({
      flightNumber: f.flightNumber,
      gross_results: f.results?.gross_results || [],
      net_results: f.results?.net_results || [],
    })),
  ];

  // Preserve the final round's per-day gross_skins and net_skins detail arrays.
  // computeFlightSeriesResults spreads { ...finalResults } where finalResults is
  // the flight's mergedResults (which omits skins detail), so without this the
  // per-hole skins tables are empty on the final results page even though the
  // payout dollar amounts are correct in the payouts array.
  const currentDayGrossSkins = finalResults.gross_skins || [];
  const currentDayNetSkins = finalResults.net_skins || [];

  return { ...hybridResults, all_flight_standings: allFlightStandings, _current_day_payouts: currentDayPayouts, player_flight_map: playerFlightMap, gross_skins: currentDayGrossSkins, net_skins: currentDayNetSkins };
}

/**
 * USGA scorecard playoff — used ONLY for Low Gross / Low Net of the Field ties.
 * Compares last 9 (holes 10–18), then last 6 (13–18), then last 3 (16–18),
 * then hole-by-hole backward from 18. For net, per-hole net = gross − handicap
 * strokes allocated to that hole (based on course_handicap & hole indexes).
 * Returns negative if `a` wins, positive if `b` wins.
 */
function usgaScorecardPlayoff(a, b, isNet) {
  const handicapStrokes = (courseHandicap, holeIndex) => {
    const ch = Math.max(0, Math.floor(courseHandicap || 0));
    if (ch <= 0) return 0;
    if (ch <= 18) return holeIndex <= ch ? 1 : 0;
    return holeIndex <= (ch - 18) ? 2 : 1;
  };
  const toNetPerHole = (p) => {
    const scores = p.scores || [];
    const ch = p.course_handicap || 0;
    const hhi = p.hole_handicap_indexes || [];
    if (!hhi.length || scores.length < 18) return scores;
    return scores.map((s, i) => s - handicapStrokes(ch, hhi[i] || 0));
  };

  const aScores = isNet ? toNetPerHole(a) : (a.scores || []);
  const bScores = isNet ? toNetPerHole(b) : (b.scores || []);
  if (aScores.length < 18 || bScores.length < 18) return a.name.localeCompare(b.name);

  const sum = (arr, start, end) => arr.slice(start, end).reduce((s, v) => s + (v || 0), 0);
  // Last 9 (10–18), last 6 (13–18), last 3 (16–18)
  for (const [s, e] of [[9, 18], [12, 18], [15, 18]]) {
    const d = sum(aScores, s, e) - sum(bScores, s, e);
    if (d !== 0) return d;
  }
  // Hole-by-hole backward from 18
  for (let i = 17; i >= 0; i--) {
    const d = (aScores[i] || 0) - (bScores[i] || 0);
    if (d !== 0) return d;
  }
  return a.name.localeCompare(b.name);
}

/**
 * @param {object} finalRound      - the final flight's round record
 * @param {object} finalResults    - the final flight's computed results (side games kept)
 * @param {Array}  siblingPairs    - [{ round, results }] for the other flights
 * @param {object} parentRound     - the parent (Flight 1) round — source of purse & places
 * @returns {object} merged results with field gross/net + this flight's side games
 */
export function computeFlightSeriesResults(finalRound, finalResults, siblingPairs, parentRound) {
  const descending = !!finalResults.stableford;

  // Collect each player's gross/net from their flight — NO summing.
  const playerMap = {};
  const collect = (results, flightLabel, round) => {
    (results.gross_results || []).forEach(r => {
      if (!playerMap[r.player_id]) {
        playerMap[r.player_id] = {
          player_id: r.player_id,
          name: r.name,
          gross_total: null,
          net_total: null,
          dq: false,
          flight: flightLabel,
          scores: [],
          course_handicap: 0,
          hole_handicap_indexes: [],
        };
      }
      const p = playerMap[r.player_id];
      // Store per-hole scores + handicap info for USGA scorecard playoff
      const playerData = round?.players?.find(pl => pl.player_id === r.player_id);
      if (playerData?.scores?.length) {
        p.scores = playerData.scores;
        p.course_handicap = playerData.course_handicap || 0;
      }
      if (round?.hole_handicap_indexes?.length) {
        p.hole_handicap_indexes = round.hole_handicap_indexes;
      }
      if (r.disqualified) { p.dq = true; return; }
      if (r.gross_total != null) p.gross_total = r.gross_total;
    });
    (results.net_results || []).forEach(r => {
      const p = playerMap[r.player_id];
      if (!p) return;
      if (r.disqualified) { p.dq = true; return; }
      if (r.net_total != null) p.net_total = r.net_total;
    });
  };

  // Preserve this flight's own per-flight standings before replacing with field standings.
  // No double dipping: field prize winners are removed from their own flight's
  // standings so they don't appear as flight winners too.
  const flightOwnGross = (finalResults.gross_results || []).map(r => ({ ...r }));
  const flightOwnNet = (finalResults.net_results || []).map(r => ({ ...r }));

  collect(finalResults, finalRound.event_name || 'Final Flight', finalRound);
  siblingPairs.forEach(({ round, results }) => {
    collect(results, round?.event_name || 'Flight', round);
  });

  const allPlayers = Object.values(playerMap);
  const sortFn = (a, b, key) => {
    if (a.disqualified && !b.disqualified) return 1;
    if (!a.disqualified && b.disqualified) return -1;
    const av = a[key] ?? (descending ? -1 : 999);
    const bv = b[key] ?? (descending ? -1 : 999);
    const d = descending ? bv - av : av - bv;
    return d !== 0 ? d : a.name.localeCompare(b.name);
  };

  const fieldGross = allPlayers.map(p => ({
    player_id: p.player_id,
    name: p.name,
    gross_total: p.dq ? null : p.gross_total,
    flight: p.flight,
    disqualified: p.dq,
    scores: p.scores,
    course_handicap: p.course_handicap,
    hole_handicap_indexes: p.hole_handicap_indexes,
  })).sort((a, b) => sortFn(a, b, "gross_total"));

  const fieldNet = allPlayers.map(p => ({
    player_id: p.player_id,
    name: p.name,
    net_total: p.dq ? null : p.net_total,
    flight: p.flight,
    disqualified: p.dq,
    scores: p.scores,
    course_handicap: p.course_handicap,
    hole_handicap_indexes: p.hole_handicap_indexes,
  })).sort((a, b) => sortFn(a, b, "net_total"));

  // Field purse from parent round — only 1st place pays (Low Gross/Net of the Field).
  // The remaining gross/net/side game payouts stay per-flight: each flight's own
  // results.payouts already contain that flight's gross/net/side game distributions.
  const grossPlaces = parentRound?.results?.gross_places || finalResults.gross_places || [];
  const netPlaces = parentRound?.results?.net_places || finalResults.net_places || [];
  // Each flight collects its own entry fee from its own players, so the
  // total tournament pot is the SUM of all flights' pots — not just the
  // parent (Flight 1) pot. Place configuration (gross_places/net_places)
  // still comes from the parent round's results.
  const allFlightResults = [finalResults, ...siblingPairs.map(s => s.results)];
  const totalPot = allFlightResults.reduce((sum, r) => sum + (r?.total_pot ?? 0), 0)
    || parentRound?.results?.total_pot || 0;
  const grossPot = allFlightResults.reduce((sum, r) => sum + (r?.gross_pot ?? 0), 0)
    || parentRound?.results?.gross_pot || 0;
  const netPot = allFlightResults.reduce((sum, r) => sum + (r?.net_pot ?? 0), 0)
    || parentRound?.results?.net_pot || 0;
  // Field prizes: when enabled on the parent round, each prize is carved from
  // its respective purse (gross/net) — not the combined total pot. When
  // disabled, no field prizes are awarded. Backward compat: old rounds with
  // field_gross_prize / field_net_prize set but no field_prizes_enabled flag
  // use legacy dollar amounts.
  let fieldGrossPrize = 0;
  let fieldNetPrize = 0;
  if (parentRound?.field_prizes_enabled === true) {
    // Each field prize is a carve-out from its RESPECTIVE purse (gross/net),
    // not the combined total pot. Default percentage scales with flight count
    // so the field prize is always larger than per-flight 1st place: 30% for
    // 2 flights, 25% for 3+ flights.
    const flightCount = 1 + siblingPairs.length;
    const defaultFieldPercent = flightCount <= 2 ? 30 : 25;
    fieldGrossPrize = grossPot * ((parentRound.field_gross_percent ?? defaultFieldPercent) / 100);
    fieldNetPrize = netPot * ((parentRound.field_net_percent ?? defaultFieldPercent) / 100);
  } else if (parentRound?.field_prizes_enabled == null) {
    fieldGrossPrize = (parentRound?.field_gross_prize > 0) ? parentRound.field_gross_prize : 0;
    fieldNetPrize = (parentRound?.field_net_prize > 0) ? parentRound.field_net_prize : 0;
  }

  // Field winners — lowest gross and lowest net across ALL flights.
  // Ties broken by USGA scorecard playoff (last 9 → 6 → 3 → backward).
  // No double dipping: if the same player has the lowest gross AND lowest net,
  // they keep the gross prize and the net prize goes to the next-best net player.
  const resolveFieldWinner = (standings, isNet) => {
    const eligible = standings.filter(r => !r.disqualified && (isNet ? r.net_total : r.gross_total) != null);
    if (eligible.length === 0) return undefined;
    const best = eligible[0][isNet ? 'net_total' : 'gross_total'];
    const tied = eligible.filter(r => r[isNet ? 'net_total' : 'gross_total'] === best);
    return tied.length === 1 ? tied[0] : tied.sort((a, b) => usgaScorecardPlayoff(a, b, isNet))[0];
  };
  const fieldGrossWinner = resolveFieldWinner(fieldGross, false);
  let fieldNetWinner = fieldNet.find(r =>
    !r.disqualified && r.net_total != null && r.player_id !== fieldGrossWinner?.player_id
  );
  // If the gross winner also has the lowest net, break the tie among remaining players
  if (fieldGrossWinner) {
    const netEligible = fieldNet.filter(r =>
      !r.disqualified && r.net_total != null && r.player_id !== fieldGrossWinner.player_id
    );
    if (netEligible.length > 0) {
      const bestNet = netEligible[0].net_total;
      const netTied = netEligible.filter(r => r.net_total === bestNet);
      fieldNetWinner = netTied.length === 1 ? netTied[0] : netTied.sort((a, b) => usgaScorecardPlayoff(a, b, true))[0];
    }
  }
  // Fallback: if no other eligible net winner (tiny field), let the gross winner take both
  if (!fieldNetWinner) {
    fieldNetWinner = resolveFieldWinner(fieldNet, true);
  }

  // No double dipping: remove BOTH field prize winners from this flight's
  // per-flight gross AND net standings — a field winner can't also claim a
  // flight prize. Gross winners stay in the net display (with $0 net payout,
  // since the payout loop excludes them) so the flight shows the full number
  // of places instead of leaving gaps.
  for (let i = flightOwnGross.length - 1; i >= 0; i--) {
    const pid = flightOwnGross[i].player_id;
    if (pid === fieldGrossWinner?.player_id || pid === fieldNetWinner?.player_id) flightOwnGross.splice(i, 1);
  }
  for (let i = flightOwnNet.length - 1; i >= 0; i--) {
    const pid = flightOwnNet[i].player_id;
    if (pid === fieldNetWinner?.player_id || pid === fieldGrossWinner?.player_id) flightOwnNet.splice(i, 1);
  }

  // ── Per-flight gross/net payouts ──
  // The total pot is collected on the parent (Flight 1). In a multi-flight
  // tournament each flight has DIFFERENT players, so the pot must be split
  // across flights proportionally by player count. Each flight then pays its
  // own gross/net winners from its share. Side game payouts (skins, KPs,
  // deuces) are preserved from each flight's own computeResults.

  // 1. Collect existing payouts (preserves side games), zero out gross/net
  const flightPayoutsMap = {};
  const ensurePlayer = (p) => {
    if (!p || !p.player_id) return;
    if (!flightPayoutsMap[p.player_id]) {
      flightPayoutsMap[p.player_id] = {
        player_id: p.player_id,
        name: p.name,
        gross_payout: 0,
        net_payout: 0,
        kp_payout: 0,
        gross_skins_payout: 0,
        net_skins_payout: 0,
        deuce_payout: 0,
      };
    }
  };
  const mergeSideGames = (p) => {
    ensurePlayer(p);
    if (!p || !p.player_id) return;
    const entry = flightPayoutsMap[p.player_id];
    entry.kp_payout += (p.kp_payout || 0);
    entry.gross_skins_payout += (p.gross_skins_payout || 0);
    entry.net_skins_payout += (p.net_skins_payout || 0);
    entry.deuce_payout += (p.deuce_payout || 0);
  };
  (finalResults.payouts || []).forEach(mergeSideGames);
  siblingPairs.forEach(({ results }) => {
    (results.payouts || []).forEach(mergeSideGames);
  });

  // 2. Pot available for flight-level gross/net (after field prize carve-out).
  // Field gross prize is carved from the gross pot; field net prize from the
  // net pot — each purse shrinks independently. (Recomputed after field-prize
  // bump below — declared as let.)
  let flightGrossPotTotal = Math.max(0, grossPot - fieldGrossPrize);
  let flightNetPotTotal = Math.max(0, netPot - fieldNetPrize);

  // 3. All flights with their per-flight standings (sorted, non-DQ).
  // IMPORTANT: use the ORIGINAL standings (before field-winner removal) for the
  // pot-split player count. flightOwnGross/Net already had field winners spliced
  // out for DISPLAY — using that filtered list here would shrink the final
  // flight's player count (e.g. 9 instead of 10) and give it a smaller pot
  // share than its siblings. The payout-assignment loop below already skips
  // field winners, so they don't need to be removed from the count.
  const totalPlayers = allPlayers.length;
  const flightStandingsList = [
    { gross: (finalResults.gross_results || []).filter(r => !r.disqualified && r.gross_total != null),
      net: (finalResults.net_results || []).filter(r => !r.disqualified && r.net_total != null),
      flightGrossPlaces: finalResults.gross_places || grossPlaces,
      flightNetPlaces: finalResults.net_places || netPlaces,
      ownGrossPot: finalResults.gross_pot || parentGrossPot,
      ownNetPot: finalResults.net_pot || parentNetPot },
    ...siblingPairs.map(s => ({
      gross: (s.results.gross_results || []).filter(r => !r.disqualified && r.gross_total != null),
      net: (s.results.net_results || []).filter(r => !r.disqualified && r.net_total != null),
      flightGrossPlaces: s.results.gross_places || grossPlaces,
      flightNetPlaces: s.results.net_places || netPlaces,
      ownGrossPot: s.results.gross_pot || parentGrossPot,
      ownNetPot: s.results.net_pot || parentNetPot,
    })),
  ];

  // 4. For each flight, assign gross/net payouts from standings + pot share
  // The parent's gross_places/net_places sum to the parent's SINGLE-FLIGHT
  // gross_pot/net_pot — not the combined pot. So the ratio must divide by a
  // single flight's pot, not the combined grossPot/netPot, otherwise every
  // place amount is under-scaled (e.g. halved for 2 flights).
  const parentGrossPot = parentRound?.results?.gross_pot || finalResults.gross_pot || 0;
  const parentNetPot = parentRound?.results?.net_pot || finalResults.net_pot || 0;

  // Ensure field prizes are at least as large as the highest per-flight 1st
  // place payout. The "Low Gross/Net of the Field" is the overall winner —
  // it should never pay less than a single flight's 1st place. Compute what
  // each flight's 1st place would be WITHOUT the field prize carve-out, then
  // bump the field prize if needed.
  if (fieldGrossPrize > 0 || fieldNetPrize > 0) {
    const maxGross1st = Math.max(0, ...flightStandingsList.map(({ gross, flightGrossPlaces, ownGrossPot }) => {
      const count = (gross || []).length;
      if (count === 0 || totalPlayers === 0 || ownGrossPot <= 0) return 0;
      return (flightGrossPlaces[0] || 0) * (grossPot * (count / totalPlayers) / ownGrossPot);
    }));
    const maxNet1st = Math.max(0, ...flightStandingsList.map(({ net, flightNetPlaces, ownNetPot }) => {
      const count = (net || []).length;
      if (count === 0 || totalPlayers === 0 || ownNetPot <= 0) return 0;
      return (flightNetPlaces[0] || 0) * (netPot * (count / totalPlayers) / ownNetPot);
    }));
    fieldGrossPrize = Math.max(fieldGrossPrize, maxGross1st);
    fieldNetPrize = Math.max(fieldNetPrize, maxNet1st);
    flightGrossPotTotal = Math.max(0, grossPot - fieldGrossPrize);
    flightNetPotTotal = Math.max(0, netPot - fieldNetPrize);
  }

  const flightGrossWinnersList = []; // per-flight Sets, used to filter net display standings

  flightStandingsList.forEach(({ gross, net, flightGrossPlaces: rawGrossPlaces, flightNetPlaces: rawNetPlaces, ownGrossPot, ownNetPot }) => {
    const flightPlayerCount = (gross || []).length;
    if (flightPlayerCount === 0 || totalPlayers === 0) return;
    const flightShare = flightPlayerCount / totalPlayers;
    const flightGrossPot = flightGrossPotTotal * flightShare;
    const flightNetPot = flightNetPotTotal * flightShare;

    // Scale this flight's own place amounts to its pot share
    const grossRatio = ownGrossPot > 0 ? flightGrossPot / ownGrossPot : 0;
    const netRatio = ownNetPot > 0 ? flightNetPot / ownNetPot : 0;
    const flightGrossPlaces = rawGrossPlaces.map(v => v * grossRatio);
    const flightNetPlaces = rawNetPlaces.map(v => v * netRatio);

    // Assign gross payouts to top finishers (skip BOTH field winners —
    // no double dipping: a field prize winner can't also win flight gross/net)
    //
    // TIE RULE (standard golf): a tied group of N players shares the combined
    // money from the N consecutive place slots they occupy, split equally.
    // E.g. a 2-way tie for 1st consumes 1st+2nd place money ÷ 2 each.
    const flightGrossWinners = new Set();
    flightGrossWinnersList.push(flightGrossWinners);
    const grossEligible = (gross || []).filter(r =>
      r.player_id !== fieldGrossWinner?.player_id &&
      r.player_id !== fieldNetWinner?.player_id
    );
    let grossPlaceIdx = 0;
    let grossGroupStart = 0;
    while (grossGroupStart < grossEligible.length && grossPlaceIdx < flightGrossPlaces.length) {
      const currentScore = grossEligible[grossGroupStart].gross_total;
      let grossGroupEnd = grossGroupStart + 1;
      while (grossGroupEnd < grossEligible.length &&
             grossEligible[grossGroupEnd].gross_total === currentScore) {
        grossGroupEnd++;
      }
      const tiedPlayers = grossEligible.slice(grossGroupStart, grossGroupEnd);
      const slotsConsumed = Math.min(tiedPlayers.length, flightGrossPlaces.length - grossPlaceIdx);
      const combinedPrize = flightGrossPlaces.slice(grossPlaceIdx, grossPlaceIdx + slotsConsumed)
        .reduce((a, b) => a + b, 0);
      const share = combinedPrize / tiedPlayers.length;
      tiedPlayers.forEach(p => {
        ensurePlayer(p);
        flightPayoutsMap[p.player_id].gross_payout = share;
        flightGrossWinners.add(p.player_id);
      });
      grossPlaceIdx += slotsConsumed;
      grossGroupStart = grossGroupEnd;
    }

    // Assign net payouts to top finishers (skip field winners AND this
    // flight's gross winners — no double dipping: a gross winner can't
    // also win a net payout. The DISPLAY standings are also filtered below
    // to show the actual net payout recipients instead of gross winners
    // with $0.)
    // Same tie-splitting logic as gross.
    const netEligible = (net || []).filter(r =>
      r.player_id !== fieldNetWinner?.player_id &&
      r.player_id !== fieldGrossWinner?.player_id &&
      !flightGrossWinners.has(r.player_id)
    );
    let netPlaceIdx = 0;
    let netGroupStart = 0;
    while (netGroupStart < netEligible.length && netPlaceIdx < flightNetPlaces.length) {
      const currentScore = netEligible[netGroupStart].net_total;
      let netGroupEnd = netGroupStart + 1;
      while (netGroupEnd < netEligible.length &&
             netEligible[netGroupEnd].net_total === currentScore) {
        netGroupEnd++;
      }
      const tiedPlayers = netEligible.slice(netGroupStart, netGroupEnd);
      const slotsConsumed = Math.min(tiedPlayers.length, flightNetPlaces.length - netPlaceIdx);
      const combinedPrize = flightNetPlaces.slice(netPlaceIdx, netPlaceIdx + slotsConsumed)
        .reduce((a, b) => a + b, 0);
      const share = combinedPrize / tiedPlayers.length;
      tiedPlayers.forEach(p => {
        ensurePlayer(p);
        flightPayoutsMap[p.player_id].net_payout = share;
      });
      netPlaceIdx += slotsConsumed;
      netGroupStart = netGroupEnd;
    }
  });

  // No double dipping in DISPLAY: remove each flight's gross winners from
  // the net standings so the display shows the actual net payout recipients
  // (the next eligible players) instead of gross winners with $0.
  // Current flight (index 0): filter flightOwnNet
  const currentFlightGrossWinners = flightGrossWinnersList[0];
  if (currentFlightGrossWinners) {
    for (let i = flightOwnNet.length - 1; i >= 0; i--) {
      if (currentFlightGrossWinners.has(flightOwnNet[i].player_id)) flightOwnNet.splice(i, 1);
    }
  }
  // Sibling flights: filter their results.net_results (used by all_flight_standings)
  siblingPairs.forEach((s, idx) => {
    const winners = flightGrossWinnersList[idx + 1];
    if (winners && Array.isArray(s.results?.net_results)) {
      s.results.net_results = s.results.net_results.filter(r => !winners.has(r.player_id));
    }
  });

  // 5. Add field prizes
  const combinedPayouts = Object.values(flightPayoutsMap).map(p => {
    const fieldG = (p.player_id === fieldGrossWinner?.player_id) ? fieldGrossPrize : 0;
    const fieldN = (p.player_id === fieldNetWinner?.player_id) ? fieldNetPrize : 0;
    return {
      ...p,
      field_gross_payout: fieldG,
      field_net_payout: fieldN,
    };
  });

  // Scaled pot values for display (total across all flights)
  const scaledGrossPot = flightGrossPotTotal;
  const scaledNetPot = flightNetPotTotal;
  const grossRatio = parentGrossPot > 0 ? flightGrossPotTotal / parentGrossPot : 0;
  const netRatio = parentNetPot > 0 ? flightNetPotTotal / parentNetPot : 0;
  const scaledGrossPlaces = grossPlaces.map(v => v * grossRatio);
  const scaledNetPlaces = netPlaces.map(v => v * netRatio);

  // Recalculate total_payout for each player (flight-level + field + side games)
  combinedPayouts.forEach(p => {
    p.total_payout = (p.gross_payout || 0) + (p.net_payout || 0) +
      (p.field_gross_payout || 0) + (p.field_net_payout || 0) +
      (p.kp_payout || 0) + (p.gross_skins_payout || 0) +
      (p.net_skins_payout || 0) + (p.deuce_payout || 0);
  });

  combinedPayouts.sort((a, b) => b.total_payout - a.total_payout);

  return {
    ...finalResults,
    total_pot: totalPot,
    gross_pot: scaledGrossPot,
    net_pot: scaledNetPot,
    gross_places: scaledGrossPlaces,
    net_places: scaledNetPlaces,
    // Main standings show ALL players ranked across all flights (Field Standings).
    // Each player's gross_payout/net_payout (flight-level) is looked up from payouts.
    // The Field Gross/Net prize winners are highlighted in the banner above.
    gross_results: fieldGross,
    net_results: fieldNet,
    flight_own_gross: flightOwnGross,
    flight_own_net: flightOwnNet,
    is_series_cumulative: true,
    is_flight_cumulative: true,
    series_flights: 1 + siblingPairs.length,
    field_gross_winner: fieldGrossWinner,
    field_net_winner: fieldNetWinner,
    field_gross_prize: fieldGrossPrize,
    field_net_prize: fieldNetPrize,
    payouts: combinedPayouts,
  };
}
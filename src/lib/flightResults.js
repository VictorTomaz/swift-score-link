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
import { applyConflictResolution } from './swiftScoreEngine';
import { applyTeamConflictResolution, splitTeamKpPayoutsAcrossRounds } from './teamScoreEngine';

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
  // Collect KP pots + winners from all deduped days of all flights for
  // tournament-wide KP pooling (hybrid multi-flight).
  let hybridTotalKpPot = 0;
  const hybridAllKpWinners = [];
  const hybridKpNameMap = {};
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

    // Tournament-wide KP: collect this flight's deduped day pots + winners.
    // Compute the per-round KP pot from RAW round data (player count × buy-in)
    // instead of results.kp_separate_pot — the final round's saved results may
    // have kp_separate_pot overwritten by a previous hybrid computation, which
    // would corrupt the pooled total (e.g. $132.5 instead of $165).
    sorted.forEach(({ round, results }) => {
      const kpPot = round?.kps_enabled && round?.kp_separate_buy_in
        ? (round.kp_player_ids?.length || round?.players?.length || 0) * (round?.kp_buy_in || 0)
        : 0;
      hybridTotalKpPot += kpPot;
      (round?.kp_winners || []).forEach(kp => {
        if (kp?.player_id) hybridAllKpWinners.push({ ...kp, flight: Number(fn), date: round?.date });
      });
      (round?.players || []).forEach(p => {
        if (p.player_id && p.name) hybridKpNameMap[p.player_id] = p.name;
      });
    });

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

    // Team event: also merge team results across days (cumulative within flight)
    const isTeamEvt = !!(finalRound.game_type && finalRound.game_type !== 'individual');
    const teamMap = {};
    if (isTeamEvt) {
      sorted.forEach(({ results }) => {
        (results.team_gross_results || []).forEach(t => {
          if (!teamMap[t.team_id]) {
            teamMap[t.team_id] = { team_id: t.team_id, team_name: t.team_name, members: t.members || [], gross: 0, net: 0, dq: false };
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
      });
    }

    const allPlayers = Object.values(playerMap);
    const flightLabel = sorted[0]?.round?.flight_name || `Flight ${fn}`;
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
      ...(isTeamEvt ? {
        team_gross_results: Object.values(teamMap).map(t => ({
          team_id: t.team_id, team_name: t.team_name, members: t.members,
          best_ball_gross: t.dq ? null : t.gross, gross_payout: 0, disqualified: t.dq,
        })).sort((a, b) => (a.disqualified ? 1 : 0) - (b.disqualified ? 1 : 0) || ((a.best_ball_gross ?? 999) - (b.best_ball_gross ?? 999))),
        team_net_results: Object.values(teamMap).map(t => ({
          team_id: t.team_id, team_name: t.team_name, members: t.members,
          best_ball_net: t.dq ? null : t.net, net_payout: 0, disqualified: t.dq,
        })).sort((a, b) => (a.disqualified ? 1 : 0) - (b.disqualified ? 1 : 0) || ((a.best_ball_net ?? 999) - (b.best_ball_net ?? 999))),
      } : {}),
      // Day 1's pot values (buy-in collected there; subsequent days have buy_in=0)
      total_pot: day1.results?.total_pot ?? 0,
      gross_pot: day1.results?.gross_pot ?? 0,
      net_pot: day1.results?.net_pot ?? 0,
      gross_places: day1.results?.gross_places || [],
      net_places: day1.results?.net_places || [],
      // Added money (e.g. sponsorship) is folded into Day 1's pot during per-round
      // compute. Carry it through so computeFlightSeriesResults can extract it and
      // redistribute proportionally — without this, the added money stays in the
      // parent flight's pot AND gets double-counted when split proportionally.
      added_money: day1.results?.added_money ?? 0,
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
  // Also map players from raw round rosters (covers KP-only players not in standings)
  Object.entries(flightGroups).forEach(([fn, days]) => {
    days.forEach(({ round }) => {
      (round?.players || []).forEach(p => {
        if (p.player_id) playerFlightMap[p.player_id] = String(fn);
      });
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
      team_gross_results: finalFlight.results?.team_gross_results || [],
      team_net_results: finalFlight.results?.team_net_results || [],
    },
    ...otherFlights.map(f => ({
      flightNumber: f.flightNumber,
      gross_results: f.results?.gross_results || [],
      net_results: f.results?.net_results || [],
      team_gross_results: f.results?.team_gross_results || [],
      team_net_results: f.results?.team_net_results || [],
    })),
  ];

  // Preserve the final round's per-day gross_skins and net_skins detail arrays.
  // computeFlightSeriesResults spreads { ...finalResults } where finalResults is
  // the flight's mergedResults (which omits skins detail), so without this the
  // per-hole skins tables are empty on the final results page even though the
  // payout dollar amounts are correct in the payouts array.
  const currentDayGrossSkins = finalResults.gross_skins || [];
  const currentDayNetSkins = finalResults.net_skins || [];

  // Hybrid tournament-wide KP: pool ALL days' and flights' KP pots into one
  // purse and divide equally among EVERY KP winner entry (each day's winner
  // counts separately, unlike non-hybrid which dedupes by hole). Override the
  // per-flight KP fields so the KP Winners card, pot breakdown, and payout
  // table all reflect one tournament-wide KP contest.
  let hybridKpOverride = {};
  if (hybridTotalKpPot > 0 && hybridAllKpWinners.length > 0) {
    const perKpAmount = hybridTotalKpPot / hybridAllKpWinners.length;
    const kpResults = hybridAllKpWinners.map(kp => ({
      ...kp,
      name: hybridKpNameMap[kp.player_id] || kp.player_id,
    }));
    const kpPayouts = {};
    kpResults.forEach(kp => {
      kpPayouts[kp.player_id] = (kpPayouts[kp.player_id] || 0) + perKpAmount;
    });
    // Ensure all KP winners exist in the payouts array, then override kp_payout
    const payoutIds = new Set((hybridResults.payouts || []).map(p => p.player_id));
    kpResults.forEach(kp => {
      if (!payoutIds.has(kp.player_id)) {
        hybridResults.payouts.push({
          player_id: kp.player_id, name: kp.name,
          gross_payout: 0, net_payout: 0, field_gross_payout: 0, field_net_payout: 0,
          kp_payout: kpPayouts[kp.player_id] || 0,
          gross_skins_payout: 0, net_skins_payout: 0, deuce_payout: 0,
          total_payout: kpPayouts[kp.player_id] || 0,
        });
      }
    });
    (hybridResults.payouts || []).forEach(p => {
      p.kp_payout = kpPayouts[p.player_id] || 0;
      p.total_payout = (p.gross_payout || 0) + (p.net_payout || 0) +
        (p.field_gross_payout || 0) + (p.field_net_payout || 0) +
        (p.kp_payout || 0) + (p.gross_skins_payout || 0) +
        (p.net_skins_payout || 0) + (p.deuce_payout || 0);
    });
    // Team side games: pool each team's KP winnings and split equally among members.
    splitTeamKpPayoutsAcrossRounds(
      Object.values(flightGroups).flat().map(d => d.round),
      hybridResults.payouts
    );
    hybridKpOverride = {
      kp_results: kpResults,
      kp_per_entry_amount: perKpAmount,
      kp_separate_pot: hybridTotalKpPot,
    };
  }

  // Aggregate side-game pots across ALL days of ALL flights so the pot
  // breakdown on the tournament results page shows the true tournament-wide
  // totals. computeFlightSeriesResults receives MERGED per-flight results
  // (which omit these fields), so without this the Gross/Net Skins and Deuce
  // pot cards are missing from the summary grid.
  const allDayResults = Object.values(flightGroups).flat().map(d => d.results);
  const hybridGrossSkinsPot = allDayResults.reduce((s, r) => s + (r?.gross_skins_separate_pot || 0), 0);
  const hybridNetSkinsPot = allDayResults.reduce((s, r) => s + (r?.net_skins_separate_pot || 0), 0);
  const hybridGrossSkinsAllocated = allDayResults.reduce((s, r) => s + (r?.gross_skins_allocated_pot || 0), 0);
  const hybridNetSkinsAllocated = allDayResults.reduce((s, r) => s + (r?.net_skins_allocated_pot || 0), 0);
  const hybridDeucePot = allDayResults.reduce((s, r) => s + (r?.deuce_pot || 0), 0);
  const hybridSidePot = allDayResults.reduce((s, r) => s + (r?.side_pot || 0), 0);

  return {
    ...hybridResults, ...hybridKpOverride,
    gross_skins_separate_pot: hybridGrossSkinsPot,
    net_skins_separate_pot: hybridNetSkinsPot,
    gross_skins_allocated_pot: hybridGrossSkinsAllocated,
    net_skins_allocated_pot: hybridNetSkinsAllocated,
    deuce_pot: hybridDeucePot,
    side_pot: hybridSidePot,
    all_flight_standings: allFlightStandings,
    _current_day_payouts: currentDayPayouts,
    player_flight_map: playerFlightMap,
    gross_skins: currentDayGrossSkins,
    net_skins: currentDayNetSkins,
  };
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
 * Multi-flight (non-hybrid) tournament-wide KP.
 *
 * All flights' KP pots are pooled into one tournament purse and divided
 * equally across EVERY par-3 on the course (per-hole, not per-flight). Each
 * par-3 has a single winner — the organizer assigns each par-3 to a flight at
 * setup (the flight that "owns" it), and any extra par-3 is an "open" hole
 * whose winner is recorded manually on one flight's scorecard. Every winner
 * receives the same per-hole amount = total purse / number of par-3s.
 *
 * @returns {{ kpResults: Array, kpPayouts: Object, perKpAmount: number, totalKpPot: number }}
 */
function computeTournamentWideKPs(finalRound, finalResults, siblingPairs) {
  // Pool every flight's KP separate pot into one tournament purse.
  let totalKpPot = (finalResults.kp_separate_pot || 0);
  siblingPairs.forEach(({ results }) => {
    totalKpPot += (results?.kp_separate_pot || 0);
  });

  // Collect all KP winners across every flight. Each par-3 should have exactly
  // one recorded winner (the owning flight, or the manually-picked winner for
  // an open par-3). Dedupe by hole — first recorded winner wins — so a par-3
  // accidentally recorded on two flights pays only once.
  const winnersByHole = {};
  const allRounds = [finalRound, ...siblingPairs.map(s => s.round)];
  allRounds.forEach(r => {
    (r?.kp_winners || []).forEach(kp => {
      if (!kp || !kp.player_id) return;
      if (winnersByHole[kp.hole] == null) winnersByHole[kp.hole] = kp;
    });
  });
  const kpResults = Object.values(winnersByHole).sort((a, b) => a.hole - b.hole);

  // Divide the purse across the par-3s that actually have a recorded winner,
  // so the full pot always pays out (no forfeited shares). Falls back to the
  // total par-3 count only when no winners are recorded yet (preview state).
  const par = finalRound.par || [];
  const par3Count = par.filter(p => p === 3).length;
  const winnersCount = kpResults.length;
  const divisor = winnersCount > 0 ? winnersCount : (par3Count || 1);
  const perKpAmount = divisor > 0 ? totalKpPot / divisor : 0;

  const kpPayouts = {};
  kpResults.forEach(kp => {
    kpPayouts[kp.player_id] = (kpPayouts[kp.player_id] || 0) + perKpAmount;
  });

  return { kpResults, kpPayouts, perKpAmount, totalKpPot };
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

  collect(finalResults, finalRound.flight_name || `Flight ${finalRound.flight_number || 1}`, finalRound);
  siblingPairs.forEach(({ round, results }) => {
    collect(results, round?.flight_name || `Flight ${round?.flight_number || 1}`, round);
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
  // Added money (e.g. sponsorship) is folded into the parent flight's pot during
  // per-round compute. Here we extract it so it can be redistributed PROPORTIONALLY
  // by player count across all flights — each flight keeps its own buy-in pot.
  const totalAddedMoney = parentRound?.added_money || allFlightResults.reduce((sum, r) => sum + (r?.added_money || 0), 0) || 0;
  const parentGrossPotWithAdded = parentRound?.results?.gross_pot || 0;
  const parentNetPotWithAdded = parentRound?.results?.net_pot || 0;
  const parentSumPot = parentGrossPotWithAdded + parentNetPotWithAdded;
  const addedGrossTotal = totalAddedMoney > 0 && parentSumPot > 0
    ? totalAddedMoney * (parentGrossPotWithAdded / parentSumPot)
    : totalAddedMoney / 2;
  const addedNetTotal = totalAddedMoney > 0 && parentSumPot > 0
    ? totalAddedMoney * (parentNetPotWithAdded / parentSumPot)
    : totalAddedMoney / 2;
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

  // Field prizes are only awarded when explicitly enabled (or legacy rounds
  // with fixed prize amounts). When disabled, no field winners are computed —
  // players stay in their own flight's standings and no Field Prizes card shows.
  const fieldPrizesActive = parentRound?.field_prizes_enabled === true ||
    (parentRound?.field_prizes_enabled == null &&
     ((parentRound?.field_gross_prize > 0) || (parentRound?.field_net_prize > 0)));

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
  let fieldGrossWinner = undefined;
  let fieldNetWinner = undefined;
  if (fieldPrizesActive) {
    fieldGrossWinner = resolveFieldWinner(fieldGross, false);
    fieldNetWinner = fieldNet.find(r =>
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
  // Each flight KEEPS its own buy-in pot — buy-in money is not redistributed
  // across flights. The added money (e.g. sponsorship, entered on the parent
  // round) is the only portion split proportionally by player count. The field
  // prize (Low Gross/Net of the Field) is carved from the combined pot, which
  // reduces the added money available for proportional distribution. Side game
  // payouts (skins, KPs, deuces) are preserved from each flight's own computeResults.

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
  // Side games (gross skins, net skins, deuces) settle PER-DAY. Each day's
  // results contain that day's side game payouts as separate entries (one per
  // player per day). Accumulate them into the combined payouts so the Final
  // Payouts table shows each player's total side game winnings across all days
  // of their flight. KP is handled separately (tournament-wide pooling) so it
  // is NOT accumulated here.
  const accumulateSideGames = (p) => {
    ensurePlayer(p);
    const fp = flightPayoutsMap[p.player_id];
    fp.gross_skins_payout += (p.gross_skins_payout || 0);
    fp.net_skins_payout += (p.net_skins_payout || 0);
    fp.deuce_payout += (p.deuce_payout || 0);
  };
  (finalResults.payouts || []).forEach(accumulateSideGames);
  siblingPairs.forEach(({ results }) => {
    (results.payouts || []).forEach(accumulateSideGames);
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
  // Declared BEFORE flightStandingsList (which references them as fallbacks) —
  // referencing a `const` before its declaration throws at runtime.
  const parentGrossPot = parentRound?.results?.gross_pot || finalResults.gross_pot || 0;
  const parentNetPot = parentRound?.results?.net_pot || finalResults.net_pot || 0;
  // Team events pay by TEAM, not by individual. Without this, a team could be
  // paid twice — one member winning gross while their partner won net — which
  // violates the single-win (no double dipping) rule. Team standings are carried
  // on each flight's merged results.
  const isTeamEvent = !!(finalRound.game_type && finalRound.game_type !== 'individual') ||
    finalRound.team_mode === true;
  const flightStandingsList = [
    { gross: (finalResults.gross_results || []).filter(r => !r.disqualified && r.gross_total != null),
      net: (finalResults.net_results || []).filter(r => !r.disqualified && r.net_total != null),
      teamGross: finalResults.team_gross_results || [],
      teamNet: finalResults.team_net_results || [],
      flightGrossPlaces: finalResults.gross_places || grossPlaces,
      flightNetPlaces: finalResults.net_places || netPlaces,
      ownGrossPot: finalResults.gross_pot || parentGrossPot,
      ownNetPot: finalResults.net_pot || parentNetPot,
      flightAddedMoney: finalResults.added_money || 0 },
    ...siblingPairs.map(s => ({
      gross: (s.results.gross_results || []).filter(r => !r.disqualified && r.gross_total != null),
      net: (s.results.net_results || []).filter(r => !r.disqualified && r.net_total != null),
      teamGross: s.results.team_gross_results || [],
      teamNet: s.results.team_net_results || [],
      flightGrossPlaces: s.results.gross_places || grossPlaces,
      flightNetPlaces: s.results.net_places || netPlaces,
      ownGrossPot: s.results.gross_pot || parentGrossPot,
      ownNetPot: s.results.net_pot || parentNetPot,
      flightAddedMoney: s.results.added_money || 0,
    })),
  ];

  // 4. For each flight, assign gross/net payouts from standings + pot share
  // The parent's gross_places/net_places sum to the parent's SINGLE-FLIGHT
  // gross_pot/net_pot — not the combined pot. So the ratio must divide by a
  // single flight's pot, not the combined grossPot/netPot, otherwise every
  // place amount is under-scaled (e.g. halved for 2 flights).

  // Ensure field prizes are at least as large as the highest per-flight 1st
  // place payout. The "Low Gross/Net of the Field" is the overall winner —
  // it should never pay less than a single flight's 1st place. Compute what
  // each flight's 1st place would be WITHOUT the field prize carve-out, then
  // bump the field prize if needed.
  if (fieldGrossPrize > 0 || fieldNetPrize > 0) {
    const maxGross1st = Math.max(0, ...flightStandingsList.map(({ gross, flightGrossPlaces, ownGrossPot, flightAddedMoney }) => {
      const count = (gross || []).length;
      if (count === 0 || totalPlayers === 0 || ownGrossPot <= 0) return 0;
      const flightAddedGross = totalAddedMoney > 0 ? flightAddedMoney * (addedGrossTotal / totalAddedMoney) : 0;
      const buyInGross = ownGrossPot - flightAddedGross;
      const flightGrossPotNoField = buyInGross + addedGrossTotal * (count / totalPlayers);
      return (flightGrossPlaces[0] || 0) * (flightGrossPotNoField / ownGrossPot);
    }));
    const maxNet1st = Math.max(0, ...flightStandingsList.map(({ net, flightNetPlaces, ownNetPot, flightAddedMoney }) => {
      const count = (net || []).length;
      if (count === 0 || totalPlayers === 0 || ownNetPot <= 0) return 0;
      const flightAddedNet = totalAddedMoney > 0 ? flightAddedMoney * (addedNetTotal / totalAddedMoney) : 0;
      const buyInNet = ownNetPot - flightAddedNet;
      const flightNetPotNoField = buyInNet + addedNetTotal * (count / totalPlayers);
      return (flightNetPlaces[0] || 0) * (flightNetPotNoField / ownNetPot);
    }));
    fieldGrossPrize = Math.max(fieldGrossPrize, maxGross1st);
    fieldNetPrize = Math.max(fieldNetPrize, maxNet1st);
    flightGrossPotTotal = Math.max(0, grossPot - fieldGrossPrize);
    flightNetPotTotal = Math.max(0, netPot - fieldNetPrize);
  }

  flightStandingsList.forEach(({ gross, net, teamGross, teamNet, flightGrossPlaces: rawGrossPlaces, flightNetPlaces: rawNetPlaces, ownGrossPot, ownNetPot, flightAddedMoney }) => {
    const flightPlayerCount = (gross || []).length;
    if (flightPlayerCount === 0 || totalPlayers === 0) return;
    const flightShare = flightPlayerCount / totalPlayers;
    // Each flight keeps its own buy-in pot; the added money (folded into the
    // parent flight's pot during per-round compute) is extracted and split
    // proportionally by player count. The field prize is carved from the
    // combined pot, reducing the added money available for distribution.
    const flightAddedGross = totalAddedMoney > 0 ? flightAddedMoney * (addedGrossTotal / totalAddedMoney) : 0;
    const flightAddedNet = totalAddedMoney > 0 ? flightAddedMoney * (addedNetTotal / totalAddedMoney) : 0;
    const buyInGrossPot = ownGrossPot - flightAddedGross;
    const buyInNetPot = ownNetPot - flightAddedNet;
    const flightGrossPot = buyInGrossPot + (addedGrossTotal - fieldGrossPrize) * flightShare;
    const flightNetPot = buyInNetPot + (addedNetTotal - fieldNetPrize) * flightShare;

    // Scale this flight's own place amounts to its pot share
    const grossRatio = ownGrossPot > 0 ? flightGrossPot / ownGrossPot : 0;
    const netRatio = ownNetPot > 0 ? flightNetPot / ownNetPot : 0;
    const flightGrossPlaces = rawGrossPlaces.map(v => v * grossRatio);
    const flightNetPlaces = rawNetPlaces.map(v => v * netRatio);

    // Assign gross/net payouts using the SAME higher-pay conflict resolution
    // as the per-round engine (applyConflictResolution): a player who qualifies
    // for both gross and net keeps whichever pays MORE, and the other spot
    // cascades to the next eligible player. Field prize winners are excluded
    // from both. This replaces the old rule that always excluded gross winners
    // from net — which could leave a player with a higher net payout stuck
    // with a lower gross tie-split instead.
    // ── Team events: pay by TEAM, enforcing the single-win rule per team ──
    // A team that qualifies for both gross and net keeps whichever pays more;
    // the other spot cascades to the next eligible team. Each team's prize is
    // then split equally among its members. This is what prevents a team from
    // collecting in both gross and net (double dipping).
    if (isTeamEvent && (teamGross || []).length > 0) {
      const tGross = (teamGross || []).filter(t => !t.disqualified && t.best_ball_gross != null);
      const tNet = (teamNet || []).filter(t => !t.disqualified && t.best_ball_net != null);
      const { grossPayouts: tgp, netPayouts: tnp } = applyTeamConflictResolution(
        tGross, tNet, flightGrossPlaces, flightNetPlaces
      );
      // Write the team totals back onto the standings so the per-flight team
      // cards render the same amounts the payout table shows.
      (teamGross || []).forEach(t => { t.gross_payout = tgp[t.team_id] || 0; });
      (teamNet || []).forEach(t => { t.net_payout = tnp[t.team_id] || 0; });

      const applyShares = (teams, payoutMap, key) => {
        (teams || []).forEach(t => {
          const amount = payoutMap[t.team_id] || 0;
          if (amount <= 0 || !t.members?.length) return;
          const share = amount / t.members.length;
          t.members.forEach(m => {
            ensurePlayer({ player_id: m.player_id, name: m.name });
            flightPayoutsMap[m.player_id][key] = share;
          });
        });
      };
      applyShares(teamGross, tgp, 'gross_payout');
      applyShares(teamNet, tnp, 'net_payout');
      return;
    }

    const grossEligible = (gross || []).filter(r =>
      r.player_id !== fieldGrossWinner?.player_id &&
      r.player_id !== fieldNetWinner?.player_id
    );
    const netEligible = (net || []).filter(r =>
      r.player_id !== fieldNetWinner?.player_id &&
      r.player_id !== fieldGrossWinner?.player_id
    );
    const { grossPayouts, netPayouts } = applyConflictResolution(
      {}, {}, grossEligible, netEligible, flightGrossPlaces, flightNetPlaces, descending
    );
    const nameMap = {};
    [...grossEligible, ...netEligible].forEach(r => { if (r.player_id) nameMap[r.player_id] = r.name; });
    Object.entries(grossPayouts).forEach(([pid, amount]) => {
      ensurePlayer({ player_id: pid, name: nameMap[pid] || pid });
      flightPayoutsMap[pid].gross_payout = amount;
    });
    Object.entries(netPayouts).forEach(([pid, amount]) => {
      ensurePlayer({ player_id: pid, name: nameMap[pid] || pid });
      flightPayoutsMap[pid].net_payout = amount;
    });
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

  // 6. Multi-flight (non-hybrid) only: KP is a tournament-wide contest, not
  // per-flight. Pool all flights' KP pots, divide equally across every par-3,
  // and pay each par-3's recorded winner the same per-hole amount. Hybrid
  // tournaments settle KP per-day per-flight and are left unchanged.
  const isNonHybridMultiFlight = !!(finalRound.is_multi_flight && !finalRound.is_multi_day);
  let tournamentKP = null;
  let playerFlightMap = null;
  if (isNonHybridMultiFlight) {
    // Map each player to their flight number (string) so the tournament-level
    // results page can split the combined payouts table per flight.
    playerFlightMap = {};
    [finalRound, ...siblingPairs.map(s => s.round)].forEach(r => {
      const fn = String(r?.flight_number || 1);
      (r?.players || []).forEach(p => { if (p.player_id) playerFlightMap[p.player_id] = fn; });
    });
    tournamentKP = computeTournamentWideKPs(finalRound, finalResults, siblingPairs);
    // Attach player names to each KP result so the KP Winners card can render
    // winners from OTHER flights (the final flight's roster doesn't include them).
    const kpNameMap = {};
    [finalRound, ...siblingPairs.map(s => s.round)].forEach(r => {
      (r?.players || []).forEach(p => { if (p.player_id && p.name) kpNameMap[p.player_id] = p.name; });
    });
    tournamentKP.kpResults = tournamentKP.kpResults.map(kp => ({
      ...kp,
      name: kp.name || kpNameMap[kp.player_id] || kp.player_id,
    }));
    combinedPayouts.forEach(p => {
      p.kp_payout = tournamentKP.kpPayouts[p.player_id] || 0;
    });
    // Team side games: pool each team's KP winnings and split equally among members.
    splitTeamKpPayoutsAcrossRounds(
      [finalRound, ...siblingPairs.map(s => s.round)],
      combinedPayouts
    );
  }

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
    // Preserve this flight's OWN side-game pots (before combining) so the
    // current day's side games section shows this flight's pot, not the
    // tournament-wide total that overwrites gross_skins_allocated_pot below.
    flight_own_gross_skins_pot: finalResults.gross_skins_allocated_pot || finalResults.gross_skins_separate_pot || 0,
    flight_own_net_skins_pot: finalResults.net_skins_allocated_pot || finalResults.net_skins_separate_pot || 0,
    flight_own_deuce_pot: finalResults.deuce_pot || 0,
    is_series_cumulative: true,
    is_flight_cumulative: true,
    series_flights: 1 + siblingPairs.length,
    field_gross_winner: fieldGrossWinner,
    field_net_winner: fieldNetWinner,
    field_gross_prize: fieldGrossPrize,
    field_net_prize: fieldNetPrize,
    // Tournament-wide KP (non-hybrid multi-flight): override the per-flight KP
    // fields with the pooled, per-hole values so the KP Winners section, pot
    // breakdown, and payout table all reflect one tournament-wide KP contest.
    ...(isNonHybridMultiFlight && tournamentKP ? {
      kp_results: tournamentKP.kpResults,
      kp_per_entry_amount: tournamentKP.perKpAmount,
      kp_separate_pot: tournamentKP.totalKpPot,
    } : {}),
    ...(isNonHybridMultiFlight && playerFlightMap ? {
      player_flight_map: playerFlightMap,
    } : {}),
    // Aggregate side-game pots across all flights for the pot breakdown grid.
    gross_skins_separate_pot: allFlightResults.reduce((s, r) => s + (r?.gross_skins_separate_pot || 0), 0),
    net_skins_separate_pot: allFlightResults.reduce((s, r) => s + (r?.net_skins_separate_pot || 0), 0),
    gross_skins_allocated_pot: allFlightResults.reduce((s, r) => s + (r?.gross_skins_allocated_pot || 0), 0),
    net_skins_allocated_pot: allFlightResults.reduce((s, r) => s + (r?.net_skins_allocated_pot || 0), 0),
    deuce_pot: allFlightResults.reduce((s, r) => s + (r?.deuce_pot || 0), 0),
    side_pot: allFlightResults.reduce((s, r) => s + (r?.side_pot || 0), 0),
    payouts: combinedPayouts,
  };
}
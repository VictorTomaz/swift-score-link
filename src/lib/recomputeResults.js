import { base44 } from "@/api/base44Client";
import { computeResults } from "@/lib/swiftScoreEngine";
import { computeSeriesResults, computeTeamSeriesResults } from "@/lib/seriesResults";
import { computeFlightSeriesResults, computeHybridSeriesResults } from "@/lib/flightResults";
import { isSeriesFinalDay, isFinalDayOfFlight } from "@/hooks/useSeriesRounds";
import { computeTeamResults, applyTeamPayouts, computeTeamSkins, splitTeamSideGamePayouts, teamSideGamesActive } from "@/lib/teamScoreEngine";
import { applyTeamSideGames } from "@/lib/teamSideGames";

/**
 * Full recompute for a single round — the same logic used by Results.jsx.
 * Extracted so TournamentResults can trigger a recompute inline (without
 * navigating away) when it detects stale results (e.g. missing side games).
 *
 * @param {string} roundId
 * @param {{ silent?: boolean }} opts  silent=true skips clearing the PDF cache
 * @returns {Promise<{ players: Array, results: object }>}
 */
export async function recomputeRoundResults(roundId, { silent = false } = {}) {
  const freshRounds = await base44.entities.Round.filter({ id: roundId });
  let freshRound = freshRounds[0];
  if (!freshRound) throw new Error("Round not found");

  // Load scores from RoundScore entity
  let roundScoreMap = {};
  try {
    const { loadRoundScores } = await import("@/lib/roundScores");
    roundScoreMap = await loadRoundScores(roundId);
  } catch (e) { /* use inline scores */ }

  const mergedPlayers = (freshRound.players || []).map(p => {
    const rsScores = roundScoreMap[p.player_id];
    const scores = (rsScores && rsScores.length > 0) ? rsScores : (p.scores || []);
    return { ...p, scores };
  });
  freshRound = { ...freshRound, players: mergedPlayers };

  const result = computeResults(freshRound);
  if (!result.success) throw new Error(result.issues.join(", "));

  let slimResults = {
    ...result.results,
    gross_results: (result.results.gross_results || []).map(({ achievements, ...r }) => r),
    net_results: (result.results.net_results || []).map(({ achievements, net_scores, ...r }) => r),
  };

  // Team mode: compute team best-ball standings and override gross/net payouts
  if (freshRound.game_type && freshRound.game_type !== "individual") {
    const teamResult = computeTeamResults({ ...freshRound, results: slimResults });
    slimResults = applyTeamPayouts(slimResults, teamResult);
    slimResults.team_gross_results = teamResult.team_gross_results;
    slimResults.team_net_results = teamResult.team_net_results;

    const kpFolded = freshRound.kps_enabled && !freshRound.kp_separate_buy_in &&
      (freshRound.gross_skins_enabled || freshRound.net_skins_enabled);
    const wantsGrossSkins = !!freshRound.gross_skins_enabled;
    const wantsNetSkins = !!freshRound.net_skins_enabled;
    // Aggregate and Las Vegas keep side games individual.
    const skinsTeamMode = teamSideGamesActive(freshRound);
    if (!kpFolded && skinsTeamMode && (wantsGrossSkins || wantsNetSkins)) {
      const teamSkins = computeTeamSkins(
        { ...freshRound, results: slimResults },
        wantsGrossSkins ? (slimResults.gross_skins_allocated_pot || slimResults.gross_skins_separate_pot || 0) : 0,
        wantsNetSkins ? (slimResults.net_skins_allocated_pot || slimResults.net_skins_separate_pot || 0) : 0
      );
      if (wantsGrossSkins) slimResults.gross_skins = teamSkins.gross_skins;
      if (wantsNetSkins) slimResults.net_skins = teamSkins.net_skins;
      slimResults.payouts = (slimResults.payouts || []).map((p) => {
        const gsp = wantsGrossSkins ? (teamSkins.grossSkinsPlayerPayouts[p.player_id] || 0) : (p.gross_skins_payout || 0);
        const nsp = wantsNetSkins ? (teamSkins.netSkinsPlayerPayouts[p.player_id] || 0) : (p.net_skins_payout || 0);
        return {
          ...p,
          gross_skins_payout: gsp,
          net_skins_payout: nsp,
          total_payout: (p.gross_payout || 0) + (p.net_payout || 0) + (p.kp_payout || 0) + gsp + nsp + (p.deuce_payout || 0),
        };
      });
    }

    if (skinsTeamMode && !kpFolded) {
      slimResults.payouts = splitTeamSideGamePayouts(
        { ...freshRound, results: slimResults },
        slimResults.payouts
      );
    }
  }

  // Multi-day / multi-flight series
  if (freshRound.is_multi_day || freshRound.is_multi_flight) {
    const anchorId = freshRound.parent_round_id || freshRound.id;
    let allSeries = [freshRound];
    try {
      const sres = await base44.functions.invoke("getSeriesRounds", { roundId });
      const sdata = sres?.data || sres;
      if (sdata?.rounds && sdata.rounds.length > 0) allSeries = sdata.rounds;
    } catch (serErr) { /* fallback below */ }

    const hasAnchor = allSeries.some(r => r.id === anchorId);
    if (allSeries.length <= 1 || (!hasAnchor && freshRound.id !== anchorId)) {
      const seriesChildren = await base44.entities.Round.filter({ parent_round_id: anchorId });
      let parentRound = freshRound;
      if (freshRound.id !== anchorId) {
        try { parentRound = await base44.entities.Round.get(anchorId); }
        catch (e) { /* keep freshRound */ }
      }
      const seen = new Set();
      const fallbackSeries = [parentRound, ...(seriesChildren || [])]
        .filter(Boolean)
        .filter(r => (seen.has(r.id) ? false : (seen.add(r.id), true)));
      if (fallbackSeries.length > allSeries.length || (!hasAnchor && parentRound?.id === anchorId)) {
        allSeries = fallbackSeries;
      }
    }
    const parentRound = allSeries.find(r => r.id === anchorId) || allSeries.find(r => !r.parent_round_id) || freshRound;
    const isHybrid = !!(freshRound.is_multi_day && freshRound.is_multi_flight);

    if (isSeriesFinalDay(freshRound, allSeries)) {
      const siblingRounds = allSeries.filter(r => r.id !== freshRound.id);
      const isTeamSeries = !!(freshRound.game_type && freshRound.game_type !== "individual");
      const siblingResults = [];
      const siblingPairs = [];
      const siblingPersistPromises = [];
      for (const sib of siblingRounds) {
        let sibScoreMap = {};
        try {
          const { loadRoundScores } = await import("@/lib/roundScores");
          sibScoreMap = await loadRoundScores(sib.id);
        } catch (e) {}
        const sibMergedPlayers = (sib.players || []).map(p => {
          const rs = sibScoreMap[p.player_id];
          const scores = (rs && rs.length > 0) ? rs : (p.scores || []);
          return { ...p, scores };
        });
        const sibRound = { ...sib, players: sibMergedPlayers, all_players: sib.players };

        let sibRes = sib.results;
        let sibRecomputed = false;
        const sibPlayerCount = (sib.players || sib.all_players || []).length;
        const sibResultCount = (sibRes?.gross_results || []).length;
        const hasFieldWideData = sibPlayerCount > 0 && sibResultCount > sibPlayerCount;
        if (!sibRes || !sibRes.gross_results || sibRes.is_series_cumulative || sibRes.is_flight_cumulative || sibRes.is_flight_final || hasFieldWideData) {
          try {
            const sibCompute = computeResults(sibRound);
            if (sibCompute.success) { sibRes = sibCompute.results; sibRecomputed = true; }
          } catch (e) {}
        }
        if (sibRes && sibRes.gross_results) {
          // Saved skins rows from an older/individual computation carry no
          // team_id — treat those as needing the team side-game pass too.
          const sibSkinsAreIndividual = [
            ...(sibRes.gross_skins || []),
            ...(sibRes.net_skins || []),
          ].some(s => !s.team_id && !s.team_name);
          if (isTeamSeries && (!sibRes.team_gross_results || sibRecomputed || sibSkinsAreIndividual)) {
            try {
              const sibTeam = computeTeamResults({ ...sibRound, results: sibRes });
              sibRes = applyTeamPayouts(sibRes, sibTeam);
              sibRes.team_gross_results = sibTeam.team_gross_results;
              sibRes.team_net_results = sibTeam.team_net_results;
              // Team side games (skins split by team) — without this a
              // recomputed sibling day falls back to individual skins rows.
              sibRes = applyTeamSideGames(sibRound, sibRes);
              sibRecomputed = true;
            } catch (e) {}
          }
          if (sibRecomputed) {
            const sibSlim = {
              ...sibRes,
              gross_results: (sibRes.gross_results || []).map(({ achievements, ...r }) => r),
              net_results: (sibRes.net_results || []).map(({ achievements, net_scores, ...r }) => r),
            };
            delete sibSlim.is_series_cumulative;
            siblingPersistPromises.push(
              base44.entities.Round.update(sib.id, { results: sibSlim })
                .catch(e => {})
            );
          }
          siblingResults.push(sibRes);
          siblingPairs.push({ round: sib, results: sibRes });
        }
      }
      if (siblingPersistPromises.length > 0) await Promise.all(siblingPersistPromises);

      if (siblingResults.length > 0) {
        if (isHybrid || (freshRound.is_multi_day && freshRound.is_multi_flight)) {
          slimResults = computeHybridSeriesResults(freshRound, slimResults, siblingPairs, parentRound);
        } else if (freshRound.is_multi_flight || freshRound.series_type === "multi_flight") {
          slimResults = computeFlightSeriesResults(freshRound, slimResults, siblingPairs, parentRound);
        } else if (isTeamSeries) {
          slimResults = computeTeamSeriesResults(freshRound, slimResults, siblingResults, parentRound);
        } else {
          slimResults = computeSeriesResults(freshRound, slimResults, siblingResults, parentRound);
        }
      }
    } else if (freshRound.is_multi_flight && isFinalDayOfFlight(freshRound, allSeries)) {
      const fn = freshRound.flight_number || 1;
      const flightSiblings = allSeries.filter(r =>
        r.id !== freshRound.id && (r.flight_number || 1) === fn
      );
      const flightSiblingResults = [];
      for (const sib of flightSiblings) {
        let sibRes = sib.results;
        const sibPlayerCount = (sib.players || sib.all_players || []).length;
        const sibResultCount = (sibRes?.gross_results || []).length;
        const hasFieldWideData = sibPlayerCount > 0 && sibResultCount > sibPlayerCount;
        if (!sibRes || !sibRes.gross_results || sibRes.is_series_cumulative || sibRes.is_flight_cumulative || sibRes.is_flight_final || hasFieldWideData) {
          try {
            let sibScoreMap = {};
            try {
              const { loadRoundScores } = await import("@/lib/roundScores");
              sibScoreMap = await loadRoundScores(sib.id);
            } catch (e) {}
            const sibMergedPlayers = (sib.players || []).map(p => {
              const rs = sibScoreMap[p.player_id];
              const scores = (rs && rs.length > 0) ? rs : (p.scores || []);
              return { ...p, scores };
            });
            const sibRound = { ...sib, players: sibMergedPlayers, all_players: sib.players };
            const sibCompute = computeResults(sibRound);
            if (sibCompute.success) {
              sibRes = sibCompute.results;
              if (sibRound.game_type && sibRound.game_type !== "individual") {
                const sibTeam = computeTeamResults({ ...sibRound, results: sibRes });
                sibRes = applyTeamPayouts(sibRes, sibTeam);
                sibRes.team_gross_results = sibTeam.team_gross_results;
                sibRes.team_net_results = sibTeam.team_net_results;
                sibRes = applyTeamSideGames(sibRound, sibRes);
              }
            }
          } catch (e) {}
        }
        if (sibRes && sibRes.gross_results) flightSiblingResults.push(sibRes);
      }
      if (flightSiblingResults.length > 0) {
        // Team events must use the TEAM cumulative function — the individual one
        // leaves team standings at per-day scores with $0 team payouts, so the
        // flight looks like nothing was recorded.
        const isTeamFlight = !!(freshRound.game_type && freshRound.game_type !== "individual");
        slimResults = isTeamFlight
          ? computeTeamSeriesResults(freshRound, slimResults, flightSiblingResults, parentRound)
          : computeSeriesResults(freshRound, slimResults, flightSiblingResults, parentRound);
        slimResults.is_flight_final = true;
        delete slimResults.is_series_cumulative;
      }
    }
  }

  const updatePayload = { results: slimResults, players: mergedPlayers };
  if (!silent) updatePayload.results_pdf_url = null;
  await base44.entities.Round.update(roundId, updatePayload);

  return { players: mergedPlayers, results: slimResults };
}

/**
 * Detects whether a final-round's combined payouts are missing side game
 * (skins, deuces) data that exists in sibling rounds — the pre-fix
 * computation didn't carry these into the combined payouts.
 */
export function hasMissingSideGames(finalRound, seriesRounds) {
  if (!finalRound?.results?.is_series_cumulative) return false;
  const siblings = (seriesRounds || []).filter(r => r.id !== finalRound.id);
  const siblingHasSideGames = siblings.some(s =>
    (s.results?.payouts || []).some(p => (p.gross_skins_payout || 0) > 0 || (p.deuce_payout || 0) > 0)
  );
  if (!siblingHasSideGames) return false;
  const finalHasSideGames = (finalRound.results?.payouts || []).some(p =>
    (p.gross_skins_payout || 0) > 0 || (p.deuce_payout || 0) > 0
  );
  return !finalHasSideGames;
}

/**
 * Detects a STALE combined result: the tournament was finalized before every
 * flight finished scoring, so the saved field standings hold null (no-score)
 * entries for players whose own flight has since computed a real score. Those
 * players were treated as DQ, so their flight's gross/net payouts were assigned
 * to almost nobody. A fresh recompute fixes it.
 */
export function hasStaleFlightScores(finalRound, seriesRounds) {
  const combined = finalRound?.results;
  if (!combined?.is_series_cumulative) return false;
  const nullIds = new Set(
    (combined.gross_results || [])
      .filter(r => r.gross_total == null || r.disqualified)
      .map(r => r.player_id)
  );
  if (nullIds.size === 0) return false;
  return (seriesRounds || []).some(s =>
    s.id !== finalRound.id &&
    (s.results?.gross_results || []).some(r =>
      nullIds.has(r.player_id) && !r.disqualified && r.gross_total != null
    )
  );
}
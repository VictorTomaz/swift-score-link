/**
 * Team scoring engine for best-ball and scramble team formats.
 * Computes team-based gross and net best-ball standings and payouts.
 * This is separate from the individual swiftScoreEngine — it runs alongside it
 * and overrides gross/net payouts when a team game type is selected.
 */

import { computeTeamHandicap } from "@/lib/teamHandicap";

// ─── HELPERS ────────────────────────────────────────────────

/**
 * Single-team-score formats (Scramble, Chapman, 6-6-6): one score per hole
 * applies to the whole team, so net must use the combined team handicap from
 * round.hcp_formula — NOT individual per-player handicaps.
 */
function isSingleTeamScoreFormat(round) {
  const gt = round?.game_type;
  if (gt === "team_scramble" || gt === "team_chapman" || gt === "team_6_6_6") return true;
  if (round?.team_mode === true && round?.team_format === "scramble") return true;
  return false;
}

/**
 * Aggregate format: the team's score on a hole is the SUM of all members'
 * scores (gross or net), not the best (lowest) ball.
 */
function isAggregateFormat(round) {
  const gt = round?.game_type;
  if (gt === "team_aggregate") return true;
  if (round?.team_mode === true && round?.team_format === "aggregate") return true;
  return false;
}

/**
 * Net score for a single-team-score hole: the team's best-ball gross score
 * (the low ball) minus strokes derived from the combined team handicap.
 * Uses the same gross base as the team gross standings so net is always
 * consistent with gross (net = gross − team handicap strokes).
 */
function teamNetSingleScore(members, holeIdx, hcpIndexes, teamHandicap) {
  const gross = bestBallGross(members, holeIdx);
  if (typeof gross === "number" && gross > 0) {
    return gross - holeStrokes(teamHandicap, hcpIndexes[holeIdx] || 0);
  }
  return null;
}

/**
 * Compute a team's net score on one hole, honoring the round's handicap formula.
 * - Single-team-score formats (scramble/chapman/6-6-6): use the combined team
 *   handicap (computeTeamHandicap). Falls back to bestBallNet when the formula
 *   is 'individual' (no team value).
 * - Best ball: each player uses their own course handicap (standard).
 */
function computeTeamNetPerHole(team, holeIdx, hcpIndexes, round) {
  if (isAggregateFormat(round)) {
    return aggregateNet(team.members, holeIdx, hcpIndexes, round?.hcp_formula);
  }
  if (isSingleTeamScoreFormat(round)) {
    const teamHcp = computeTeamHandicap(team.members, round.hcp_formula || "combined_85");
    if (teamHcp != null) {
      return teamNetSingleScore(team.members, holeIdx, hcpIndexes, teamHcp);
    }
  }
  return bestBallNet(team.members, holeIdx, hcpIndexes, round?.hcp_formula);
}

function normalizeScore(s) {
  if (typeof s === 'string' && s.trim().toUpperCase() === 'X') return 'X';
  return typeof s === 'number' ? s : Number(s);
}

function isValidScore(s) {
  if (typeof s === 'string' && s.trim().toUpperCase() === 'X') return true;
  const n = Number(s);
  return !isNaN(n) && n >= 1;
}

/**
 * Strokes received on a hole based on course handicap. Mirrors the scorecard's
 * strokesOnHole: handles plus handicaps (strokes given back on easiest holes)
 * and handicaps above 36 (up to 3 strokes on the lowest-index holes).
 */
function holeStrokes(courseHandicap, holeHcpIndex) {
  if (courseHandicap == null || isNaN(Number(courseHandicap))) return 0;
  const ch = Number(courseHandicap);
  if (ch < 0) {
    const floored = Math.floor(Math.abs(ch));
    return holeHcpIndex > (18 - floored) ? -1 : 0;
  }
  const floored = Math.floor(ch);
  let strokes = 0;
  if (floored > 0 && holeHcpIndex <= floored) strokes += 1;
  if (floored > 18 && holeHcpIndex <= (floored - 18)) strokes += 1;
  if (floored > 36 && holeHcpIndex <= (floored - 36)) strokes += 1;
  return strokes;
}

/**
 * Geometric payout curve (0.75 ratio) — same as the individual CUSTOM engine.
 */
function geometricPayouts(numPlaces, pot) {
  if (numPlaces <= 0 || pot <= 0) return [];
  const weights = Array.from({ length: numPlaces }, (_, i) => Math.pow(0.75, i));
  const weightSum = weights.reduce((a, b) => a + b, 0);
  return weights.map(w => (w / weightSum) * pot);
}

// ─── TEAM BUILDING ───────────────────────────────────────────

/**
 * Groups players into teams based on tee_group tags, or auto-splits by team_size.
 */
export function buildTeams(round) {
  const allPlayers = (round.players || []).filter(p => {
    const validCount = (p.scores || []).filter(isValidScore).length;
    return validCount > 0;
  });
  if (allPlayers.length === 0) return [];

  const teamSize = round.team_size || 2;
  const hasGroupTags = allPlayers.some(p => (p.tee_group || "").trim());

  if (hasGroupTags) {
    const groups = {};
    for (const p of allPlayers) {
      const tag = (p.tee_group || "").trim();
      if (!tag) continue;
      if (!groups[tag]) groups[tag] = [];
      groups[tag].push(p);
    }
    return Object.keys(groups).sort().map(tag => ({
      team_id: tag,
      team_name: groups[tag].map(p => p.name).join(" / "),
      members: groups[tag],
    }));
  }

  // Auto-split into teams of teamSize
  const teams = [];
  for (let i = 0; i < allPlayers.length; i += teamSize) {
    const members = allPlayers.slice(i, i + teamSize);
    const label = String.fromCharCode(65 + Math.floor(i / teamSize));
    teams.push({
      team_id: `auto_${label}`,
      team_name: members.map(p => p.name).join(" / "),
      members,
    });
  }
  return teams;
}

// ─── BEST-BALL CALCULATION ────────────────────────────────────

function bestBallGross(members, holeIdx) {
  const scores = [];
  for (const p of members) {
    const gross = normalizeScore((p.scores || [])[holeIdx]);
    if (typeof gross === "number" && gross > 0) {
      scores.push(gross);
    }
  }
  return scores.length ? Math.min(...scores) : null;
}

function bestBallNet(members, holeIdx, hcpIndexes, formula) {
  const scores = [];
  for (const p of members) {
    const gross = normalizeScore((p.scores || [])[holeIdx]);
    if (typeof gross !== "number" || gross <= 0) continue;
    const ch = p.course_handicap != null ? Number(p.course_handicap) : null;
    let hcpVal = ch != null ? ch : (p.is_plus_handicap ? -Math.abs(p.handicap || 0) : Math.abs(p.handicap || 0));
    // Best ball with the 85% formula: each player plays off 85% of their OWN
    // Course Handicap (not a combined team handicap), per four-ball rules.
    if (formula === 'combined_85') {
      hcpVal = hcpVal < 0 ? -Math.round(Math.abs(hcpVal) * 0.85) : Math.round(hcpVal * 0.85);
    }
    const strokes = holeStrokes(hcpVal, hcpIndexes[holeIdx] || 0);
    scores.push(gross - strokes);
  }
  return scores.length ? Math.min(...scores) : null;
}

/**
 * Aggregate gross: sum of all members' valid gross scores on a hole.
 */
function aggregateGross(members, holeIdx) {
  let sum = 0;
  let hasScore = false;
  for (const p of members) {
    const gross = normalizeScore((p.scores || [])[holeIdx]);
    if (typeof gross === "number" && gross > 0) {
      sum += gross;
      hasScore = true;
    }
  }
  return hasScore ? sum : null;
}

/**
 * Aggregate net: sum of all members' individual net scores on a hole.
 * Each player's net = gross − strokes from their own course handicap.
 */
function aggregateNet(members, holeIdx, hcpIndexes, formula) {
  let sum = 0;
  let hasScore = false;
  for (const p of members) {
    const gross = normalizeScore((p.scores || [])[holeIdx]);
    if (typeof gross !== "number" || gross <= 0) continue;
    const ch = p.course_handicap != null ? Number(p.course_handicap) : null;
    let hcpVal = ch != null ? ch : (p.is_plus_handicap ? -Math.abs(p.handicap || 0) : Math.abs(p.handicap || 0));
    if (formula === 'combined_85') {
      hcpVal = hcpVal < 0 ? -Math.round(Math.abs(hcpVal) * 0.85) : Math.round(hcpVal * 0.85);
    }
    const strokes = holeStrokes(hcpVal, hcpIndexes[holeIdx] || 0);
    sum += gross - strokes;
    hasScore = true;
  }
  return hasScore ? sum : null;
}

// ─── PAYOUT ASSIGNMENT ──────────────────────────────────────

function assignTeamPayouts(teamResults, placeAmounts, scoreKey, excludeSet) {
  const payouts = {};
  const eligible = teamResults.filter(t => !t.disqualified);
  let placeIdx = 0;
  let i = 0;
  while (i < eligible.length && placeIdx < placeAmounts.length) {
    const currentScore = eligible[i][scoreKey];
    let tied = eligible.filter(t => t[scoreKey] === currentScore);
    // Single-Win Rule: a team excluded from this category is skipped (place cascades)
    if (excludeSet) {
      tied = tied.filter(t => !excludeSet.has(t.team_id));
    }
    if (tied.length === 0) {
      i += eligible.filter(t => t[scoreKey] === currentScore).length;
      continue;
    }
    const placesConsumed = Math.min(tied.length, placeAmounts.length - placeIdx);
    const combinedPrize = placeAmounts.slice(placeIdx, placeIdx + placesConsumed).reduce((a, b) => a + b, 0);
    const share = combinedPrize / tied.length;
    tied.forEach(t => {
      payouts[t.team_id] = (payouts[t.team_id] || 0) + share;
    });
    placeIdx += placesConsumed;
    i += eligible.filter(t => t[scoreKey] === currentScore).length;
  }
  return payouts;
}

/**
 * Single-Win Rule for teams: no team is paid in both gross and net.
 * A team qualifying for both keeps whichever pays MORE; its other-category spot
 * cascades to the next eligible team. Iterates until stable (mirrors the
 * individual applyConflictResolution logic).
 */
export function applyTeamConflictResolution(grossResults, netResults, grossPlaces, netPlaces) {
  const excludeFromGross = new Set();
  const excludeFromNet = new Set();
  const maxPasses = 40;

  for (let pass = 0; pass < maxPasses; pass++) {
    const grossPayouts = assignTeamPayouts(grossResults, grossPlaces, "best_ball_gross", excludeFromGross);
    const netPayouts = assignTeamPayouts(netResults, netPlaces, "best_ball_net", excludeFromNet);

    const overlap = Object.keys(grossPayouts).filter(tid => netPayouts[tid] !== undefined);
    if (overlap.length === 0) {
      return { grossPayouts, netPayouts };
    }

    // Resolve the biggest winner first
    let bestTid = null;
    let bestMaxPay = -1;
    let bestKeepGross = true;
    for (const tid of overlap) {
      const gPay = grossPayouts[tid];
      const nPay = netPayouts[tid];
      const maxPay = Math.max(gPay, nPay);
      if (maxPay > bestMaxPay) {
        bestMaxPay = maxPay;
        bestTid = tid;
        bestKeepGross = gPay >= nPay;
      }
    }
    if (bestTid === null) break;

    if (bestKeepGross) {
      excludeFromNet.add(bestTid);
      excludeFromGross.delete(bestTid);
    } else {
      excludeFromGross.add(bestTid);
      excludeFromNet.delete(bestTid);
    }
  }

  const grossPayouts = assignTeamPayouts(grossResults, grossPlaces, "best_ball_gross", excludeFromGross);
  const netPayouts = assignTeamPayouts(netResults, netPlaces, "best_ball_net", excludeFromNet);
  return { grossPayouts, netPayouts };
}

// ─── MAIN COMPUTE ────────────────────────────────────────────

/**
 * Compute team-based best-ball results and payouts for a round.
 * @param {object} round - Round with players, results (for pot amounts), hcp indexes, etc.
 * @returns {object} { team_gross_results, team_net_results }
 */
export function computeTeamResults(round) {
  const teams = buildTeams(round);
  if (teams.length === 0) {
    return { team_gross_results: [], team_net_results: [] };
  }

  const hcpIndexes = round.hole_handicap_indexes || [];
  const results = round.results || {};
  const grossPot = results.gross_pot || 0;
  const netPot = results.net_pot || 0;
  const numTeams = teams.length;

  // Team gross best-ball
  const teamGrossResults = teams.map(team => {
    const perHole = Array.from({ length: 18 }, (_, h) => isAggregateFormat(round) ? aggregateGross(team.members, h) : bestBallGross(team.members, h));
    const validHoles = perHole.filter(s => s != null);
    const total = validHoles.reduce((a, b) => a + b, 0);
    const disqualified = validHoles.length === 0;
    return {
      team_id: team.team_id,
      team_name: team.team_name,
      members: team.members.map(m => ({ player_id: m.player_id, name: m.name })),
      best_ball_gross: disqualified ? null : total,
      per_hole_gross: perHole,
      gross_payout: 0,
      disqualified,
    };
  }).sort((a, b) => {
    if (a.disqualified && !b.disqualified) return 1;
    if (!a.disqualified && b.disqualified) return -1;
    return (a.best_ball_gross ?? 999) - (b.best_ball_gross ?? 999);
  });

  // Team net best-ball — uses the round's handicap formula for single-team-score
  // formats (scramble/chapman/6-6-6), individual handicaps for best ball.
  const teamNetResults = teams.map(team => {
    const perHole = Array.from({ length: 18 }, (_, h) => computeTeamNetPerHole(team, h, hcpIndexes, round));
    const validHoles = perHole.filter(s => s != null);
    const total = validHoles.reduce((a, b) => a + b, 0);
    const disqualified = validHoles.length === 0;
    return {
      team_id: team.team_id,
      team_name: team.team_name,
      members: team.members.map(m => ({ player_id: m.player_id, name: m.name })),
      best_ball_net: disqualified ? null : total,
      per_hole_net: perHole,
      net_payout: 0,
      disqualified,
    };
  }).sort((a, b) => {
    if (a.disqualified && !b.disqualified) return 1;
    if (!a.disqualified && b.disqualified) return -1;
    return (a.best_ball_net ?? 999) - (b.best_ball_net ?? 999);
  });

  // Payouts — use the SAME per-place dollar amounts the individual engine
  // computed (results.gross_places / results.net_places), so teams are "placed"
  // identically to individuals: 1st/2nd/3rd... each get the same prize value.
  // Fall back to a geometric curve over the pot only if those arrays are absent.
  const grossPlacesFromResults = Array.isArray(results.gross_places) && results.gross_places.length > 0
    ? results.gross_places.slice(0, numTeams)
    : null;
  const netPlacesFromResults = Array.isArray(results.net_places) && results.net_places.length > 0
    ? results.net_places.slice(0, numTeams)
    : null;
  const numGrossPlaces = grossPlacesFromResults
    ? grossPlacesFromResults.length
    : Math.min(round.custom_gross_places || 3, numTeams);
  const numNetPlaces = netPlacesFromResults
    ? netPlacesFromResults.length
    : Math.min(round.custom_net_places || 3, numTeams);
  const grossPlaceAmounts = grossPlacesFromResults || geometricPayouts(numGrossPlaces, grossPot);
  const netPlaceAmounts = netPlacesFromResults || geometricPayouts(numNetPlaces, netPot);

  const { grossPayouts: teamGrossPayouts, netPayouts: teamNetPayouts } =
    applyTeamConflictResolution(teamGrossResults, teamNetResults, grossPlaceAmounts, netPlaceAmounts);

  teamGrossResults.forEach(t => { t.gross_payout = teamGrossPayouts[t.team_id] || 0; });
  teamNetResults.forEach(t => { t.net_payout = teamNetPayouts[t.team_id] || 0; });

  return {
    team_gross_results: teamGrossResults,
    team_net_results: teamNetResults,
  };
}

/**
 * Replace individual gross/net payouts with team-based payouts.
 * Each team member gets an equal share of their team's gross and net payouts.
 * Other payouts (skins, KP, deuce) remain unchanged.
 */
export function applyTeamPayouts(results, teamResults) {
  const playerTeamGross = {};
  const playerTeamNet = {};

  for (const team of teamResults.team_gross_results || []) {
    if (team.gross_payout > 0 && team.members?.length) {
      const share = team.gross_payout / team.members.length;
      for (const m of team.members) {
        playerTeamGross[m.player_id] = share;
      }
    }
  }
  for (const team of teamResults.team_net_results || []) {
    if (team.net_payout > 0 && team.members?.length) {
      const share = team.net_payout / team.members.length;
      for (const m of team.members) {
        playerTeamNet[m.player_id] = share;
      }
    }
  }

  const newPayouts = (results.payouts || []).map(p => {
    const grossPayout = playerTeamGross[p.player_id] || 0;
    const netPayout = playerTeamNet[p.player_id] || 0;
    return {
      ...p,
      gross_payout: grossPayout,
      net_payout: netPayout,
      total_payout: grossPayout + netPayout + (p.kp_payout || 0) + (p.gross_skins_payout || 0) + (p.net_skins_payout || 0) + (p.deuce_payout || 0),
    };
  });

  return { ...results, payouts: newPayouts };
}

// ─── TEAM SKINS ──────────────────────────────────────────────
// When a team game is active, skins are won by the TEAM (lowest unique team
// best-ball score on a hole), not by an individual. The team's skin payout is
// split equally among its members, mirroring how gross/net team payouts work.

function getTeamHoleWinners(teamPerHoleScores) {
  // teamPerHoleScores: array of 18 arrays; each entry { team_id, team_name, members, score }
  return teamPerHoleScores.map((holeScores) => {
    const valid = holeScores.filter((s) => s.score !== "X" && s.score != null);
    if (valid.length === 0) return null;
    const sorted = [...valid].sort((a, b) => a.score - b.score);
    if (sorted.length < 2 || sorted[0].score < sorted[1].score) return sorted[0];
    return null; // tie — no winner
  });
}

function teamSkinsCarryover(holeWinners, totalPot) {
  const perHole = totalPot / 18;
  const skins = [];
  const teamPayouts = {};
  let carryValue = 0;
  let carryoverFrom = [];
  for (let h = 0; h < 18; h++) {
    carryValue += perHole;
    const w = holeWinners[h];
    if (w) {
      skins.push({ hole: h + 1, player_id: w.team_id, team_id: w.team_id, name: w.name, members: w.members, score: w.score, value: carryValue, carryover_from: carryoverFrom.length ? [...carryoverFrom] : [] });
      teamPayouts[w.team_id] = (teamPayouts[w.team_id] || 0) + carryValue;
      carryValue = 0;
      carryoverFrom = [];
    } else {
      carryoverFrom.push(h + 1);
    }
  }
  if (carryValue > 0) {
    for (let h = 0; h < 18; h++) {
      const w = holeWinners[h];
      if (w) {
        const ex = skins.find((s) => s.hole === h + 1);
        if (ex) {
          ex.value += carryValue;
          ex.carryover_from = [...(ex.carryover_from || []), ...carryoverFrom];
          teamPayouts[ex.team_id] = (teamPayouts[ex.team_id] || 0) + carryValue;
        } else {
          skins.push({ hole: h + 1, player_id: w.team_id, team_id: w.team_id, name: w.name, members: w.members, score: w.score, value: carryValue, carryover_from: [...carryoverFrom] });
          teamPayouts[w.team_id] = (teamPayouts[w.team_id] || 0) + carryValue;
        }
        carryValue = 0;
        carryoverFrom = [];
        break;
      }
    }
  }
  return { skins, teamPayouts };
}

function teamSkinsFlat(holeWinners, totalPot) {
  const winners = holeWinners.filter((w) => w);
  const skins = [];
  const teamPayouts = {};
  if (winners.length === 0) return { skins, teamPayouts };
  const perSkin = totalPot / winners.length;
  holeWinners.forEach((w, h) => {
    if (w) {
      skins.push({ hole: h + 1, player_id: w.team_id, team_id: w.team_id, name: w.name, members: w.members, score: w.score, value: perSkin, carryover_from: [] });
      teamPayouts[w.team_id] = (teamPayouts[w.team_id] || 0) + perSkin;
    }
  });
  return { skins, teamPayouts };
}

/**
 * Compute team-based gross and net skins. Each hole is won by the team with
 * the unique lowest best-ball score (gross or net). Returns skin arrays
 * attributed to teams plus per-player payout maps (each member gets an equal
 * share of their team's winnings).
 */
export function computeTeamSkins(round, grossSkinsPot, netSkinsPot) {
  const teams = buildTeams(round);
  const empty = { gross_skins: [], net_skins: [], grossSkinsPlayerPayouts: {}, netSkinsPlayerPayouts: {} };
  if (teams.length === 0) return empty;

  const hcpIndexes = round.hole_handicap_indexes || [];
  const carryover = !!round.skins_carryover;

  const teamEntry = (t, score) => ({
    team_id: t.team_id,
    team_name: t.team_name,
    members: t.members.map((m) => ({ player_id: m.player_id, name: m.name })),
    // Display the members' names (e.g. "Ryan Clark / Bob Smith") rather than
    // the generic "Team K" letter label on skins winner rows.
    name: t.members.map((m) => m.name).join(" / "),
    score: score == null ? "X" : score,
  });

  const grossHoleScores = Array.from({ length: 18 }, (_, h) =>
    teams.map((t) => teamEntry(t, isAggregateFormat(round) ? aggregateGross(t.members, h) : bestBallGross(t.members, h)))
  );
  const netHoleScores = Array.from({ length: 18 }, (_, h) =>
    teams.map((t) => teamEntry(t, computeTeamNetPerHole(t, h, hcpIndexes, round)))
  );

  const grossRes = carryover
    ? teamSkinsCarryover(getTeamHoleWinners(grossHoleScores), grossSkinsPot)
    : teamSkinsFlat(getTeamHoleWinners(grossHoleScores), grossSkinsPot);
  const netRes = carryover
    ? teamSkinsCarryover(getTeamHoleWinners(netHoleScores), netSkinsPot)
    : teamSkinsFlat(getTeamHoleWinners(netHoleScores), netSkinsPot);

  const toPlayerPayouts = (teamPayouts) => {
    const out = {};
    for (const t of teams) {
      const amt = teamPayouts[t.team_id] || 0;
      if (amt > 0 && t.members.length) {
        const share = amt / t.members.length;
        for (const m of t.members) out[m.player_id] = (out[m.player_id] || 0) + share;
      }
    }
    return out;
  };

  return {
    gross_skins: grossRes.skins,
    net_skins: netRes.skins,
    grossSkinsPlayerPayouts: toPlayerPayouts(grossRes.teamPayouts),
    netSkinsPlayerPayouts: toPlayerPayouts(netRes.teamPayouts),
  };
}

/**
 * Split KP and Deuce pot payouts equally among team members when team side
 * games are active. Each team's total KP/deuce winnings are pooled and divided
 * equally among all team members, so a KP won by one player is shared with
 * their teammate — mirroring how team skins and team gross/net payouts work.
 * Returns the updated payouts array.
 */
export function splitTeamSideGamePayouts(round, payouts) {
  const teams = buildTeams(round);
  if (teams.length === 0) return payouts;

  const playerTeamMap = {};
  teams.forEach(t => {
    t.members.forEach(m => {
      playerTeamMap[m.player_id] = t;
    });
  });

  // Pool KP and deuce winnings per team
  const teamKpTotals = {};
  const teamDeuceTotals = {};
  (payouts || []).forEach(p => {
    const team = playerTeamMap[p.player_id];
    if (!team) return;
    teamKpTotals[team.team_id] = (teamKpTotals[team.team_id] || 0) + (p.kp_payout || 0);
    teamDeuceTotals[team.team_id] = (teamDeuceTotals[team.team_id] || 0) + (p.deuce_payout || 0);
  });

  // Split each team's pooled winnings equally among members
  return (payouts || []).map(p => {
    const team = playerTeamMap[p.player_id];
    if (!team || team.members.length === 0) return p;
    const kpShare = (teamKpTotals[team.team_id] || 0) / team.members.length;
    const deuceShare = (teamDeuceTotals[team.team_id] || 0) / team.members.length;
    return {
      ...p,
      kp_payout: kpShare,
      deuce_payout: deuceShare,
      total_payout: (p.gross_payout || 0) + (p.net_payout || 0) + kpShare +
        (p.gross_skins_payout || 0) + (p.net_skins_payout || 0) + deuceShare,
    };
  });
}
/**
 * SWIFT_SCORE_RULES v2.0
 * Deterministic golf scoring and payout engine.
 * Supports SWIFT_SCORE_11, CUSTOM, and OFF modes.
 */

// ─── VALIDATION ──────────────────────────────────────────────
export function validateScorePacket(round) {
  const issues = [];

  if (!round.game_mode || !["SWIFT_SCORE_11", "CUSTOM", "OFF"].includes(round.game_mode)) {
    issues.push("Missing or invalid GameMode. Must be SWIFT_SCORE_11, CUSTOM, or OFF.");
  }

  if (round.buy_in === undefined || round.buy_in === null || typeof round.buy_in !== "number" || round.buy_in < 0) {
    issues.push("BuyIn must be a valid non-negative number.");
  }

  if (!round.player_count || typeof round.player_count !== "number") {
    issues.push("PlayerCount must be a valid number.");
  }

  if (!round.players || round.players.length === 0) {
    issues.push("At least one player must be on the roster.");
  }

  const ids = new Set();
  (round.players || []).forEach((p, i) => {
    if (!p.player_id) issues.push(`Player ${i + 1}: missing player_id.`);
    if (ids.has(p.player_id)) issues.push(`Player ${i + 1}: duplicate player_id "${p.player_id}".`);
    ids.add(p.player_id);

    if (!p.name) issues.push(`Player ${i + 1}: missing name.`);
    if (p.handicap === undefined || p.handicap === null) issues.push(`Player "${p.name || i + 1}": missing handicap.`);
    // A player "has scores" if they have 18 valid entries (empty string or 0 means missing)
    const hasAll18Scores = p.scores && p.scores.length === 18;
    if (hasAll18Scores) {
      // Count valid scores (non-empty, non-zero, or 'X')
      const validCount = p.scores.filter(s => {
        const n = normalizeScore(s);
        return n === 'X' || (typeof n === 'number' && n >= 1);
      }).length;
      const missingCount = 18 - validCount;
      if (validCount < 18) {
        issues.push(`Player "${p.name || i + 1}": ${missingCount} hole(s) missing (has ${validCount}/18 scores).`);
      }
    } else {
      issues.push(`Player "${p.name || i + 1}": must have exactly 18 scores (has ${p.scores?.length || 0}).`);
    }
  });

  const needsNet = round.game_mode === "SWIFT_SCORE_11" || round.net_skins_enabled ||
    (round.game_mode === "CUSTOM" && round.custom_net_field_percent > 0);
  if (needsNet && (!round.hole_handicap_indexes || round.hole_handicap_indexes.length !== 18)) {
    issues.push("Course hole handicap indexes (18) required for net calculations.");
  }

  // CUSTOM mode specific validation
  if (round.game_mode === "CUSTOM") {
    const placeP = round.custom_place_payout_percent || 0;
    const gamesP = round.custom_games_percent || 0;
    if (Math.round((placeP + gamesP) * 100) !== 10000) {
      issues.push(`Place Payout % + Games % must equal 100% (got ${placeP + gamesP}%).`);
    }
  }

  return issues;
}

// ─── HOLE ACHIEVEMENT HELPER ─────────────────────────────────
function getAchievementForDiff(diff) {
  if (diff <= -5) return { type: 'ostrich', display: 'Ostrich' };
  if (diff === -4) return { type: 'condor', display: 'Condor' };
  if (diff === -3) return { type: 'albatross', display: 'Albatross' };
  if (diff === -2) return { type: 'eagle', display: 'Eagle' };
  if (diff === -1) return { type: 'birdie', display: 'Birdie' };
  if (diff === 0) return { type: 'par', display: 'Par' };
  if (diff === 1) return { type: 'bogey', display: 'Bogey' };
  if (diff === 2) return { type: 'double', display: 'Double' };
  return { type: 'triple', display: `+${diff}` };
}

function getHoleAchievements(scores, par) {
  return scores.map((score, i) => {
    const norm = normalizeScore(score);
    if (norm === 'X') return { type: 'DQ', display: 'DQ' };
    return getAchievementForDiff(norm - par[i]);
  });
}

// ─── NET SCORE HELPERS ───────────────────────────────────────
function getPlayerNetScores(player, holeHandicapIndexes, teeSets) {
  // Only use tee-specific data when Auto Handicap Adjustment was ON (course_handicap is non-null).
  // In manual mode (course_handicap is null), tee blocks are ignored entirely.
  const useTeeSets = player.course_handicap != null;
  const playerTeeSet = useTeeSets && teeSets && player.tee_preference
    ? teeSets.find(t => t.name === player.tee_preference)
    : null;
  const effectiveHHI = (playerTeeSet?.hole_handicap_indexes?.length === 18)
    ? playerTeeSet.hole_handicap_indexes
    : holeHandicapIndexes;

  // Use the stored course_handicap directly — it already reflects the correct value for BOTH
  // Auto-Adjust ON (HI × slope/rating conversion, rounded) and Auto-Adjust OFF (raw handicap with
  // sign applied). Re-deriving it here from slope/rating would incorrectly convert a raw manual
  // handicap, ignoring the user's adjustment-mode choice. This matches the ScoreSummary net
  // calculation (total - course_handicap). When course_handicap is null (no slope/rating was
  // available at roster time), fall back to player.handicap with the plus sign applied.
  let storedCH = null;
  if (player.course_handicap != null) {
    storedCH = Number(player.course_handicap);
  } else {
    const h = Number(player.handicap ?? 0);
    storedCH = player.is_plus_handicap ? -Math.abs(h) : Math.abs(h);
  }

  // Determine if plus handicap: trust is_plus_handicap flag, OR if computed/stored course_handicap is negative
  const isPlus = !!player.is_plus_handicap || (storedCH != null && storedCH < 0);
  // Use course_handicap magnitude if available, else raw handicap
  const rawHandicap = storedCH != null ? Math.abs(storedCH) : Math.abs(player.handicap ?? 0);
  const handicap = Math.floor(rawHandicap);
  const strokes = new Array(18).fill(0);

  if (isPlus) {
    // Plus handicap: gives strokes back starting on the EASIEST holes (highest SI first)
    // +1 → SI 18, +2 → SI 17 & 18, +3 → SI 16, 17, 18, etc.
    for (let s = 0; s < handicap; s++) {
      const targetRank = 18 - s; // count DOWN from 18
      const targetHoleIdx = effectiveHHI.findIndex(h => h === targetRank);
      if (targetHoleIdx !== -1) {
        strokes[targetHoleIdx] += 1; // adds a stroke (net = gross + 1, harder)
      }
    }
  } else {
    // Regular handicap: receives strokes starting on the HARDEST holes (lowest SI first)
    for (let s = 0; s < handicap; s++) {
      const targetRank = (s % 18) + 1;
      const targetHoleIdx = effectiveHHI.findIndex(h => h === targetRank);
      if (targetHoleIdx !== -1) {
        strokes[targetHoleIdx] -= 1; // subtracts a stroke (net = gross - 1, easier)
      }
    }
  }

  return player.scores.map((score, i) => {
    const n = normalizeScore(score);
    return n === 'X' ? 'X' : n + strokes[i];
  });
}

// ─── X SCORE DETECTION ───────────────────────────────────────
function hasXScore(player) {
  return player.scores && player.scores.some(s => typeof s === 'string' && s.trim().toUpperCase() === 'X');
}

function normalizeScore(s) {
  if (typeof s === 'string' && s.trim().toUpperCase() === 'X') return 'X';
  return typeof s === 'number' ? s : Number(s);
}

// ─── STABLEFORD ──────────────────────────────────────────────
function getMainGameFormat(round) {
  const games = round.games || [];
  const main = games.find(g => g.is_main) || games[0];
  return main?.format || null;
}

function stablefordPoints(score, parVal) {
  if (score === 'X' || score == null) return 0;
  const n = typeof score === 'number' ? score : Number(score);
  if (isNaN(n)) return 0;
  const diff = n - (parVal || 4);
  if (diff <= -3) return 8;
  if (diff === -2) return 8;
  if (diff === -1) return 5;
  if (diff === 0) return 3;
  if (diff === 1) return 2;
  if (diff === 2) return 1;
  return 0;
}

/**
 * Post-process results for Stableford format: convert stroke totals to points
 * and re-rank descending (highest points = best). Re-runs gross/net payouts
 * using the existing place amounts so money follows points ranking.
 */
function applyStableford(results, round) {
  const par = round.par || [];

  const grossResults = (results.gross_results || []).map(r => {
    if (r.disqualified || r.gross_total == null) return r;
    const player = (round.all_players || round.players || []).find(p => p.player_id === r.player_id);
    if (!player?.scores) return r;
    const points = player.scores.reduce((a, score, i) => a + stablefordPoints(normalizeScore(score), par[i] || 4), 0);
    return { ...r, gross_total: points };
  }).sort((a, b) => {
    if (a.disqualified && !b.disqualified) return 1;
    if (!a.disqualified && b.disqualified) return -1;
    const diff = (b.gross_total ?? -1) - (a.gross_total ?? -1);
    return diff !== 0 ? diff : a.name.localeCompare(b.name);
  });

  const netResults = (results.net_results || []).map(r => {
    if (r.disqualified || r.net_total == null) return r;
    const netScores = r.net_scores;
    if (!netScores || netScores.length === 0) return r;
    const points = netScores.reduce((a, score, i) => a + (score === 'X' ? 0 : stablefordPoints(score, par[i] || 4)), 0);
    return { ...r, net_total: points };
  }).sort((a, b) => {
    if (a.disqualified && !b.disqualified) return 1;
    if (!a.disqualified && b.disqualified) return -1;
    const diff = (b.net_total ?? -1) - (a.net_total ?? -1);
    return diff !== 0 ? diff : a.name.localeCompare(b.name);
  });

  const newResults = { ...results, gross_results: grossResults, net_results: netResults, stableford: true };

  // Re-run gross/net payouts with descending (highest points = best) ranking
  const grossPlaces = results.gross_places || [];
  const netPlaces = results.net_places || [];
  if (grossPlaces.length > 0 || netPlaces.length > 0) {
    const eligibleGross = grossResults.filter(r => !r.disqualified);
    const eligibleNet = netResults.filter(r => !r.disqualified);
    const rawGross = assignPlacePayouts(eligibleGross, grossPlaces, "gross_total", {});
    const rawNet = assignPlacePayouts(eligibleNet, netPlaces, "net_total", {});
    const { grossPayouts, netPayouts } = applyConflictResolution(
      rawGross, rawNet, eligibleGross, eligibleNet, grossPlaces, netPlaces, true
    );
    const payoutList = (results.payouts || []).map(p => {
      const gp = grossPayouts[p.player_id] || 0;
      const np = netPayouts[p.player_id] || 0;
      return {
        ...p,
        gross_payout: gp,
        net_payout: np,
        total_payout: gp + np + (p.kp_payout || 0) + (p.gross_skins_payout || 0) + (p.net_skins_payout || 0) + (p.deuce_payout || 0),
      };
    });
    newResults.payouts = payoutList.sort((a, b) => b.total_payout - a.total_payout);
  }

  return newResults;
}

// ─── SKINS HELPERS ───────────────────────────────────────────

/** Returns per-hole winner info (or null if tied). Excludes X scores. Players with X can still participate. */
function getHoleWinners(holeScoresList, allPlayersCanWin = false) {
  // holeScoresList: array of {player_id, name, score} for each of 18 holes
  // allPlayersCanWin: if true, disqualified players (with any X) can still win skins
  return holeScoresList.map((holeScores, holeIdx) => {
    // Filter out X scores from consideration on this specific hole
    const validScores = holeScores.filter(s => s.score !== "X");
    if (validScores.length === 0) return null; // All players have X on this hole
    
    const sorted = [...validScores].sort((a, b) => a.score - b.score);
    if (sorted.length < 2 || sorted[0].score < sorted[1].score) {
      return sorted[0]; // unique lowest = winner
    }
    return null; // tie
  });
}

/** Build per-hole score list for gross skins. Only includes players in the skins pool if separate buy-in is active. */
function grossHoleScores(round) {
  if (round.gross_skins_separate_buy_in) {
    // Separate buy-in: only selected players compete. Empty list = all players.
    const poolIds = round.gross_skins_player_ids || [];
    const players = poolIds.length > 0
      ? round.players.filter(p => poolIds.includes(p.player_id))
      : round.players;
    return Array.from({ length: 18 }, (_, h) =>
      players.map(p => ({ player_id: p.player_id, name: p.name, score: normalizeScore(p.scores[h]) }))
    );
  }
  // Shared pot: all players compete
  return Array.from({ length: 18 }, (_, h) =>
    round.players.map(p => ({ player_id: p.player_id, name: p.name, score: normalizeScore(p.scores[h]) }))
  );
}

/** Build per-hole score list for net skins. Only includes players in the skins pool if separate buy-in is active. */
function netHoleScores(round) {
  if (round.net_skins_separate_buy_in) {
    const poolIds = round.net_skins_player_ids || [];
    const players = poolIds.length > 0
      ? round.players.filter(p => poolIds.includes(p.player_id))
      : round.players;
    const allNet = {};
    players.forEach(p => { allNet[p.player_id] = getPlayerNetScores(p, round.hole_handicap_indexes, round.course_tee_sets); });
    return Array.from({ length: 18 }, (_, h) =>
      players.map(p => ({ player_id: p.player_id, name: p.name, score: allNet[p.player_id][h] }))
    );
  }
  // Shared pot: all players compete
  const allNet = {};
  round.players.forEach(p => { allNet[p.player_id] = getPlayerNetScores(p, round.hole_handicap_indexes, round.course_tee_sets); });
  return Array.from({ length: 18 }, (_, h) =>
    round.players.map(p => ({ player_id: p.player_id, name: p.name, score: allNet[p.player_id][h] }))
  );
}

/** Build net achievements map: player_id -> array of 18 achievement objects based on net scores vs par */
function getNetAchievements(round) {
  const result = {};
  round.players.forEach(p => {
    const netScores = getPlayerNetScores(p, round.hole_handicap_indexes, round.course_tee_sets);
    result[p.player_id] = netScores.map((score, i) => {
      if (score === 'X') return { type: 'DQ', display: 'DQ' };
      return getAchievementForDiff(score - round.par[i]);
    });
  });
  return result;
}

/**
 * Compute skins WITH carryover VALUE accumulation.
 * Pot is divided equally across 18 holes. Tied holes carry their value to the next winner.
 * After hole 18, any remaining carryover wraps back to hole 1.
 * Returns { skins, payouts }
 */
function computeSkinsWithCarryover(holeWinners, totalPot, achievements) {
  const perHole = totalPot / 18;
  const skins = [];
  const payouts = {};

  let carryValue = 0;
  let carryoverFrom = []; // track which holes carried

  // First pass: holes 1–18
  for (let h = 0; h < 18; h++) {
    carryValue += perHole;
    const winner = holeWinners[h];
    if (winner) {
      const holeAchievements = achievements?.[winner.player_id]?.[h];
      skins.push({ 
        hole: h + 1, 
        player_id: winner.player_id, 
        name: winner.name, 
        score: winner.score, 
        value: carryValue,
        carryover_from: carryoverFrom.length > 0 ? [...carryoverFrom] : [],
        achievement: holeAchievements?.display
      });
      payouts[winner.player_id] = (payouts[winner.player_id] || 0) + carryValue;
      carryValue = 0;
      carryoverFrom = [];
    } else {
      carryoverFrom.push(h + 1);
    }
  }

  // Wraparound: find the first hole (1–18) that has a unique winner
  if (carryValue > 0) {
    for (let h = 0; h < 18; h++) {
      const winner = holeWinners[h];
      if (winner) {
        const existingSkin = skins.find(s => s.hole === h + 1);
        const holeAchievements = achievements?.[winner.player_id]?.[h];
        if (existingSkin) {
          existingSkin.value += carryValue;
          existingSkin.carryover_from = [...(existingSkin.carryover_from || []), ...carryoverFrom];
          payouts[existingSkin.player_id] = (payouts[existingSkin.player_id] || 0) + carryValue;
        } else {
          skins.push({
            hole: h + 1,
            player_id: winner.player_id,
            name: winner.name,
            score: winner.score,
            value: carryValue,
            carryover_from: [...carryoverFrom],
            achievement: holeAchievements?.display
          });
          payouts[winner.player_id] = (payouts[winner.player_id] || 0) + carryValue;
        }
        carryValue = 0;
        carryoverFrom = [];
        break;
      }
    }
  }

  return { skins, payouts };
}

/**
 * Compute skins WITH carryover tracking but FLAT per-hole payout.
 * Always pays perHole, but tracks which holes were tied for informational purposes.
 * Returns { skins, payouts }
 */
function computeSkinsWithCarryoverFlat(holeWinners, totalPot, achievements) {
  const perHole = totalPot / 18;
  const skins = [];
  const payouts = {};
  let carryoverValue = 0;
  let carryoverFrom = []; // track which holes carried

  for (let h = 0; h < 18; h++) {
    carryoverValue += perHole;
    const winner = holeWinners[h];
    if (winner) {
      const holeAchievements = achievements?.[winner.player_id]?.[h];
      skins.push({ 
        hole: h + 1, 
        player_id: winner.player_id, 
        name: winner.name, 
        score: winner.score, 
        value: carryoverValue,
        carryover_from: carryoverFrom.length > 0 ? [...carryoverFrom] : [],
        achievement: holeAchievements?.display
      });
      payouts[winner.player_id] = (payouts[winner.player_id] || 0) + carryoverValue;
      carryoverValue = 0;
      carryoverFrom = [];
    } else {
      carryoverFrom.push(h + 1);
    }
  }

  return { skins, payouts };
}

/**
 * Main skins dispatcher. Returns { skins, payouts, skinsWon (count) }.
 */
function computeSkins(holeScoreList, totalPot, carryover, achievements) {
  const holeWinners = getHoleWinners(holeScoreList);
  if (carryover) {
    const { skins, payouts } = computeSkinsWithCarryover(holeWinners, totalPot, achievements);
    const skinsWon = skins.reduce((total, skin) => total + 1 + (skin.carryover_from?.length || 0), 0);
    return { skins, payouts, skinsWon };
  } else {
    const { skins, payouts } = computeSkinsWithoutCarryover(holeWinners, totalPot, achievements);
    return { skins, payouts, skinsWon: skins.length };
  }
}

/**
 * Skins with flat per-hole payout (for gross skins).
 * For carryover mode, pays flat $X per hole but tracks carry history.
 */
function computeSkinsFlat(holeScoreList, totalPot, carryover, achievements) {
  const holeWinners = getHoleWinners(holeScoreList);
  if (carryover) {
    const { skins, payouts } = computeSkinsWithCarryoverFlat(holeWinners, totalPot, achievements);
    const skinsWon = skins.reduce((total, skin) => total + 1 + (skin.carryover_from?.length || 0), 0);
    return { skins, payouts, skinsWon };
  } else {
    const { skins, payouts } = computeSkinsWithoutCarryover(holeWinners, totalPot, achievements);
    return { skins, payouts, skinsWon: skins.length };
  }
}

// ─── KP / DEUCE HELPERS ──────────────────────────────────────

/**
 * Compute KP payouts for separate-buy-in KP pools.
 * Total pot is divided evenly among the designated KP holes.
 * Only holes with winners receive payout; unclaimed holes' shares are forfeited.
 * kpPoolAmount: total pool for KPs.
 */
function computeKPs(round, kpPoolAmount) {
  const kpResults = [];
  const kpPayouts = {};
  let perKpAmount = 0;
  if (round.kps_enabled && round.kp_winners?.length > 0) {
    // Filter out empty KP entries
    const validKpWinners = (round.kp_winners || []).filter(kp => kp.player_id);
    if (validKpWinners.length > 0) {
      // Calculate exact per-KP amount and round it once
      perKpAmount = kpPoolAmount / validKpWinners.length;
      
      // Each KP entry gets exactly the same amount
      validKpWinners.forEach(kp => {
        kpResults.push(kp);
        kpPayouts[kp.player_id] = (kpPayouts[kp.player_id] || 0) + perKpAmount;
      });
    }
  }
  return { kpResults, kpPayouts, perKpAmount };
}

function computeDeuces(round) {
  const deuces = [];
  const deucePayouts = {};
  const deuceBuyIn = round.deuce_buy_in || 5;
  let deucePot = 0;
  let perDeuceAmount = 0;
  
  if (round.deuce_pot_enabled) {
    // For deuce detection: only players with complete scores
    const deucePlayers = round.deuce_player_ids?.length > 0
      ? round.players.filter(p => round.deuce_player_ids.includes(p.player_id))
      : round.players;
    // For pot calculation: ALL signed-up players (including those without complete scores — they still paid in)
    const allPlayers = round.all_players || round.players;
    const deuceSignupPlayers = round.deuce_player_ids?.length > 0
      ? allPlayers.filter(p => round.deuce_player_ids.includes(p.player_id))
      : allPlayers;
    deucePlayers.forEach(p => {
      p.scores.forEach((score, h) => {
        const normalizedScore = normalizeScore(score);
        if (typeof normalizedScore === 'number' && normalizedScore <= 2) {
          deuces.push({ hole: h + 1, player_id: p.player_id, name: p.name });
        }
      });
    });
    // Pot based on signup count (not filtered count) — players who paid in still contribute even without complete scores
    deucePot = deuceBuyIn * deuceSignupPlayers.length;
    if (deuces.length > 0) {
      perDeuceAmount = deucePot / deuces.length;
      deuces.forEach(d => {
        deucePayouts[d.player_id] = (deucePayouts[d.player_id] || 0) + perDeuceAmount;
      });
    }
  }
  
  return { deuces, deucePayouts, deucePot, perDeuceAmount };
}

// ─── LARGEST REMAINDER ROUNDING ──────────────────────────────
/**
 * Round values to integers that sum to target using largest remainder method.
 * @param {number[]} values - Raw fractional values
 * @param {number} target - Target sum (integer)
 * @param {number[]} [priorityOrder] - Optional array of indices in priority order (higher priority gets rounded up first)
 */
export function largestRemainderRound(values, target, priorityOrder) {
  const floored = values.map(v => Math.floor(v));
  const remainders = values.map((v, i) => ({ i, frac: v - floored[i] }));
  const floorSum = floored.reduce((a, b) => a + b, 0);
  const extra = target - floorSum;
  
  // Sort by remainder, but if priorityOrder is provided, use it as tiebreaker
  remainders.sort((a, b) => {
    const fracDiff = b.frac - a.frac;
    if (fracDiff !== 0) return fracDiff;
    // If remainders are equal, higher priority (lower index in priorityOrder) wins
    if (priorityOrder) {
      const aPriority = priorityOrder.indexOf(a.i);
      const bPriority = priorityOrder.indexOf(b.i);
      if (aPriority !== -1 && bPriority !== -1) return aPriority - bPriority;
      if (aPriority !== -1) return -1;
      if (bPriority !== -1) return 1;
    }
    return 0;
  });
  
  const result = [...floored];
  remainders.forEach((r, rank) => {
    if (rank < extra) result[r.i] += 1;
  });
  return result;
}

// ─── SWIFT_SCORE_11 PAYOUT TABLE ────────────────────────────
const SWIFT_11_PAYOUTS = {
  6:  [8,4,3],
  7:  [9,6,3],
  8:  [10,6,4,10,6,4],
  9:  [11,8,4],
  10: [12,8,5],
  11: [13,10,5],
  12: [14,10,6],
  13: [15,9,5,3],
  14: [16,10,5,4],
  15: [17,10,6,4],
  16: [18,11,6,5],
  17: [19,11,7,5],
  18: [20,12,7,6],
  19: [22,12,8,6],
  20: [22,13,8,7],
  21: [23,13,9,7],
  22: [24,14,10,7],
  23: [25,14,10,7],
  24: [26,16,10,8],
  25: [26,15,10,6,5],
  26: [28,15,10,7,5],
  27: [28,16,11,7,5],
  28: [29,16,11,7,6],
  29: [29,17,12,8,6],
  30: [30,17,12,9,7],
  31: [30,18,13,9,7],
  32: [31,18,13,10,8],
  33: [31,19,14,10,8],
  34: [32,19,14,11,9],
  35: [32,20,15,11,9],
  36: [33,20,15,12,10],
  37: [33,21,16,12,10],
  38: [34,21,16,13,11],
  39: [34,22,17,13,11],
  40: [35,22,17,14,12],
  41: [35,23,18,14,12],
  42: [35,23,18,15,13],
  43: [36,24,19,15,13],
  44: [37,24,19,16,14],
  45: [37,25,20,16,14],
  46: [38,25,21,17,15],
  47: [38,26,21,17,15],
  48: [39,26,22,17,16],
  49: [39,27,22,18,16],
  50: [40,27,22,18,17,12],
  51: [41,28,23,18,17,13],
  52: [41,28,23,19,18,13],
  53: [42,29,24,19,18,14],
  54: [42,29,24,20,19,14],
  55: [43,30,25,20,19,14],
  56: [43,30,25,21,20,15],
  57: [43,31,26,21,20,15],
  58: [44,31,26,22,21,15],
  59: [44,32,27,22,21,16],
  60: [45,32,27,23,22,16],
  61: [45,33,28,23,22,16],
  62: [46,33,28,24,23,17],
  63: [46,34,29,24,23,17],
  64: [47,34,29,25,24,18],
  65: [47,35,30,25,24,18,12],
  66: [48,35,30,26,25,18,13],
  67: [48,36,31,26,25,19,13],
  68: [49,36,31,27,26,19,14],
  69: [49,37,32,27,26,19,14],
  70: [50,37,32,28,27,20,15],
};

function splitGrossNet(payouts) {
  // The table defines payout amounts for BOTH gross and net independently.
  // For 8 players the table stores gross+net concatenated [10,6,4,10,6,4] — always split at midpoint.
  // For all other counts the same descending list applies to both gross and net.
  if (!payouts) {
    return { grossPlaces: [], netPlaces: [] };
  }
  // 8-player table has exactly 6 entries (3 gross + 3 net) — always split at midpoint for even-length arrays
  // where the raw table entry for that player count is known to be concatenated gross+net.
  // We detect this by checking if the player count maps to a known concatenated entry (length 6 = 8 players).
  if (payouts.length === 6) {
    const mid = 3;
    return { grossPlaces: payouts.slice(0, mid), netPlaces: payouts.slice(mid) };
  }
  return { grossPlaces: payouts, netPlaces: payouts };
}

// ─── PLACE PAYOUT HELPERS ────────────────────────────────────
// NOTE: assignPlacePayouts is only used for the initial raw pass.
// The authoritative conflict-resolution logic lives in recalculateWithExclusions.
export function assignPlacePayouts(sortedResults, placeAmounts, scoreKey, existingPayouts = {}) {
  const log = window.__debugLogs ? (msg) => window.__debugLogs.push(msg) : () => {};
  const payouts = {};
  let placeIdx = 0;
  let sorted = [...sortedResults];
  log(`assignPlacePayouts: ${sorted.length} players, ${sorted.map(r => r.name).join(', ')}, places: [${placeAmounts.join(', ')}]`);
  
  while (placeIdx < placeAmounts.length && sorted.length > 0) {
    const currentScore = sorted[0][scoreKey];
    const tied = sorted.filter(r => r[scoreKey] === currentScore);
    
    const eligibleTied = tied.filter(p => !existingPayouts[p.player_id] || existingPayouts[p.player_id] === 0);
    const excludedTied = tied.filter(p => existingPayouts[p.player_id] && existingPayouts[p.player_id] > 0);
    
    if (eligibleTied.length === 0) {
      // All players at this score already have payouts from the other category — skip, don't consume place slots
      sorted = sorted.filter(r => r[scoreKey] !== currentScore);
      continue;
    }
    
    // Tied group of N eligible players consumes N consecutive place slots, combining their money
    const placesConsumed = Math.min(eligibleTied.length, placeAmounts.length - placeIdx);
    const combinedPrize = placeAmounts.slice(placeIdx, placeIdx + placesConsumed).reduce((a, b) => a + b, 0);
    const share = combinedPrize / eligibleTied.length;
    
    log(`  Place ${placeIdx + 1}–${placeIdx + placesConsumed}: ${eligibleTied.map(r => r.name).join(', ')} share $${combinedPrize.toFixed(2)} = $${share.toFixed(2)} each`);
    if (excludedTied.length > 0) {
      log(`    (${excludedTied.map(r => r.name).join(', ')} excluded due to other category wins)`);
    }
    
    eligibleTied.forEach(p => {
      payouts[p.player_id] = (payouts[p.player_id] || 0) + share;
    });
    
    placeIdx += placesConsumed;
    sorted = sorted.filter(r => r[scoreKey] !== currentScore);
  }
  
  return payouts;
}

/**
 * Apply the Single-Win Rule: no player paid in both gross and net.
 *
 * HIGHER-PAY RULE: A player who qualifies for both gross and net is assigned
 * to whichever pays MORE. Their other spot cascades to the next eligible player.
 *
 * Algorithm (iterative until stable):
 * 1. Compute gross payouts (with current gross exclusions).
 * 2. Compute net payouts (excluding current gross winners).
 * 3. Find overlapping players (appear in both).
 * 4. For each overlap: if gross pays more → exclude from net; if net pays more → exclude from gross.
 * 5. Repeat until stable.
 */
export function applyConflictResolution(rawGrossPayouts, rawNetPayouts, grossSortedResults, netSortedResults, grossPlaces, netPlaces, descending = false) {
  console.log('=== SINGLE-WIN RULE: HIGHER-PAY WINS ===');

  const excludeFromGross = new Set();
  const excludeFromNet = new Set();
  const maxPasses = 40;

  for (let pass = 0; pass < maxPasses; pass++) {
    // Always recalculate fresh after every exclusion change
    const grossPayouts = recalculateWithExclusions(grossSortedResults, grossPlaces, "gross_total", excludeFromGross, descending);
    const netPayouts = recalculateWithExclusions(netSortedResults, netPlaces, "net_total", excludeFromNet, descending);

    const overlap = Object.keys(grossPayouts).filter(pid => netPayouts[pid] !== undefined);

    if (overlap.length === 0) {
      console.log(`✓ Stable after ${pass + 1} pass(es).`);
      return { grossPayouts, netPayouts };
    }

    // Pick ONE player to resolve per pass.
    // Priority: highest gross payout first (the "biggest winner" creates the most cascading).
    // Tiebreaker: if gross == net, keep gross (standard rule).
    let bestPid = null;
    let bestMaxPay = -1;
    let bestKeepGross = true;

    for (const pid of overlap) {
      const gPay = grossPayouts[pid];
      const nPay = netPayouts[pid];
      const maxPay = Math.max(gPay, nPay);
      if (maxPay > bestMaxPay) {
        bestMaxPay = maxPay;
        bestPid = pid;
        bestKeepGross = gPay >= nPay;
      }
    }

    if (bestPid === null) break;

    const name = grossSortedResults.find(r => r.player_id === bestPid)?.name || bestPid;
    const gPay = grossPayouts[bestPid];
    const nPay = netPayouts[bestPid];

    if (bestKeepGross) {
      console.log(`  ${name}: gross $${gPay.toFixed(2)} >= net $${nPay.toFixed(2)} → keeps GROSS, excluded from net`);
      excludeFromNet.add(bestPid);
      excludeFromGross.delete(bestPid);
    } else {
      console.log(`  ${name}: net $${nPay.toFixed(2)} > gross $${gPay.toFixed(2)} → keeps NET, excluded from gross`);
      excludeFromGross.add(bestPid);
      excludeFromNet.delete(bestPid);
    }
    // Loop continues — recalculates everything fresh next pass
  }

  // Final calculation
  const grossPayouts = recalculateWithExclusions(grossSortedResults, grossPlaces, "gross_total", excludeFromGross, descending);
  const netPayouts = recalculateWithExclusions(netSortedResults, netPlaces, "net_total", excludeFromNet, descending);
  return { grossPayouts, netPayouts };
}

/**
 * Recalculate payouts excluding specific players, rebuilding tied groups from scratch.
 *
 * TIE RULE: A tied group of N players shares the combined money from the N consecutive
 * place slots they collectively occupy. E.g. a 2-way tie for 2nd consumes 2nd+3rd money
 * split equally between the 2 tied players. This is standard golf tournament tie handling.
 *
 * STEP 1: Build tied groups by score
 * STEP 2: Filter out excluded players from each group
 * STEP 3: Each remaining group takes as many consecutive place buckets as it has players,
 *         combines them, and splits equally
 */
function recalculateWithExclusions(sortedResults, places, scoreKey, excludeSet, descending = false) {
  const log = window.__debugLogs ? (msg) => window.__debugLogs.push(msg) : () => {};

  // STEP 1: Build tied groups (score -> [players with that score])
  const tiedGroups = {};
  sortedResults.forEach(p => {
    const score = p[scoreKey];
    if (!tiedGroups[score]) tiedGroups[score] = [];
    tiedGroups[score].push(p);
  });

  const uniqueScores = Object.keys(tiedGroups).map(Number).sort((a, b) => descending ? b - a : a - b);

  log(`recalculateWithExclusions: Tie groups: ${uniqueScores.map(s => {
    const remaining = tiedGroups[s].filter(p => !excludeSet.has(p.player_id)).map(p => p.name).join(',');
    return `[${s}]: remaining=[${remaining}]`;
  }).join(' | ')}`);

  const payouts = {};
  let placeIdx = 0;

  for (const score of uniqueScores) {
    if (placeIdx >= places.length) break;

    const groupNonExcluded = tiedGroups[score].filter(p => !excludeSet.has(p.player_id));
    if (groupNonExcluded.length === 0) {
      log(`  Score ${score}: All excluded, skipping (place ${placeIdx + 1} cascades to next eligible group)`);
      // DO NOT advance placeIdx — the place slot cascades to the next eligible group
      continue;
    }

    // Tied group of N remaining players consumes N consecutive place slots, combining their money
    const placesConsumed = Math.min(groupNonExcluded.length, places.length - placeIdx);
    const combinedPrize = places.slice(placeIdx, placeIdx + placesConsumed).reduce((a, b) => a + b, 0);
    const share = combinedPrize / groupNonExcluded.length;

    log(`  Score ${score}: ${groupNonExcluded.map(p => p.name).join(', ')} share places ${placeIdx + 1}–${placeIdx + placesConsumed} ($${combinedPrize.toFixed(2)}) = $${share.toFixed(2)} each`);

    groupNonExcluded.forEach(p => {
      payouts[p.player_id] = (payouts[p.player_id] || 0) + share;
    });

    placeIdx += placesConsumed;
  }

  return payouts;
}

// ─── 0.75 GEOMETRIC PAYOUT CURVE ────────────────────────────
export function geometricPayouts(numPlaces, pot) {
  if (numPlaces <= 0 || pot <= 0) return [];
  const weights = Array.from({ length: numPlaces }, (_, i) => Math.pow(0.75, i));
  const weightSum = weights.reduce((a, b) => a + b, 0);
  const result = weights.map(w => (w / weightSum) * pot);
  console.log('geometricPayouts:', { numPlaces, pot, weights, weightSum, result });
  return result;
}

// ─── SHARED SKINS + KP COMPUTE ───────────────────────────────
/**
 * Compute gross skins with optional KP shares folded in.
 * When KP has no separate buy-in, its pool = kp_buy_in * player_count, divided by KP hole count.
 * Remaining pot goes to skins.
 * Returns { skins, payouts, skinsWon, kpResults, kpPayouts }
 */
function computeGrossSkinsWithKP(round, grossSkinsPot, carryover) {
  const holeScores = grossHoleScores(round);
  const holeWinners = getHoleWinners(holeScores);
  // SWIFT_SCORE_11 always integrates KP into skins; other modes respect the flag
  const shouldIncludeKP = round.game_mode === 'SWIFT_SCORE_11' || round.game_mode === 'CUSTOM' || round.kp_counts_as_skin;
  const kpWinners = (round.kps_enabled && !round.kp_separate_buy_in && shouldIncludeKP) 
    ? (round.kp_winners || []).filter(kp => kp.player_id) 
    : [];

  // If no gross skin winners but KPs exist, give entire pot to KP winners
  if (holeWinners.filter(h => h).length === 0 && kpWinners.length > 0 && grossSkinsPot > 0) {
    const perKP = grossSkinsPot / kpWinners.length;
    const kpPayouts = {};
    kpWinners.forEach(kp => {
      kpPayouts[kp.player_id] = (kpPayouts[kp.player_id] || 0) + perKP;
    });
    return {
      skins: [],
      payouts: {},
      skinsWon: 0,
      kpResults: kpWinners,
      kpPayouts,
    };
  }

  // If no winners at all (no skins, no KPs)
  if (holeWinners.filter(h => h).length === 0 && kpWinners.length === 0) {
    return {
      skins: [],
      payouts: {},
      skinsWon: 0,
      kpResults: [],
      kpPayouts: {},
    };
  } else if (grossSkinsPot === 0) {
    // Pot is zero — still compute skins (value $0) so winners are visible
    const achievements = Object.fromEntries(
      round.players.map(p => [p.player_id, getHoleAchievements(p.scores, round.par)])
    );
    const { skins, payouts: skinPayoutTotals } = computeSkins(holeScores, 0, carryover, achievements);
    return {
      skins: skins.map(s => ({ ...s, value: 0 })),
      payouts: {},
      skinsWon: skins.length,
      kpResults: kpWinners,
      kpPayouts: kpWinners.length > 0 ? Object.fromEntries(kpWinners.map(kp => [kp.player_id, 0])) : {},
    };
  } else {
    // Both skins and KPs: compute skins with optional carryover, divide total pot equally among units
    const achievements = Object.fromEntries(
      round.players.map(p => [p.player_id, getHoleAchievements(p.scores, round.par)])
    );
    const { skins, payouts: skinPayoutTotals } = computeSkins(holeScores, grossSkinsPot, carryover, achievements);
    
    // When carryover is enabled: divide by 18 holes + KP count. Otherwise: divide by actual skin winners + KP count
    const totalWinnerUnits = carryover ? (18 + kpWinners.length) : (skins.length + kpWinners.length);
    const perUnit = totalWinnerUnits > 0 ? grossSkinsPot / totalWinnerUnits : 0;
    
    // Each skins player gets perUnit for each skin they won
    const payouts = {};
    skins.forEach(s => {
      const numSkinsWon = 1 + (s.carryover_from?.length || 0);
      const totalValue = perUnit * numSkinsWon;
      payouts[s.player_id] = (payouts[s.player_id] || 0) + totalValue;
    });
    
    // Update skins display values: multiply perUnit by number of skins won
    const updatedSkins = skins.map(s => {
      const numSkinsWon = 1 + (s.carryover_from?.length || 0);
      return { ...s, value: perUnit * numSkinsWon };
    });
    
    // KP payouts: each KP winner gets perUnit
    const kpPayouts = {};
    kpWinners.forEach(kp => {
      kpPayouts[kp.player_id] = (kpPayouts[kp.player_id] || 0) + perUnit;
    });
    
    return {
      skins: updatedSkins,
      payouts,
      skinsWon: updatedSkins.length,
      kpResults: kpWinners,
      kpPayouts,
    };
  }
}

/**
 * Compute net skins with KP winners folded in as extra winner units.
 * KPs and skins share the pot equally per winner unit.
 */
function computeNetSkinsWithKP(round, netSkinsPot, carryover) {
  const holeScores = netHoleScores(round);
  const holeWinners = getHoleWinners(holeScores);
  const kpWinners = (round.kps_enabled && !round.kp_separate_buy_in)
    ? (round.kp_winners || []).filter(kp => kp.player_id)
    : [];

  // If no net skin winners but KPs exist, give entire pot to KP winners
  if (holeWinners.filter(h => h).length === 0 && kpWinners.length > 0 && netSkinsPot > 0) {
    const perKP = netSkinsPot / kpWinners.length;
    const kpPayouts = {};
    kpWinners.forEach(kp => {
      kpPayouts[kp.player_id] = (kpPayouts[kp.player_id] || 0) + perKP;
    });
    return {
      skins: [],
      payouts: {},
      skinsWon: 0,
      kpResults: kpWinners,
      kpPayouts,
    };
  }

  // If no winners at all (no skins, no KPs)
  if (holeWinners.filter(h => h).length === 0 && kpWinners.length === 0) {
    return {
      skins: [],
      payouts: {},
      skinsWon: 0,
      kpResults: [],
      kpPayouts: {},
    };
  } else if (netSkinsPot === 0) {
    // Pot is zero — still compute skins (value $0) so winners are visible
    const achievements = getNetAchievements(round);
    const { skins, payouts: skinPayoutTotals } = computeSkins(holeScores, 0, carryover, achievements);
    return {
      skins: skins.map(s => ({ ...s, value: 0 })),
      payouts: {},
      skinsWon: skins.length,
      kpResults: kpWinners,
      kpPayouts: kpWinners.length > 0 ? Object.fromEntries(kpWinners.map(kp => [kp.player_id, 0])) : {},
    };
  } else {
    // Both skins and KPs: compute skins with optional carryover, divide pot equally among units
    const achievements = getNetAchievements(round);
    const { skins, payouts: skinPayoutTotals } = computeSkins(holeScores, netSkinsPot, carryover, achievements);
    
    // When carryover is enabled: divide by 18 holes + KP count. Otherwise: divide by actual skin winners + KP count
    const totalWinnerUnits = carryover ? (18 + kpWinners.length) : (skins.length + kpWinners.length);
    const perUnit = totalWinnerUnits > 0 ? netSkinsPot / totalWinnerUnits : 0;
    
    // Each skins player gets perUnit for each skin they won
    const payouts = {};
    skins.forEach(s => {
      const numSkinsWon = 1 + (s.carryover_from?.length || 0);
      const totalValue = perUnit * numSkinsWon;
      payouts[s.player_id] = (payouts[s.player_id] || 0) + totalValue;
    });

    // KP payouts: each KP winner gets perUnit
    const kpPayouts = {};
    kpWinners.forEach(kp => {
      kpPayouts[kp.player_id] = (kpPayouts[kp.player_id] || 0) + perUnit;
    });
    
    // Update skins display values: multiply perUnit by number of skins won
    const updatedSkins = skins.map(s => {
      const numSkinsWon = 1 + (s.carryover_from?.length || 0);
      return { ...s, value: perUnit * numSkinsWon };
    });
    
    return {
      skins: updatedSkins,
      payouts,
      skinsWon: updatedSkins.length,
      kpResults: kpWinners,
      kpPayouts,
    };
  }
}

// ─── SWIFT_SCORE_11 ENGINE ───────────────────────────────────
function computeSwiftScore11(round) {
  // Use the full signup roster (all_players) for pot calculation — players who withdrew
  // mid-round still paid their buy-in, so the pot must include them. round.players is the
  // filtered list (only those with complete scores) and would undercount the pot.
  const signupCount = (round.all_players || round.players).length;
  const totalPot = round.buy_in * signupCount;
  const rawPayouts = SWIFT_11_PAYOUTS[signupCount];

  if (!rawPayouts) {
    throw new Error(`No payout table for ${round.player_count} players. Supported range: 6–70.`);
  }

  // Scale payouts based on actual buy-in ($11 is the base), rounded to whole dollars.
  // For 8-player (6-entry concatenated table), split BEFORE scaling so each half is rounded independently,
  // ensuring gross and net place amounts are always symmetric.
  const scaleFactor = round.buy_in / 11;
  const { grossPlaces: rawGross, netPlaces: rawNet } = splitGrossNet(rawPayouts);

  const scaleHalf = (half) => {
    const scaled = half.map(p => p * scaleFactor);
    const floored = scaled.map(v => Math.floor(v));
    const floorSum = floored.reduce((a, b) => a + b, 0);
    const extra = Math.round(scaled.reduce((a, b) => a + b, 0)) - floorSum;
    const remainders = scaled.map((v, i) => ({ i, frac: v - Math.floor(v) })).sort((a, b) => b.frac - a.frac);
    const result = [...floored];
    remainders.forEach((r, rank) => { if (rank < extra) result[r.i] += 1; });
    return result;
  };

  const grossPlaces = scaleHalf(rawGross);
  const netPlaces = scaleHalf(rawNet);
  const grossPot = grossPlaces.reduce((a, b) => a + b, 0);
  const netPot = netPlaces.reduce((a, b) => a + b, 0);
  const placePot = grossPot + netPot;
  const sidePot = Math.max(0, Math.round((totalPot - placePot) * 100) / 100);
  
  console.log('=== POT BREAKDOWN ===');
  console.log(`Total Pot: $${totalPot}`);
  console.log(`Gross Place Pot: $${grossPot}`);
  console.log(`Net Place Pot: $${netPot}`);
  console.log(`Place Pot Total: $${placePot}`);
  console.log(`Side Pot: $${sidePot}`);

  // Gross/Net totals with X-score disqualification
  // DQ players get null totals so they never compete in gross/net payouts
  const grossResults = round.players.map(p => {
    const dq = hasXScore(p);
    const gross_total = dq ? null : p.scores.reduce((a, b) => { const n = normalizeScore(b); return a + (typeof n === 'number' ? n : 0); }, 0);
    return { player_id: p.player_id, name: p.name, gross_total, disqualified: dq, achievements: getHoleAchievements(p.scores, round.par) };
  }).sort((a, b) => {
    if (a.disqualified && !b.disqualified) return 1;
    if (!a.disqualified && b.disqualified) return -1;
    const scoreDiff = (a.gross_total ?? 999) - (b.gross_total ?? 999);
    if (scoreDiff !== 0) return scoreDiff;
    // Tiebreaker: alphabetical by name for consistent ordering
    return a.name.localeCompare(b.name);
  });

  const netResults = round.players.map(p => {
    const dq = hasXScore(p);
    const netScores = getPlayerNetScores(p, round.hole_handicap_indexes, round.course_tee_sets);
    const net_total = dq ? null : netScores.reduce((a, b) => a + (b === 'X' ? 0 : b), 0);
    return { player_id: p.player_id, name: p.name, net_total, net_scores: netScores, disqualified: dq, achievements: getHoleAchievements(p.scores, round.par) };
  }).sort((a, b) => {
    if (a.disqualified && !b.disqualified) return 1;
    if (!a.disqualified && b.disqualified) return -1;
    const scoreDiff = (a.net_total ?? 999) - (b.net_total ?? 999);
    if (scoreDiff !== 0) return scoreDiff;
    // Tiebreaker: alphabetical by name for consistent ordering
    return a.name.localeCompare(b.name);
  });

  console.log('=== SWIFT_SCORE_11 PAYOUT CALCULATION ===');
  console.log('Gross Places:', grossPlaces);
  console.log('Net Places:', netPlaces);
  console.log('Gross Results (non-DQ):', grossResults.filter(r => !r.disqualified).map(r => ({ name: r.name, gross_total: r.gross_total })));
  console.log('Net Results (non-DQ):', netResults.filter(r => !r.disqualified).map(r => ({ name: r.name, net_total: r.net_total })));
  
  const rawGrossPayouts = assignPlacePayouts(grossResults.filter(r => !r.disqualified), grossPlaces, "gross_total", {});
  const rawNetPayouts = assignPlacePayouts(netResults.filter(r => !r.disqualified), netPlaces, "net_total", {});
  const { grossPayouts, netPayouts } = applyConflictResolution(
    rawGrossPayouts, rawNetPayouts,
    grossResults.filter(r => !r.disqualified),
    netResults.filter(r => !r.disqualified),
    grossPlaces, netPlaces
  );
  
  console.log('=== AFTER CONFLICT RESOLUTION ===');
  console.log('Final Gross Payouts (after loop):', grossPayouts);
  console.log('Final Net Payouts (after loop):', netPayouts);

  const carryover = !!round.skins_carryover;

  // Separate buy-in pots (independent, like deuces)
  const ss11GrossSkinsPlayerCount = (round.gross_skins_player_ids?.length > 0 || !Array.isArray(round.gross_skins_player_ids)) ? (round.gross_skins_player_ids?.length || round.player_count) : round.player_count;
  const ss11NetSkinsPlayerCount = (round.net_skins_player_ids?.length > 0 || !Array.isArray(round.net_skins_player_ids)) ? (round.net_skins_player_ids?.length || round.player_count) : round.player_count;
  const grossSkinsSeparatePot = (round.gross_skins_enabled && round.gross_skins_separate_buy_in && ss11GrossSkinsPlayerCount > 0)
    ? (round.gross_skins_buy_in || 5) * ss11GrossSkinsPlayerCount : 0;
  const netSkinsSeparatePot = (round.net_skins_enabled && round.net_skins_separate_buy_in && ss11NetSkinsPlayerCount > 0)
    ? (round.net_skins_buy_in || 5) * ss11NetSkinsPlayerCount : 0;
  const kpSeparatePot = (round.kps_enabled && round.kp_separate_buy_in)
    ? (round.kp_buy_in ?? 5) * ((round.kp_player_ids?.length > 0 || !Array.isArray(round.kp_player_ids)) ? (round.kp_player_ids?.length || round.player_count) : round.player_count) : 0;

  // Split side pot between gross skins, net skins, or KPs (if no skins enabled)
  const ss11GrossNeedsPot = round.gross_skins_enabled && !round.gross_skins_separate_buy_in;
  const ss11NetNeedsPot = round.net_skins_enabled && !round.net_skins_separate_buy_in;
  const ss11KpNeedsPot = round.kps_enabled && !round.kp_separate_buy_in && !round.gross_skins_enabled && !round.net_skins_enabled;
  const ss11GrossPortion = (ss11GrossNeedsPot && ss11NetNeedsPot) ? sidePot / 2 : (ss11GrossNeedsPot ? sidePot : 0);
  const ss11NetPortion = (ss11GrossNeedsPot && ss11NetNeedsPot) ? sidePot / 2 : (ss11NetNeedsPot ? sidePot : 0);
  const ss11KpPortion = ss11KpNeedsPot ? sidePot : 0;

  // In SWIFT_SCORE_11, the side pot always funds skins. A separate buy-in adds on top.
  const grossSkinsPot = ss11GrossPortion + grossSkinsSeparatePot;
  const netSkinsPot = ss11NetPortion + netSkinsSeparatePot;

  // Gross skins: fold KPs in when KP has no separate buy-in (and kp_counts_as_skin is true or SWIFT_SCORE_11)
  const useGrossKpFold = round.gross_skins_enabled && round.kps_enabled && !round.kp_separate_buy_in && !round.net_skins_enabled;
  let grossSkinsResult, grossKpPayouts = {}, grossKpResults = [];
  if (useGrossKpFold) {
    const result = computeGrossSkinsWithKP(round, grossSkinsPot, carryover);
    grossSkinsResult = { skins: result.skins, payouts: result.payouts, skinsWon: result.skinsWon };
    grossKpPayouts = result.kpPayouts;
    grossKpResults = result.kpResults;
  } else {
    const achievements = Object.fromEntries(
      round.players.map(p => [p.player_id, getHoleAchievements(p.scores, round.par)])
    );
    grossSkinsResult = round.gross_skins_enabled
      ? computeSkins(grossHoleScores(round), grossSkinsPot, carryover, achievements)
      : { skins: [], payouts: {}, skinsWon: 0 };
  }

  // Net skins: fold KPs in when KP has no separate buy-in (regardless of gross skins)
  const useNetKpFold = round.net_skins_enabled && round.kps_enabled && !round.kp_separate_buy_in;
  let kpResults = grossKpResults, kpPayouts, netSkinsResult;
  if (useNetKpFold) {
    const result = computeNetSkinsWithKP(round, netSkinsPot, carryover);
    netSkinsResult = { skins: result.skins, payouts: result.payouts, skinsWon: result.skinsWon };
    kpResults = result.kpResults;
    kpPayouts = result.kpPayouts;
  } else {
    const achievements = Object.fromEntries(
      round.players.map(p => [p.player_id, getHoleAchievements(p.scores, round.par)])
    );
    const netAchievements = getNetAchievements(round);
    netSkinsResult = round.net_skins_enabled
      ? computeSkins(netHoleScores(round), netSkinsPot, carryover, netAchievements)
      : { skins: [], payouts: {}, skinsWon: 0 };
    // Keep grossKpResults if they exist; only clear if no gross KP folding happened
    kpPayouts = useGrossKpFold ? grossKpPayouts : {};
  }

  // If no skins at all, route side pot directly to KPs (only if KPs not already folded into gross)
  if (ss11KpNeedsPot && ss11KpPortion > 0 && !useGrossKpFold) {
    const result = computeKPs(round, ss11KpPortion);
    kpResults = result.kpResults;
    kpPayouts = result.kpPayouts;
  }

  // KP separate buy-in (independent pot)
  let separateKpResults = [], separateKpPayouts = {}, separateKpPerAmount = 0;
  if (round.kps_enabled && round.kp_separate_buy_in) {
    const result = computeKPs(round, kpSeparatePot);
    separateKpResults = result.kpResults;
    separateKpPayouts = result.kpPayouts;
    separateKpPerAmount = result.perKpAmount || 0;
  }

  const { deuces, deucePayouts, deucePot, perDeuceAmount } = computeDeuces(round);

  const sideTotalPot = sidePot + kpSeparatePot + grossSkinsSeparatePot + netSkinsSeparatePot + deucePot;
  const payoutList = buildFinalPayouts(round.players, {
    grossPayouts, netPayouts,
    kpPayouts: round.kp_separate_buy_in ? separateKpPayouts : (useGrossKpFold ? grossKpPayouts : kpPayouts),
    grossSkinsPayouts: grossSkinsResult.payouts,
    netSkinsPayouts: netSkinsResult.payouts,
    deucePayouts,
  }, sideTotalPot);

  // Determine final KP results: separate buy-in takes priority, then folded results, then direct from round
  let finalKpResults = kpResults;
  let finalKpPerAmount = separateKpPerAmount || 0;
  if (round.kp_separate_buy_in) {
    finalKpResults = separateKpResults;
  } else if (useNetKpFold || useGrossKpFold) {
    // KPs folded into skins — derive per-entry amount from actual kpPayouts
    const foldedKpPayouts = useNetKpFold ? kpPayouts : grossKpPayouts;
    const validFoldedKps = finalKpResults.filter(kp => kp.player_id);
    if (validFoldedKps.length > 0 && foldedKpPayouts) {
      const firstKpWinnerId = validFoldedKps[0].player_id;
      const firstKpEntries = validFoldedKps.filter(kp => kp.player_id === firstKpWinnerId).length;
      const firstKpPayout = foldedKpPayouts[firstKpWinnerId] || 0;
      finalKpPerAmount = firstKpEntries > 0 ? firstKpPayout / firstKpEntries : 0;
    }
  } else if (!useGrossKpFold && !useNetKpFold && round.kps_enabled) {
    // Standalone KPs with no skins—use direct from round
    finalKpResults = (round.kp_winners || []).filter(kp => kp.player_id);
    const validKpWinners = finalKpResults.filter(kp => kp.player_id);
    finalKpPerAmount = validKpWinners.length > 0 ? (round.kp_separate_pot || 0) / validKpWinners.length : 0;
    console.log('SWIFT_SCORE_11 standalone KPs:', { finalKpResults, perKpAmount: finalKpPerAmount });
  }

  return {
    total_pot: totalPot,
    deuce_pot: deucePot,
    kp_separate_pot: kpSeparatePot,
    kp_per_entry_amount: finalKpPerAmount,
    deuce_per_entry_amount: perDeuceAmount,
    gross_skins_separate_pot: grossSkinsSeparatePot,
    net_skins_separate_pot: netSkinsSeparatePot,
    gross_skins_allocated_pot: grossSkinsPot,
    net_skins_allocated_pot: netSkinsPot,
    games_pot: sidePot,
    gross_pot: grossPot,
    net_pot: netPot,
    side_pot: sidePot,
    skins_carryover: carryover,
    gross_places: grossPlaces,
    net_places: netPlaces,
    gross_num_places: grossPlaces.length,
    net_num_places: netPlaces.length,
    gross_results: grossResults,
    net_results: netResults,
    kp_results: finalKpResults,
    gross_skins: grossSkinsResult.skins,
    net_skins: netSkinsResult.skins,
    deuces,
    payouts: payoutList.sort((a, b) => b.total_payout - a.total_payout),
  };
}

// ─── FINAL PAYOUT BUILDER ────────────────────────────────────
export function buildFinalPayouts(players, { grossPayouts, netPayouts, kpPayouts, grossSkinsPayouts, netSkinsPayouts, deucePayouts }, totalPot) {
  const finalPayouts = {};
  players.forEach(p => {
    // Keep individual payouts RAW (no rounding yet)
    finalPayouts[p.player_id] = {
      player_id: p.player_id,
      name: p.name,
      gross_payout: grossPayouts[p.player_id] || 0,
      net_payout: netPayouts[p.player_id] || 0,
      kp_payout: kpPayouts[p.player_id] || 0,
      gross_skins_payout: grossSkinsPayouts[p.player_id] || 0,
      net_skins_payout: netSkinsPayouts[p.player_id] || 0,
      deuce_payout: deucePayouts[p.player_id] || 0,
      total_payout: 0,
    };
  });

  const payoutList = Object.values(finalPayouts);
  
  // Calculate raw totals (keep individual sub-payouts raw, no rounding)
  const rawTotals = payoutList.map(p => {
    return p.gross_payout + p.net_payout + p.kp_payout + p.gross_skins_payout + p.net_skins_payout + p.deuce_payout;
  });
  
  // Floor each player's total
  const floored = rawTotals.map(v => Math.floor(v));
  const floorSum = floored.reduce((a, b) => a + b, 0);
  const totalRaw = rawTotals.reduce((a, b) => a + b, 0);
  const extraDollars = Math.floor(totalRaw) - floorSum;
  
  // Distribute extra dollars to LOWEST earners first (they get rounded UP)
  // Higher earners stay floored (rounded DOWN)
  // CRITICAL: Only consider players with rawTotal > 0 (exclude zero-earners)
  const remainders = rawTotals.map((v, i) => ({
    i,
    frac: v - Math.floor(v),
    rawTotal: v,
  }))
  .filter(r => r.rawTotal > 1e-9); // Only players with actual earnings
  
  // Sort by: largest remainder first (most deserving of round-up), then lowest earner as tiebreaker
  // Players with frac=0 (already whole dollars) are sorted last and should not be rounded up
  remainders.sort((a, b) => {
    if (Math.abs(b.frac - a.frac) > 1e-9) return b.frac - a.frac; // largest remainder first
    return a.rawTotal - b.rawTotal; // tie → lowest earner
  });
  
  const roundedTotals = [...floored];
  for (let i = 0; i < extraDollars && i < remainders.length; i++) {
    roundedTotals[remainders[i].i] += 1;
  }
  
  payoutList.forEach((p, i) => {
    p.total_payout = roundedTotals[i];
  });

  return payoutList;
}

// ─── MAIN COMPUTE ────────────────────────────────────────────
export function computeResults(round) {
  // Store debug logs in window for retrieval
  window.__debugLogs = [];
  const log = (msg) => {
    console.log(msg);
    window.__debugLogs.push(msg);
  };
  
  log('=== COMPUTE START ===');
  log('Game Mode: ' + round.game_mode);

  // Filter to only players with complete, valid scores before computing
  const isValidScore = s => {
    if (typeof s === 'string' && s.trim().toUpperCase() === 'X') return true;
    const n = Number(s);
    return !isNaN(n) && n >= 1;
  };
  // A player "has scores" if they have any valid entries — they must have exactly 18 scores
  // and ALL must be valid (non-empty, non-zero). Players with partial scores are excluded.
  // However, if a player has 18 entries but some are "" due to a storage glitch,
  // try to recover by treating "" entries as par (only if most scores are valid).
  const normalizePlayerScores = (p) => {
    if (!p.scores || p.scores.length !== 18) return p;
    const validCount = p.scores.filter(isValidScore).length;
    // If player has >= 15 valid scores, fill in remaining empty slots with par to avoid dropping them
    if (validCount >= 15 && validCount < 18) {
      const par = round.par || [];
      const normalized = p.scores.map((s, i) => isValidScore(s) ? s : String(par[i] || 4));
      return { ...p, scores: normalized };
    }
    return p;
  };
  const playersWithScores = (round.players || [])
    .map(normalizePlayerScores)
    .filter(p => {
      const validCount = p.scores?.filter(s => isValidScore(s)).length || 0;
      const hasScores = p.scores && p.scores.length === 18 && validCount >= 15;
      console.log(`Player ${p.name}: hasScores=${hasScores}, validCount=${validCount}/18, scores=${p.scores?.join(',')}`);
      return hasScores;
    });
  const roundForCompute = { ...round, players: playersWithScores, all_players: round.players };
  console.log(`Players with scores: ${playersWithScores.length}/${round.players?.length}`);

  const issues = validateScorePacket(roundForCompute);
  if (issues.length > 0) {
    return { success: false, issues };
  }

  let results;
  switch (roundForCompute.game_mode) {
    case "SWIFT_SCORE_11":
      results = computeSwiftScore11(roundForCompute);
      break;
    case "CUSTOM":
      results = computeCustom(roundForCompute);
      break;
    case "OFF": {
      const round = roundForCompute;
      const totalPot = round.buy_in * round.player_count;
      const carryover = !!round.skins_carryover;
      
      const signupCount = (round.all_players || round.players).length;

      const grossResults = round.players.map(p => {
        const dq = hasXScore(p);
        const gross_total = dq ? null : p.scores.reduce((a, b) => { const n = normalizeScore(b); return a + (typeof n === 'number' ? n : 0); }, 0);
        return { player_id: p.player_id, name: p.name, gross_total, disqualified: dq, achievements: getHoleAchievements(p.scores, round.par) };
      }).sort((a, b) => {
        if (a.disqualified && !b.disqualified) return 1;
        if (!a.disqualified && b.disqualified) return -1;
        const scoreDiff = (a.gross_total ?? 999) - (b.gross_total ?? 999);
        if (scoreDiff !== 0) return scoreDiff;
        // Tiebreaker: alphabetical by name for consistent ordering
        return a.name.localeCompare(b.name);
      });

      const netResults = round.players.map(p => {
        const dq = hasXScore(p);
        const netScores = getPlayerNetScores(p, round.hole_handicap_indexes, round.course_tee_sets);
        const net_total = dq ? null : netScores.reduce((a, b) => a + (b === 'X' ? 0 : b), 0);
        return { player_id: p.player_id, name: p.name, net_total, net_scores: netScores, disqualified: dq, achievements: getHoleAchievements(p.scores, round.par) };
      }).sort((a, b) => {
        if (a.disqualified && !b.disqualified) return 1;
        if (!a.disqualified && b.disqualified) return -1;
        const scoreDiff = (a.net_total ?? 999) - (b.net_total ?? 999);
        if (scoreDiff !== 0) return scoreDiff;
        // Tiebreaker: alphabetical by name for consistent ordering
        return a.name.localeCompare(b.name);
      });

      // Separate buy-in pots (independent, like deuces)
      const grossSkinsPlayerCount = (round.gross_skins_player_ids?.length > 0 || !Array.isArray(round.gross_skins_player_ids)) ? (round.gross_skins_player_ids?.length || signupCount) : signupCount;
      const netSkinsPlayerCount = (round.net_skins_player_ids?.length > 0 || !Array.isArray(round.net_skins_player_ids)) ? (round.net_skins_player_ids?.length || signupCount) : signupCount;
      const offGrossSkinsSeparatePot = (round.gross_skins_enabled && round.gross_skins_separate_buy_in && grossSkinsPlayerCount > 0)
        ? (round.gross_skins_buy_in || 5) * grossSkinsPlayerCount : 0;
      const offNetSkinsSeparatePot = (round.net_skins_enabled && round.net_skins_separate_buy_in && netSkinsPlayerCount > 0)
        ? (round.net_skins_buy_in || 5) * netSkinsPlayerCount : 0;
      const offKpSeparatePot = (round.kps_enabled && round.kp_separate_buy_in)
        ? (round.kp_buy_in ?? 5) * ((round.kp_player_ids?.length > 0 || !Array.isArray(round.kp_player_ids)) ? (round.kp_player_ids?.length || signupCount) : signupCount) : 0;

      // Split main pot between gross and net skins if both share from it
      // A skins game with an explicit empty player list should not receive any pot
      const offGrossNeedsPot = round.gross_skins_enabled && !round.gross_skins_separate_buy_in;
      const offNetNeedsPot = round.net_skins_enabled && !round.net_skins_separate_buy_in;
      const offGrossPortion = (offGrossNeedsPot && offNetNeedsPot) ? totalPot / 2 : (offGrossNeedsPot ? totalPot : 0);
      const offNetPortion = (offGrossNeedsPot && offNetNeedsPot) ? totalPot / 2 : (offNetNeedsPot ? totalPot : 0);

      const offGrossSkinsPot = offGrossSkinsSeparatePot || offGrossPortion;
      const offNetSkinsPot = offNetSkinsSeparatePot || offNetPortion;

      console.log('OFF MODE POT BREAKDOWN:', { totalPot, offKpSeparatePot, offGrossSkinsPot, offNetSkinsPot, offGrossSkinsSeparatePot, offNetSkinsSeparatePot, carryover });

      // Gross skins: fold KPs in when kp_counts_as_skin is true and no separate buy-in
      const offUseGrossKpFold = round.gross_skins_enabled && round.kps_enabled && !round.kp_separate_buy_in && round.kp_counts_as_skin && !round.net_skins_enabled;
      let offGrossSkinsResult, offGrossKpPayouts = {}, offGrossKpResults = [];
      if (offUseGrossKpFold) {
        const result = computeGrossSkinsWithKP(round, offGrossSkinsPot, carryover);
        offGrossSkinsResult = { skins: result.skins, payouts: result.payouts, skinsWon: result.skinsWon };
        offGrossKpPayouts = result.kpPayouts;
        offGrossKpResults = result.kpResults;
      } else {
        const achievements = Object.fromEntries(
          round.players.map(p => [p.player_id, getHoleAchievements(p.scores, round.par)])
        );
        offGrossSkinsResult = round.gross_skins_enabled
          ? computeSkins(grossHoleScores(round), offGrossSkinsPot, carryover, achievements)
          : { skins: [], payouts: {}, skinsWon: 0 };
      }

      // Net skins: fold KPs in when kp_counts_as_skin is true and no separate buy-in
      const offUseNetKpFold = round.net_skins_enabled && round.kps_enabled && !round.kp_separate_buy_in && round.kp_counts_as_skin;
      let offNetKpResults = offGrossKpResults, offNetKpPayouts = {}, offNetSkinsResult;
      if (offUseNetKpFold) {
        const result = computeNetSkinsWithKP(round, offNetSkinsPot, carryover);
        offNetSkinsResult = { skins: result.skins, payouts: result.payouts, skinsWon: result.skinsWon };
        offNetKpResults = result.kpResults;
        offNetKpPayouts = result.kpPayouts;
      } else {
        const offNetAchievements = getNetAchievements(round);
        offNetSkinsResult = round.net_skins_enabled
          ? computeSkins(netHoleScores(round), offNetSkinsPot, carryover, offNetAchievements)
          : { skins: [], payouts: {}, skinsWon: 0 };
        offNetKpPayouts = offUseGrossKpFold ? offGrossKpPayouts : {};
      }

      // KP separate buy-in
      let offSepKpResults = [], offSepKpPayouts = {};
      if (round.kps_enabled && round.kp_separate_buy_in) {
        const result = computeKPs(round, offKpSeparatePot);
        offSepKpResults = result.kpResults;
        offSepKpPayouts = result.kpPayouts;
      }
      const offKpResults = round.kp_separate_buy_in ? offSepKpResults : (offUseNetKpFold ? offNetKpResults : offGrossKpResults);
      const offKpPayouts = round.kp_separate_buy_in ? offSepKpPayouts : (offUseNetKpFold ? offNetKpPayouts : offGrossKpPayouts);

      const { deuces, deucePayouts, deucePot } = computeDeuces(round);
      const offSideTotalPot = offGrossSkinsPot + offNetSkinsPot + offKpSeparatePot + deucePot;

      const payoutList = buildFinalPayouts(round.players, {
        grossPayouts: {}, netPayouts: {},
        kpPayouts: offKpPayouts,
        grossSkinsPayouts: offGrossSkinsResult.payouts,
        netSkinsPayouts: offNetSkinsResult.payouts,
        deucePayouts,
      }, offSideTotalPot);

      // Compute kp_per_entry_amount for OFF mode display
      const validOffKpWinners = offKpResults.filter(kp => kp.player_id);
      let offKpPerEntryAmount = 0;
      if (round.kp_separate_buy_in) {
        offKpPerEntryAmount = validOffKpWinners.length > 0 ? offKpSeparatePot / validOffKpWinners.length : 0;
      } else if (validOffKpWinners.length > 0 && Object.keys(offKpPayouts).length > 0) {
        const totalOffKpPaid = Object.values(offKpPayouts).reduce((a, b) => a + b, 0);
        offKpPerEntryAmount = totalOffKpPaid / validOffKpWinners.length;
      }

      results = {
        total_pot: totalPot,
        deuce_pot: deucePot,
        side_pot: offGrossSkinsPot + offNetSkinsPot,
        gross_skins_separate_pot: offGrossSkinsSeparatePot,
        net_skins_separate_pot: offNetSkinsSeparatePot,
        gross_skins_allocated_pot: offGrossSkinsPot,
        net_skins_allocated_pot: offNetSkinsPot,
        kp_separate_pot: offKpSeparatePot,
        kp_per_entry_amount: offKpPerEntryAmount,
        deuce_per_entry_amount: computeDeuces(round).perDeuceAmount,
        skins_carryover: carryover,
        gross_results: grossResults,
        net_results: netResults,
        gross_skins: offGrossSkinsResult.skins,
        net_skins: offNetSkinsResult.skins,
        kp_results: offKpResults,
        payouts: payoutList.sort((a, b) => b.total_payout - a.total_payout),
        deuces,
      };
      break;
    }
    default:
      return { success: false, issues: ["Unknown GameMode."] };
  }

  // Stableford: convert stroke totals to points and re-rank descending (highest = best)
  if (getMainGameFormat(round) === 'stableford') {
    results = applyStableford(results, round);
  }

  // Append players without complete scores to the results so they still appear in standings
  const allPlayerIds = new Set(round.players.map(p => p.player_id));
  const computedPlayerIds = new Set((results.gross_results || []).map(p => p.player_id));
  const missingPlayerIds = [...allPlayerIds].filter(id => !computedPlayerIds.has(id));

  if (missingPlayerIds.length > 0) {
    const missingPlayers = round.players.filter(p => missingPlayerIds.includes(p.player_id));
    const missingGrossResults = missingPlayers.map(p => ({
      player_id: p.player_id,
      name: p.name,
      gross_total: null,
      disqualified: true,
      achievements: new Array(18).fill(null).map(() => ({ type: '—', display: '—' })),
    }));
    const missingNetResults = missingPlayers.map(p => ({
      player_id: p.player_id,
      name: p.name,
      net_total: null,
      net_scores: new Array(18).fill(''),
      disqualified: true,
      achievements: new Array(18).fill(null).map(() => ({ type: '—', display: '—' })),
    }));
    results.gross_results = [...(results.gross_results || []), ...missingGrossResults];
    results.net_results = [...(results.net_results || []), ...missingNetResults];
  }

  return { success: true, results, skipped_players: round.players.length - playersWithScores.length };
}

// ─── CUSTOM MODE ────────────────────────────────────────────
function computeCustom(round) {
  // Use the full signup roster for pot calculation — withdrawn players still paid in.
  const signupCount = (round.all_players || round.players).length;
  const totalPot = round.buy_in * signupCount;
  const carryover = !!round.skins_carryover;
  console.log('computeCustom:', { totalPot, carryover, gross_skins: round.gross_skins_enabled, net_skins: round.net_skins_enabled, kps: round.kps_enabled, kp_separate: round.kp_separate_buy_in, hole_indexes_count: round.hole_handicap_indexes?.length, custom_gross_places: round.custom_gross_places, custom_net_places: round.custom_net_places });
  
  // Compute gross and net results
  const grossResults = round.players.map(p => {
    const dq = hasXScore(p);
    const gross_total = dq ? null : p.scores.reduce((a, b) => { const n = normalizeScore(b); return a + (typeof n === 'number' ? n : 0); }, 0);
    return { player_id: p.player_id, name: p.name, gross_total, disqualified: dq, achievements: getHoleAchievements(p.scores, round.par) };
  }).sort((a, b) => {
    if (a.disqualified && !b.disqualified) return 1;
    if (!a.disqualified && b.disqualified) return -1;
    const scoreDiff = (a.gross_total ?? 999) - (b.gross_total ?? 999);
    if (scoreDiff !== 0) return scoreDiff;
    // Tiebreaker: alphabetical by name for consistent ordering
    return a.name.localeCompare(b.name);
  });

  const netResults = round.players.map(p => {
    const dq = hasXScore(p);
    const netScores = getPlayerNetScores(p, round.hole_handicap_indexes, round.course_tee_sets);
    const net_total = dq ? null : netScores.reduce((a, b) => a + (b === 'X' ? 0 : b), 0);
    return { player_id: p.player_id, name: p.name, net_total, net_scores: netScores, disqualified: dq, achievements: getHoleAchievements(p.scores, round.par) };
  }).sort((a, b) => {
    if (a.disqualified && !b.disqualified) return 1;
    if (!a.disqualified && b.disqualified) return -1;
    const scoreDiff = (a.net_total ?? 999) - (b.net_total ?? 999);
    if (scoreDiff !== 0) return scoreDiff;
    // Tiebreaker: alphabetical by name for consistent ordering
    return a.name.localeCompare(b.name);
  });

  // Side games: skins, deuces, KPs (same as OFF mode)
  const customGrossSkinsPlayerCount = (round.gross_skins_player_ids?.length > 0 || !Array.isArray(round.gross_skins_player_ids)) ? (round.gross_skins_player_ids?.length || signupCount) : signupCount;
  const customNetSkinsPlayerCount = (round.net_skins_player_ids?.length > 0 || !Array.isArray(round.net_skins_player_ids)) ? (round.net_skins_player_ids?.length || signupCount) : signupCount;
  const customGrossSkinsSeparatePot = (round.gross_skins_enabled && round.gross_skins_separate_buy_in && customGrossSkinsPlayerCount > 0)
    ? (round.gross_skins_buy_in || 5) * customGrossSkinsPlayerCount : 0;
  const customNetSkinsSeparatePot = (round.net_skins_enabled && round.net_skins_separate_buy_in && customNetSkinsPlayerCount > 0)
    ? (round.net_skins_buy_in || 5) * customNetSkinsPlayerCount : 0;
  const customKpSeparatePot = (round.kps_enabled && round.kp_separate_buy_in)
    ? (round.kp_buy_in ?? 5) * ((round.kp_player_ids?.length > 0 || !Array.isArray(round.kp_player_ids)) ? (round.kp_player_ids?.length || signupCount) : signupCount) : 0;

  const customGamesPot = totalPot * ((round.custom_games_percent || 0) / 100);
  const customGrossNeedsPot = round.gross_skins_enabled && !round.gross_skins_separate_buy_in;
  const customNetNeedsPot = round.net_skins_enabled && !round.net_skins_separate_buy_in;
  const customGrossPortion = (customGrossNeedsPot && customNetNeedsPot) ? customGamesPot / 2 : (customGrossNeedsPot ? customGamesPot : 0);
  const customNetPortion = (customGrossNeedsPot && customNetNeedsPot) ? customGamesPot / 2 : (customNetNeedsPot ? customGamesPot : 0);

  const customGrossSkinsPot = customGrossSkinsSeparatePot || customGrossPortion;
  const customNetSkinsPot = customNetSkinsSeparatePot || customNetPortion;

  // Gross skins: fold KPs in when KP has no separate buy-in
  const customUseGrossKpFold = round.gross_skins_enabled && round.kps_enabled && !round.kp_separate_buy_in;
  let customGrossSkinsResult, customGrossKpPayouts = {}, customGrossKpResults = [];
  if (customUseGrossKpFold) {
    const result = computeGrossSkinsWithKP(round, customGrossSkinsPot, carryover);
    customGrossSkinsResult = { skins: result.skins, payouts: result.payouts, skinsWon: result.skinsWon };
    customGrossKpPayouts = result.kpPayouts;
    customGrossKpResults = result.kpResults;
  } else {
    const customAchievements = Object.fromEntries(
      round.players.map(p => [p.player_id, getHoleAchievements(p.scores, round.par)])
    );
    customGrossSkinsResult = round.gross_skins_enabled
      ? computeSkins(grossHoleScores(round), customGrossSkinsPot, carryover, customAchievements)
      : { skins: [], payouts: {}, skinsWon: 0 };
  }

  // Net skins: fold KPs in when KP has no separate buy-in (regardless of gross skins)
  const customUseNetKpFold = round.net_skins_enabled && round.kps_enabled && !round.kp_separate_buy_in;
  let customKpResults = customGrossKpResults, customKpPayouts, customNetSkinsResult;
  if (customUseNetKpFold) {
    const result = computeNetSkinsWithKP(round, customNetSkinsPot, carryover);
    customNetSkinsResult = { skins: result.skins, payouts: result.payouts, skinsWon: result.skinsWon };
    customKpResults = result.kpResults;
    customKpPayouts = result.kpPayouts;
  } else {
    const customAchievements = Object.fromEntries(
      round.players.map(p => [p.player_id, getHoleAchievements(p.scores, round.par)])
    );
    const customNetAchievements = getNetAchievements(round);
    customNetSkinsResult = round.net_skins_enabled
      ? computeSkins(netHoleScores(round), customNetSkinsPot, carryover, customNetAchievements)
      : { skins: [], payouts: {}, skinsWon: 0 };
    // Keep customGrossKpResults if they exist; only clear if no gross KP folding happened
    customKpPayouts = customUseGrossKpFold ? customGrossKpPayouts : {};
  }

  // Standalone KPs: no skins enabled, KPs not separate → route games pot to KPs
  const customKpNeedsPot = round.kps_enabled && !round.kp_separate_buy_in && !round.gross_skins_enabled && !round.net_skins_enabled;
  if (customKpNeedsPot && customGamesPot > 0) {
    const result = computeKPs(round, customGamesPot);
    customKpResults = result.kpResults;
    customKpPayouts = result.kpPayouts;
  }

  let customSepKpResults = [], customSepKpPayouts = {};
  if (round.kps_enabled && round.kp_separate_buy_in) {
    const result = computeKPs(round, customKpSeparatePot);
    customSepKpResults = result.kpResults;
    customSepKpPayouts = result.kpPayouts;
  }

  // Place payouts — split proportionally by number of spots paid
  const customPlacePot = totalPot * ((round.custom_place_payout_percent || 0) / 100);
  const grossSpotsRaw = (round.custom_gross_places !== undefined && round.custom_gross_places !== null && round.custom_gross_places !== "") ? Number(round.custom_gross_places) : 0;
  const netSpotsRaw = (round.custom_net_places !== undefined && round.custom_net_places !== null && round.custom_net_places !== "") ? Number(round.custom_net_places) : 0;
  const totalSpotsForSplit = grossSpotsRaw + netSpotsRaw;
  const customGrossPlacePot = totalSpotsForSplit > 0 ? customPlacePot * (grossSpotsRaw / totalSpotsForSplit) : customPlacePot * 0.5;
  const customNetPlacePot = totalSpotsForSplit > 0 ? customPlacePot * (netSpotsRaw / totalSpotsForSplit) : customPlacePot * 0.5;
  // Places paid: use direct values if provided, fallback to old percentage-based system for backwards compatibility
   let numGrossPlaces, numNetPlaces;
   const hasGrossPlaces = round.custom_gross_places !== undefined && round.custom_gross_places !== null && round.custom_gross_places !== "";
   const hasNetPlaces = round.custom_net_places !== undefined && round.custom_net_places !== null && round.custom_net_places !== "";

   if (hasGrossPlaces) {
     numGrossPlaces = Number(round.custom_gross_places);
     console.log('Using direct gross places:', { raw: round.custom_gross_places, numGrossPlaces });
   } else {
     const fieldPercent = (round.custom_gross_field_percent !== null && round.custom_gross_field_percent !== "") ? round.custom_gross_field_percent : 35;
     numGrossPlaces = customGrossPlacePot > 0 ? Math.max(1, Math.floor(signupCount * (fieldPercent / 100 / 2))) : 0;
     console.log('Using fallback gross places:', { fieldPercent, numGrossPlaces });
   }
   if (hasNetPlaces) {
     numNetPlaces = Number(round.custom_net_places);
     console.log('Using direct net places:', { raw: round.custom_net_places, numNetPlaces });
   } else {
     const fieldPercent = (round.custom_net_field_percent !== null && round.custom_net_field_percent !== "") ? round.custom_net_field_percent : 35;
     numNetPlaces = customNetPlacePot > 0 ? Math.max(1, Math.floor(signupCount * (fieldPercent / 100 / 2))) : 0;
     console.log('Using fallback net places:', { fieldPercent, numNetPlaces });
   }

   console.log('CUSTOM payout setup:', { numGrossPlaces, numNetPlaces, customGrossPlacePot, customNetPlacePot, hasGrossPlaces, hasNetPlaces, roundGrossPlaces: round.custom_gross_places, roundNetPlaces: round.custom_net_places });
  // Round place amounts to whole dollars using Largest Remainder Method —
  // matches SWIFT_SCORE_11's scaleHalf so gross/net payouts are clean integers.
  const rawGrossPlaceAmounts = geometricPayouts(numGrossPlaces, customGrossPlacePot);
  const rawNetPlaceAmounts = geometricPayouts(numNetPlaces, customNetPlacePot);
  const grossPlaceAmounts = largestRemainderRound(rawGrossPlaceAmounts, Math.round(rawGrossPlaceAmounts.reduce((a, b) => a + b, 0)));
  const netPlaceAmounts = largestRemainderRound(rawNetPlaceAmounts, Math.round(rawNetPlaceAmounts.reduce((a, b) => a + b, 0)));

  console.log('Place amounts arrays:', { 
   numGrossPlaces, 
   grossPlaceAmounts,
   grossPlaceAmountsLength: grossPlaceAmounts.length,
   numNetPlaces,
   netPlaceAmounts,
   netPlaceAmountsLength: netPlaceAmounts.length
  });

  const rawCustomGrossPayouts = assignPlacePayouts(grossResults.filter(r => !r.disqualified), grossPlaceAmounts, 'gross_total', {});
  const rawCustomNetPayouts = assignPlacePayouts(netResults.filter(r => !r.disqualified), netPlaceAmounts, 'net_total', {});
  const { grossPayouts: customGrossPayouts, netPayouts: customNetPayouts } = applyConflictResolution(
    rawCustomGrossPayouts, rawCustomNetPayouts,
    grossResults.filter(r => !r.disqualified),
    netResults.filter(r => !r.disqualified),
    grossPlaceAmounts, netPlaceAmounts
  );

  const { deuces, deucePayouts, deucePot, perDeuceAmount: customPerDeuceAmount } = computeDeuces(round);
  const customSideTotalPot = customPlacePot + customGrossSkinsPot + customNetSkinsPot + customKpSeparatePot + deucePot;
  // Note: customGrossSkinsPot/customNetSkinsPot come from customGamesPot (already separate from customPlacePot)

  const payoutList = buildFinalPayouts(round.players, {
    grossPayouts: customGrossPayouts, netPayouts: customNetPayouts,
    kpPayouts: round.kp_separate_buy_in ? customSepKpPayouts : customKpPayouts,
    grossSkinsPayouts: customGrossSkinsResult.payouts,
    netSkinsPayouts: customNetSkinsResult.payouts,
    deucePayouts,
  }, customSideTotalPot);

  // Compute kp_per_entry_amount for display
  const finalCustomKpResults = round.kp_separate_buy_in ? customSepKpResults : customKpResults;
  const finalCustomKpPayouts = round.kp_separate_buy_in ? customSepKpPayouts : customKpPayouts;
  const validCustomKpWinners = finalCustomKpResults.filter(kp => kp.player_id);
  let customKpPerEntryAmount = 0;
  if (round.kp_separate_buy_in) {
    customKpPerEntryAmount = validCustomKpWinners.length > 0 ? customKpSeparatePot / validCustomKpWinners.length : 0;
  } else if (validCustomKpWinners.length > 0 && Object.keys(finalCustomKpPayouts).length > 0) {
    // Folded into skins: perUnit was paid per KP entry, so find it from the first winner's payout / their entry count
    const firstWinnerId = validCustomKpWinners[0].player_id;
    const firstWinnerEntries = validCustomKpWinners.filter(kp => kp.player_id === firstWinnerId).length;
    const firstWinnerPayout = finalCustomKpPayouts[firstWinnerId] || 0;
    customKpPerEntryAmount = firstWinnerEntries > 0 ? firstWinnerPayout / firstWinnerEntries : 0;
  }

  return {
    total_pot: totalPot,
    deuce_pot: deucePot,
    gross_pot: customGrossPlacePot,
    net_pot: customNetPlacePot,
    gross_places: grossPlaceAmounts,
    net_places: netPlaceAmounts,
    side_pot: customGamesPot,
    gross_skins_separate_pot: customGrossSkinsSeparatePot,
    net_skins_separate_pot: customNetSkinsSeparatePot,
    gross_skins_allocated_pot: customGrossSkinsPot,
    net_skins_allocated_pot: customNetSkinsPot,
    kp_separate_pot: customKpSeparatePot,
    kp_per_entry_amount: customKpPerEntryAmount,
    deuce_per_entry_amount: customPerDeuceAmount,
    skins_carryover: carryover,
    gross_results: grossResults,
    net_results: netResults,
    gross_skins: customGrossSkinsResult.skins,
    net_skins: customNetSkinsResult.skins,
    kp_results: finalCustomKpResults,
    payouts: payoutList.sort((a, b) => b.total_payout - a.total_payout),
    deuces,
  };
}

function computeSkinsWithoutCarryover(holeWinners, totalPot, achievements) {
  const skins = [];
  const payouts = {};
  const winners = holeWinners.filter(w => w !== null);
  if (winners.length === 0) return { skins, payouts };
  const perSkin = totalPot / winners.length;

  holeWinners.forEach((winner, h) => {
    if (winner) {
      const holeAchievements = achievements?.[winner.player_id]?.[h];
      skins.push({ 
        hole: h + 1, 
        player_id: winner.player_id, 
        name: winner.name, 
        score: winner.score, 
        value: perSkin, 
        carryover_from: [],
        achievement: holeAchievements?.display
      });
      payouts[winner.player_id] = (payouts[winner.player_id] || 0) + perSkin;
    }
  });

  return { skins, payouts };
}
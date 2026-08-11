/**
 * RoundScore helpers — each player's 18 scores live in their own tiny RoundScore record.
 * This keeps the Round record small regardless of player count, preventing the 200KB DB limit.
 */
import { base44 } from "@/api/base44Client";

/**
 * Load all RoundScore records for a round and return a map: { player_id -> scores[] }
 */
export async function loadRoundScores(roundId) {
  if (!roundId) return {};
  try {
    const records = await base44.entities.RoundScore.filter({ round_id: roundId });
    const map = {};
    records.forEach(r => {
      map[r.player_id] = (r.scores || []).map(s => {
        if (s === null || s === undefined || s === '' || s === 0) return '';
        const str = String(s).trim().toUpperCase();
        return str === 'X' ? 'X' : str;
      });
    });
    return map;
  } catch (e) {
    console.error('loadRoundScores failed:', e);
    return {};
  }
}

/**
 * Save one player's scores to their RoundScore record.
 * Creates the record if it doesn't exist yet, otherwise updates it.
 * @param {string} roundId
 * @param {string} playerId
 * @param {string[]} scores - array of 18 scores
 * @param {Object} recordCache - mutable cache { player_id -> RoundScore.id } to avoid re-listing
 */
export async function savePlayerScore(roundId, playerId, scores, recordCache = {}) {
  console.log('savePlayerScore called:', { roundId, playerId, scores });
  
  if (!playerId) {
    console.error('savePlayerScore: playerId is missing!', { roundId, scores });
    throw new Error('playerId is required but was not provided');
  }
  
  // Normalize scores: keep empty strings as '', preserve 'X' for DQ, valid numbers as strings
  const normalized = scores.map(s => {
    if (s === null || s === undefined || s === '') return '';
    const str = String(s).trim().toUpperCase();
    if (str === 'X') return 'X';
    const num = parseInt(s, 10);
    return (isNaN(num) || num < 1 || num > 20) ? '' : String(num);
  });

  // Use cache when available to avoid redundant filter() calls (each filter = 1 API call)
  if (recordCache[playerId]) {
    await base44.entities.RoundScore.update(recordCache[playerId], { scores: normalized });
    return;
  }

  // Cache miss — look up the record once and populate the cache
  const existing = await base44.entities.RoundScore.filter({ round_id: roundId, player_id: playerId });
  if (existing.length > 0) {
    recordCache[playerId] = existing[0].id;
    await base44.entities.RoundScore.update(existing[0].id, { scores: normalized });
  } else {
    console.log('Creating new RoundScore for:', { round_id: roundId, player_id: playerId, scores: normalized });
    const created = await base44.entities.RoundScore.create({ round_id: roundId, player_id: playerId, scores: normalized });
    recordCache[playerId] = created.id;
  }
}

/**
 * Save ALL players' scores in parallel to RoundScore records.
 * @param {string} roundId
 * @param {Object} scoresMap - { player_id -> scores[] }
 * @param {Object} recordCache - mutable cache to reuse record IDs
 */
export async function saveAllScores(roundId, scoresMap, recordCache = {}) {
  const entries = Object.entries(scoresMap);
  await Promise.all(entries.map(([playerId, scores]) =>
    savePlayerScore(roundId, playerId, scores, recordCache)
  ));
}

/**
 * Merge RoundScore data into a round's players array.
 * RoundScore takes priority over player.scores (it's fresher).
 * Falls back to player.scores for players with no RoundScore record.
 */
export function mergeScoresIntoRound(round, roundScoreMap) {
  if (!round || !round.players) return round;
  return {
    ...round,
    players: round.players.map(p => ({
      ...p,
      scores: roundScoreMap[p.player_id] || p.scores || [],
    })),
  };
}
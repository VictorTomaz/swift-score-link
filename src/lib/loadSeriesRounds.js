import { base44 } from "@/api/base44Client";
import { hydrateRoundsScores } from "@/lib/roundScores";

const withTimeout = (promise, timeoutMs) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("getSeriesRounds timed out")), timeoutMs);
  promise.then(
    (value) => { clearTimeout(timer); resolve(value); },
    (error) => { clearTimeout(timer); reject(error); },
  );
});

/**
 * Loads every round of a tournament series from any round id in it.
 * Tries the backend function first, but gives up after 8s (it can stall in
 * the phone app) and loads the rounds directly instead — the same direct
 * reads the individual day pages use, which work on the phone.
 */
export async function loadSeriesRounds(roundId, { summary = false } = {}) {
  if (!roundId) throw new Error("Tournament id required");
  let rounds = [];
  try {
    const res = await withTimeout(base44.functions.invoke("getSeriesRounds", { roundId, summary }), 8000);
    rounds = (res?.data || res)?.rounds || [];
  } catch (e) { /* fall back below */ }

  if (rounds.length <= 1) {
    const start = rounds[0] || await base44.entities.Round.get(roundId).catch(() => null);
    if (start) {
      const rootId = start.parent_round_id || start.id;
      const root = rootId === start.id ? start : await base44.entities.Round.get(rootId).catch(() => start);
      const children = await base44.entities.Round.filter({ parent_round_id: rootId }, '-created_date', 200).catch(() => []);
      const seen = new Set();
      const all = [root, start, ...children].filter(r => r && !seen.has(r.id) && seen.add(r.id));
      rounds = await hydrateRoundsScores(all).catch(() => all);
    }
  }

  if (rounds.length === 0) throw new Error("Tournament not loaded");
  return rounds;
}
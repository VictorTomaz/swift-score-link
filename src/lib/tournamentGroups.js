/**
 * Groups rounds that belong to the same multi-flight tournament.
 * A parent round (no parent_round_id) and its child flights (with
 * parent_round_id pointing to the parent) are grouped together.
 * Standalone rounds form groups of 1.
 *
 * @param {Array} rounds - flat list of Round records
 * @returns {Array<Array>} - array of groups, each sorted by flight_number then date
 */
export function groupRoundsByTournament(rounds) {
  const groups = new Map();

  for (const round of rounds) {
    const key = round.parent_round_id || round.id;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(round);
  }

  const result = [];
  for (const [, group] of groups) {
    group.sort((a, b) => {
      const fa = a.flight_number || 1;
      const fb = b.flight_number || 1;
      if (fa !== fb) return fa - fb;
      return new Date(a.date || 0) - new Date(b.date || 0);
    });
    result.push(group);
  }

  return result;
}
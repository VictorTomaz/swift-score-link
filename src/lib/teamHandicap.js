/**
 * Compute a team's handicap value based on the selected handicap formula.
 *
 * @param {Array} players - team members (with course_handicap)
 * @param {string} formula - hcp_formula: combined_avg | combined_85 | usga_scramble | sum
 * @returns {number|null} computed team handicap (rounded)
 */
export function computeTeamHandicap(players, formula) {
  const handicaps = (players || [])
    .filter((p) => p && p.course_handicap != null)
    .map((p) => Number(p.course_handicap))
    .filter((n) => !isNaN(n))
    .sort((a, b) => a - b); // ascending: low → high

  if (handicaps.length === 0) return null;

  const sum = handicaps.reduce((a, b) => a + b, 0);
  const count = handicaps.length;

  switch (formula) {
    case 'none':
      return 0;
    case 'individual':
      // No team-level adjustment — each player's own course handicap applies per hole.
      return null;
    case 'combined_avg':
      return Math.round(sum / count);
    case 'avg_30':
      return Math.round((sum / count) * 0.70);
    case 'sum':
      return sum;
    case 'usga_scramble': {
      // USGA scramble allowances applied low → high handicap:
      // 2P: 35% / 15%  ·  3P: 30% / 20% / 10%  ·  4P: 25% / 20% / 15% / 10%
      let pct;
      if (count >= 4) pct = [0.25, 0.20, 0.15, 0.10];
      else if (count === 3) pct = [0.30, 0.20, 0.10];
      else pct = [0.35, 0.15];
      let total = 0;
      for (let i = 0; i < count && i < pct.length; i++) {
        total += handicaps[i] * pct[i];
      }
      return Math.round(total);
    }
    case 'split_60_40': {
      // 60% low / 40% high — uses lowest and highest handicaps on the team
      if (count === 1) return Math.round(handicaps[0] * 0.60);
      return Math.round(handicaps[0] * 0.60 + handicaps[count - 1] * 0.40);
    }
    case 'split_35_15': {
      // 35% low / 15% high — uses lowest and highest handicaps on the team
      if (count === 1) return Math.round(handicaps[0] * 0.35);
      return Math.round(handicaps[0] * 0.35 + handicaps[count - 1] * 0.15);
    }
    case 'combined_85':
    default:
      return Math.round(sum * 0.85);
  }
}

const FORMULA_LABELS = {
  none: 'No Handicap',
  individual: 'Individual (Per-Player)',
  combined_avg: 'Combined Average',
  avg_30: '70% of Combined Average',
  combined_85: '85% of Combined',
  usga_scramble: 'USGA Scramble',
  split_60_40: '60/40 (60% Low / 40% High)',
  split_35_15: '35/15 (35% Low / 15% High)',
  sum: 'Full Combined',
};

export function handicapFormulaLabel(formula) {
  return FORMULA_LABELS[formula] || '85% of Combined';
}
/**
 * Las Vegas team format — "1 Gross / 2 Net".
 *
 * On each hole the team counts THREE balls: one player's gross score plus two
 * other players' net scores. The assignment is OPTIMIZED — every valid
 * combination is tried and the lowest total wins, so the gross ball is not
 * necessarily the lowest raw gross on the card. (Usually it lands on the
 * lowest-handicap player, freeing the higher handicaps to contribute net.)
 *
 * Each player contributes at most once — their gross OR their net, never both.
 */

/**
 * Strokes received on a hole based on course handicap. Handles plus handicaps
 * (strokes given back on the easiest holes) and handicaps above 18/36.
 * Shared with teamScoreEngine so both use identical stroke allocation.
 */
export function holeStrokes(courseHandicap, holeHcpIndex) {
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

/** True when the round's main game is the Las Vegas 1-gross/2-net format. */
export function isVegasFormat(round) {
  if (round?.game_type === "team_las_vegas") return true;
  if (round?.team_mode === true && round?.team_format === "las_vegas") return true;
  return false;
}

function toNumber(s) {
  if (typeof s === "string" && s.trim().toUpperCase() === "X") return null;
  const n = typeof s === "number" ? s : Number(s);
  return !isNaN(n) && n > 0 ? n : null;
}

/**
 * The single handicap allowance used EVERYWHERE in a Vegas round — the team
 * Gross/Net rows, the dots printed on the scorecard, and every individual net
 * side game (net skins, net KPs, net deuces).
 *
 * Whichever allowance the host picked for the round applies to all of it, so a
 * player's dots mean exactly one thing all day. 0.85 when the round uses the
 * 85% four-ball formula, otherwise 1 (full handicap).
 */
const FORMULA_PERCENT = { combined_85: 85, avg_30: 70, none: 0 };

/**
 * The allowance percentage for a Vegas round. A custom vegas_hcp_percent wins
 * (the host can use ANY percentage, recommended or not); otherwise it's derived
 * from the round's handicap formula.
 */
export function vegasHcpPercent(round) {
  const custom = round?.vegas_hcp_percent;
  if (custom !== null && custom !== undefined && custom !== "" && !isNaN(Number(custom))) {
    return Number(custom);
  }
  const pct = FORMULA_PERCENT[round?.hcp_formula];
  return pct != null ? pct : 100;
}

export function netHandicapScale(round) {
  if (!isVegasFormat(round)) return 1;
  return vegasHcpPercent(round) / 100;
}

/** Apply a handicap allowance, preserving plus-handicap sign. */
export function scaleHandicap(hcpVal, scale) {
  if (scale === 1 || hcpVal == null) return hcpVal;
  return hcpVal < 0
    ? -Math.round(Math.abs(hcpVal) * scale)
    : Math.round(hcpVal * scale);
}

/**
 * A player's handicap value for net scoring — their own Course Handicap
 * (best-ball style, never a combined team handicap), with the round's
 * allowance applied.
 */
function playerHandicap(p, scaleOrFormula) {
  const ch = p.course_handicap != null ? Number(p.course_handicap) : null;
  const hcpVal = ch != null
    ? ch
    : (p.is_plus_handicap ? -Math.abs(p.handicap || 0) : Math.abs(p.handicap || 0));
  const scale = typeof scaleOrFormula === "number"
    ? scaleOrFormula
    : (FORMULA_PERCENT[scaleOrFormula] != null ? FORMULA_PERCENT[scaleOrFormula] / 100 : 1);
  return scaleHandicap(hcpVal, scale);
}

/**
 * Optimized 1-gross + 2-net score for one hole.
 * Returns null when fewer than three players have a valid score on the hole.
 *
 * @returns {{ total:number, gross_player_id:string, net_player_ids:string[] }|null}
 */
export function vegasHoleScore(members, holeIdx, hcpIndexes, scaleOrFormula) {
  const entries = [];
  for (const p of members || []) {
    const gross = toNumber((p.scores || [])[holeIdx]);
    if (gross == null) continue;
    const strokes = holeStrokes(playerHandicap(p, scaleOrFormula), (hcpIndexes || [])[holeIdx] || 0);
    entries.push({ player_id: p.player_id, name: p.name, gross, net: gross - strokes });
  }
  if (entries.length < 3) return null;

  let best = null;
  // Try every player as the gross ball; the two lowest nets among the rest fill
  // the net slots. Enumerating all gross choices guarantees the minimum total.
  for (let g = 0; g < entries.length; g++) {
    const others = entries.filter((_, i) => i !== g).sort((a, b) => a.net - b.net);
    const nets = others.slice(0, 2);
    if (nets.length < 2) continue;
    const total = entries[g].gross + nets[0].net + nets[1].net;
    if (best === null || total < best.total) {
      best = {
        total,
        gross_player_id: entries[g].player_id,
        net_player_ids: nets.map(n => n.player_id),
      };
    }
  }
  return best;
}
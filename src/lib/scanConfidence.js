// Per-hole review flags for a scanned row. Flags are plausibility-based:
// a hole is flagged when the score is far off par for that hole. (The old
// cross-model disagreement flag is gone with the second scan pass — see
// ScorecardScanner; _disagreements is still honoured if ever reinstated.)
// The handwritten OUT/IN totals on the card are NOT used as a check — players
// frequently add them up wrong, so they'd produce false alarms.
// Returns an 18-slot array of reason strings ('' = no flag).
export function computeHoleFlags(holes, extracted, par) {
  const flags = Array(18).fill('');
  const parArr = Array.isArray(par) && par.length === 18 ? par : Array(18).fill(4);
  const disagreements = extracted?._disagreements;

  holes.forEach((h, i) => {
    if (disagreements?.has?.(i)) {
      flags[i] = 'Unclear — verify this score';
      return;
    }
    if (h === '' || h === 'X') return;

    const n = parseInt(h, 10);
    const p = parArr[i] || 4;
    if (n <= p - 3 && n !== 1) flags[i] = `Unusually low for par ${p}`;
    else if (n >= p + 5) flags[i] = `Unusually high for par ${p}`;
  });

  return flags;
}
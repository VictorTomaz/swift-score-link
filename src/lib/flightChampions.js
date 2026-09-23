/**
 * Flight champions & playoff declaration.
 *
 * Opt-in per tournament (champion_enabled), configured in Tournament Logistics.
 * The host picks which divisions to crown (gross, net, or both). When a
 * division ties for first the host names the playoff winner. New rounds are
 * always Title Only: the tie money still splits evenly. Legacy rounds that were
 * recorded with Winner Takes All keep that behaviour so past payouts never change.
 *
 * A separate per-flight Champion Purse (club/sponsor money) is paid to each
 * division champion on top of the place payouts — never carved from them.
 */

export const CHAMPION_MODES = {
  TITLE_ONLY: "title_only",
  WINNER_TAKE_ALL: "winner_take_all",
};

export const DIVISIONS = ["gross", "net"];

/**
 * Champion settings are written to EVERY round of the series, so any surface
 * (results page, email, PDF, public link) can read them straight off the round.
 */
export function getChampionConfig(round) {
  const divisions = Array.isArray(round?.champion_divisions) && round.champion_divisions.length > 0
    ? round.champion_divisions.filter((d) => DIVISIONS.includes(d))
    : ["gross"];
  const mode = round?.champion_payout_mode || CHAMPION_MODES.TITLE_ONLY;
  return {
    enabled: !!round?.champion_enabled,
    mode,
    isLegacyWinnerTakeAll: mode === CHAMPION_MODES.WINNER_TAKE_ALL,
    divisions: divisions.length > 0 ? divisions : ["gross"],
    purses: round?.champion_purse_per_flight && typeof round.champion_purse_per_flight === "object"
      ? round.champion_purse_per_flight
      : {},
    champions: Array.isArray(round?.flight_champions) ? round.flight_champions : [],
  };
}

/** Champion Purse amount for one flight + division (0 when not set). */
export function getPurse(round, flightNumber, division) {
  const entry = getChampionConfig(round).purses[String(flightNumber || 1)];
  return Number(entry?.[division]) || 0;
}

const scoreKey = (division) => (division === "net" ? "net_total" : "gross_total");
const resultsKey = (division) => (division === "net" ? "net_results" : "gross_results");

/** The player(s) tied for the lowest score in a division. */
export function getLeaders(results, division = "gross") {
  const key = scoreKey(division);
  const rows = (results?.[resultsKey(division)] || []).filter(
    (r) => !r.disqualified && r[key] != null
  );
  if (rows.length === 0) return [];
  const best = Math.min(...rows.map((r) => r[key]));
  return rows
    .filter((r) => r[key] === best)
    .map((r) => ({ ...r, score: r[key] }));
}

export function getGrossLeaders(results) {
  return getLeaders(results, "gross");
}

export function getNetLeaders(results) {
  return getLeaders(results, "net");
}

/** Entries without a division were declared before net champions existed — they're gross. */
export function championFor(champions, flightNumber, division = "gross") {
  const fn = String(flightNumber || 1);
  return (champions || []).find(
    (c) => String(c.flight_number || 1) === fn && (c.division || "gross") === division
  ) || null;
}

/**
 * A declared champion only counts while they still hold (or share) the lead, so
 * a later score edit silently retires a stale champion.
 */
export function resolveChampion(results, champions, flightNumber, division = "gross") {
  const champ = championFor(champions, flightNumber, division);
  if (!champ) return null;
  const leader = getLeaders(results, division).find((l) => l.player_id === champ.player_id);
  if (!leader) return null;
  return {
    ...champ,
    name: champ.player_name || leader.name,
    score: leader.score,
    gross_total: leader.gross_total,
  };
}

export function resolveNetChampion(results, champions, flightNumber) {
  return resolveChampion(results, champions, flightNumber, "net");
}

/**
 * LEGACY ONLY — winner-take-all rounds recorded before Title Only became the
 * standard. Un-splits a gross tie for first: the champion takes 1st-place money
 * and the others cascade down. Total paid is unchanged. New rounds never use it.
 */
export function applyChampionPayouts(round, results) {
  const { enabled, mode, champions } = getChampionConfig(round);
  if (!enabled || mode !== CHAMPION_MODES.WINNER_TAKE_ALL) return results;

  const places = results.gross_places || [];
  if (places.length === 0) return results;

  const flightStandings = Array.isArray(results.all_flight_standings) && results.all_flight_standings.length > 0
    ? results.all_flight_standings.map((fs) => ({ flightNumber: fs.flightNumber || 1, gross_results: fs.gross_results || [] }))
    : [{ flightNumber: round?.flight_number || 1, gross_results: results.flight_own_gross || results.gross_results || [] }];

  let payouts = results.payouts || [];
  let changed = false;
  flightStandings.forEach((fs) => {
    const next = applyFlightChampionPayout(fs, champions, fs.flightNumber, places, payouts);
    if (next) { payouts = next; changed = true; }
  });
  return changed ? { ...results, payouts, champion_winner_take_all: true } : results;
}

function applyFlightChampionPayout(flightResults, champions, flightNumber, places, payouts) {
  const champ = resolveChampion(flightResults, champions, flightNumber, "gross");
  if (!champ) return null;

  const leaders = getGrossLeaders(flightResults);
  if (leaders.length < 2) return null;

  const tiedIds = [
    champ.player_id,
    ...leaders.filter((l) => l.player_id !== champ.player_id).map((l) => l.player_id),
  ];
  const combined = tiedIds.reduce(
    (sum, id) => sum + (payouts.find((p) => p.player_id === id)?.gross_payout || 0),
    0
  );
  if (combined <= 0) return null;

  const weights = tiedIds.map((_, i) => places[i] || 0);
  const weightSum = weights.reduce((a, b) => a + b, 0);
  const amounts = weightSum > 0 ? weights.map((w) => (w / weightSum) * combined) : weights;

  const byId = {};
  tiedIds.forEach((id, i) => { byId[id] = amounts[i]; });

  return payouts.map((p) => {
    if (!(p.player_id in byId)) return p;
    const gp = byId[p.player_id];
    return {
      ...p,
      gross_payout: gp,
      total_payout:
        gp + (p.net_payout || 0) + (p.field_gross_payout || 0) + (p.field_net_payout || 0) +
        (p.kp_payout || 0) + (p.gross_skins_payout || 0) + (p.net_skins_payout || 0) +
        (p.deuce_payout || 0),
    };
  });
}

/**
 * Champion rows for display — one per flight per division, in flight order.
 * Undeclared ties congratulate all tied leaders and mark the purse as awaiting
 * a playoff; an outright leader is the champion automatically and gets the purse.
 * flights: [{ flightNumber, label, results }]
 *
 * Row: { key, flightNumber, label, division, divisionLabel, name, score,
 *        gross_total, via_playoff, purse, purse_pending }
 * divisionLabel is null when only gross is crowned (the original look).
 */
export function buildChampionRows(round, flights) {
  const { enabled, champions, divisions } = getChampionConfig(round);
  if (!enabled) return [];
  const showDivision = !(divisions.length === 1 && divisions[0] === "gross");
  const rows = [];
  (flights || []).forEach((f) => {
    divisions.forEach((division) => {
      const leaders = getLeaders(f.results, division);
      if (leaders.length === 0) return;
      const champ = resolveChampion(f.results, champions, f.flightNumber, division);
      const purse = getPurse(round, f.flightNumber, division);
      const decided = !!champ || leaders.length === 1;
      rows.push({
        key: `${f.flightNumber}-${division}`,
        flightNumber: f.flightNumber,
        label: f.label,
        division,
        divisionLabel: showDivision ? (division === "net" ? "Net Champion" : "Gross Champion") : null,
        player_id: champ ? champ.player_id : (leaders.length === 1 ? leaders[0].player_id : null),
        name: champ ? champ.name : leaders.map((l) => l.name || "—").join(" & "),
        score: champ ? champ.score : leaders[0].score,
        gross_total: champ ? champ.score : leaders[0].score,
        via_playoff: !!champ?.via_playoff,
        purse,
        purse_pending: purse > 0 && !decided,
      });
    });
  });
  return rows;
}

/** Champion Purse owed per player_id — only decided champions get paid. */
export function championPurseMap(rows) {
  const map = {};
  (rows || []).forEach((r) => {
    if (r.purse > 0 && !r.purse_pending && r.player_id) {
      map[r.player_id] = (map[r.player_id] || 0) + r.purse;
    }
  });
  return map;
}

/** Total Champion Purse money across the given rows. */
export function totalPurse(rows) {
  return (rows || []).reduce((s, r) => s + (r.purse || 0), 0);
}
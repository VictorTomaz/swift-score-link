import { computeStandingsDisplay, computeTeamStandingsDisplay, rankLabel } from "@/lib/standingsRanks";

/**
 * Builds the per-flight standings + payout sections for the shareable results
 * text of a multi-flight tournament.
 *
 * `flightData` comes straight from the Tournament Results page, which already
 * resolves flights (and each player's flight) with roster-based fallbacks:
 *   { flights: [{ flightNumber, flightLabel, gross_results, net_results }],
 *     playerFlightMap: { player_id: "1" } }
 *
 * Returns [] when there's no flight data (caller falls back to flat standings).
 */
/**
 * Fallback flight builder — derives flights straight from the combined results
 * when the caller didn't supply flightData. Uses all_flight_standings when
 * present, otherwise groups the field standings by each player's `flight` label.
 */
function deriveFlights(results) {
  if (results.all_flight_standings?.length > 0) {
    return results.all_flight_standings.map(fs => ({
      flightNumber: String(fs.flightNumber),
      flightLabel: fs.flightLabel || fs.flight_name || `Flight ${fs.flightNumber}`,
      gross_results: fs.gross_results || [],
      net_results: fs.net_results || [],
      team_gross_results: fs.team_gross_results || [],
      team_net_results: fs.team_net_results || [],
    }));
  }
  const byFlight = {};
  const add = (list, row) => {
    const m = String(row.flight || '').match(/Flight\s*(\d+)/i);
    if (!m) return;
    const fn = m[1];
    if (!byFlight[fn]) byFlight[fn] = { flightNumber: fn, flightLabel: `Flight ${fn}`, gross_results: [], net_results: [] };
    byFlight[fn][list].push(row);
  };
  (results.gross_results || []).forEach(r => add('gross_results', r));
  (results.net_results || []).forEach(r => add('net_results', r));
  return Object.values(byFlight);
}

/**
 * Maps each player_id to its flight label (e.g. "Senior") so side games
 * (skins, KPs, deuces) can be grouped by flight in the shared text.
 * Returns {} when the tournament has no flights.
 */
export function buildPlayerFlightLabels(results, flightData = {}) {
  const flights = (flightData.flights?.length > 0) ? flightData.flights : deriveFlights(results);
  if (flights.length === 0) return {};
  const labels = {};
  // Ordering hint so side-game groups print in flight order
  labels.__order = flights
    .slice()
    .sort((a, b) => Number(a.flightNumber || 0) - Number(b.flightNumber || 0))
    .map(f => f.flightLabel || `Flight ${f.flightNumber}`);
  labels.__byNumber = {};
  flights.forEach(f => {
    labels.__byNumber[String(f.flightNumber)] = f.flightLabel || `Flight ${f.flightNumber}`;
  });
  flights.forEach(f => {
    const label = f.flightLabel || `Flight ${f.flightNumber}`;
    [...(f.gross_results || []), ...(f.net_results || [])].forEach(r => {
      if (r.player_id && !labels[r.player_id]) labels[r.player_id] = label;
    });
  });
  // playerFlightMap holds flight numbers — fill in anyone missing from standings
  const numberToLabel = {};
  flights.forEach(f => { numberToLabel[String(f.flightNumber)] = f.flightLabel || `Flight ${f.flightNumber}`; });
  Object.entries(flightData.playerFlightMap || {}).forEach(([pid, fn]) => {
    if (!labels[pid] && numberToLabel[String(fn)]) labels[pid] = numberToLabel[String(fn)];
  });
  return labels;
}

export function formatFlightSections(results, isStableford, flightData = {}, round = null) {
  const flights = (flightData.flights?.length > 0)
    ? flightData.flights
    : deriveFlights(results);
  if (flights.length === 0) return [];

  const lines = [];
  const payouts = results.payouts || [];
  const flightMap = flightData.playerFlightMap || {};
  const isTeamEvent = !!(round?.game_type && round.game_type !== "individual");
  const teamFormatLabel = (() => {
    const gt = round?.game_type || "";
    if (gt === "team_scramble" || round?.team_format === "scramble") return "Scramble";
    if (gt === "team_chapman") return "Chapman";
    if (gt === "team_6_6_6") return "6-6-6";
    if (gt === "team_aggregate" || round?.team_format === "aggregate") return "Aggregate";
    return "Best Ball";
  })();

  // Secondary lookup — which flight's standings a player appears in, so a
  // payout row is never dropped from every flight section.
  const standingsFlight = {};
  flights.forEach(f => {
    [...(f.gross_results || []), ...(f.net_results || [])].forEach(r => {
      if (r.player_id && !standingsFlight[r.player_id]) standingsFlight[r.player_id] = String(f.flightNumber);
    });
  });

  const sorted = [...flights].sort((a, b) => Number(a.flightNumber || 0) - Number(b.flightNumber || 0));

  sorted.forEach(f => {
    const fn = String(f.flightNumber);
    const label = f.flightLabel || `Flight ${fn}`;
    const teamGross = f.team_gross_results || [];
    const teamNet = f.team_net_results || [];

    if (isTeamEvent && (teamGross.length > 0 || teamNet.length > 0)) {
      const { grossDisplay: tgDisplay, netDisplay: tnDisplay } = computeTeamStandingsDisplay(teamGross, teamNet, isStableford);
      lines.push(`━━━ ${label.toUpperCase()} ━━━`);
      if (teamGross.length > 0) {
        lines.push(`🏆 Team Gross ${teamFormatLabel}`);
        teamGross.forEach(t => {
          const rank = rankLabel(tgDisplay[t.team_id]);
          if (t.disqualified) { lines.push(`${rank}. ${t.team_name} — DQ`); return; }
          const perMember = t.gross_payout > 0 && t.members?.length ? t.gross_payout / t.members.length : 0;
          lines.push(`${rank}. ${t.team_name} — ${t.best_ball_gross}${isStableford ? " pts" : ""}${perMember > 0.01 ? ` — $${perMember.toFixed(2)}/player` : ""}`);
        });
        lines.push("");
      }
      if (teamNet.length > 0) {
        lines.push(`📊 Team Net ${teamFormatLabel}`);
        teamNet.forEach(t => {
          const rank = rankLabel(tnDisplay[t.team_id]);
          if (t.disqualified) { lines.push(`${rank}. ${t.team_name} — DQ`); return; }
          const perMember = t.net_payout > 0 && t.members?.length ? t.net_payout / t.members.length : 0;
          lines.push(`${rank}. ${t.team_name} — ${t.best_ball_net}${isStableford ? " pts" : ""}${perMember > 0.01 ? ` — $${perMember.toFixed(2)}/player` : ""}`);
        });
        lines.push("");
      }
      return;
    }

    const gross = f.gross_results || [];
    const net = f.net_results || [];
    if (gross.length === 0 && net.length === 0) return;

    const { grossDisplay, netDisplay } = computeStandingsDisplay(gross, net, payouts, isStableford);

    lines.push(`━━━ ${label.toUpperCase()} ━━━`);

    if (gross.length > 0) {
      lines.push(isStableford ? "🏆 Gross Points" : "🏆 Gross Standings");
      gross.forEach(p => {
        const rank = rankLabel(grossDisplay[p.player_id]);
        if (p.disqualified) { lines.push(`${rank}. ${p.name} — DQ`); return; }
        const pay = payouts.find(x => x.player_id === p.player_id)?.gross_payout || 0;
        lines.push(`${rank}. ${p.name} — ${p.gross_total}${isStableford ? " pts" : ""}${pay > 0.01 ? ` — $${pay.toFixed(2)}` : ""}`);
      });
      lines.push("");
    }

    if (net.length > 0) {
      lines.push(isStableford ? "📊 Net Points" : "📊 Net Standings");
      net.forEach(p => {
        const rank = rankLabel(netDisplay[p.player_id]);
        if (p.disqualified) { lines.push(`${rank}. ${p.name} — DQ`); return; }
        const pay = payouts.find(x => x.player_id === p.player_id)?.net_payout || 0;
        lines.push(`${rank}. ${p.name} — ${p.net_total}${isStableford ? " pts" : ""}${pay > 0.01 ? ` — $${pay.toFixed(2)}` : ""}`);
      });
      lines.push("");
    }

  });

  // Field prizes (all flights combined)
  const fieldLines = [];
  const fg = results.field_gross_winner;
  const fnet = results.field_net_winner;
  if (fg?.name) fieldLines.push(`   Low Gross of the Field: ${fg.name}${results.field_gross_prize > 0 ? ` — $${Number(results.field_gross_prize).toFixed(2)}` : ""}`);
  if (fnet?.name) fieldLines.push(`   Low Net of the Field: ${fnet.name}${results.field_net_prize > 0 ? ` — $${Number(results.field_net_prize).toFixed(2)}` : ""}`);
  if (fieldLines.length > 0) {
    lines.push("🥇 FIELD PRIZES");
    lines.push(...fieldLines);
    lines.push("");
  }

  return lines;
}
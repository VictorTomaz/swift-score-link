import { computeStandingsDisplay, computeTeamStandingsDisplay, rankLabel } from "@/lib/standingsRanks";
import { formatFlightSections, buildPlayerFlightLabels } from "@/lib/formatFlightResults";
import { formatSideGamesSections, sideGameWinnerLabel, shareSuffix } from "@/lib/formatSideGames";
import { buildTeamNameByPlayer } from "@/lib/teamPlayerLookup";

/**
 * Groups side-game entries (skins, KPs, deuces) by the winner's flight.
 * With no flight labels, returns a single unlabeled group.
 */
function groupByFlight(entries, flightLabels) {
  if (!flightLabels || !flightLabels.__order || flightLabels.__order.length < 2) {
    return [{ label: null, entries }];
  }
  const byNumber = flightLabels.__byNumber || {};
  const groups = new Map();
  entries.forEach(e => {
    const label =
      flightLabels[e.player_id] ||
      byNumber[String(e.flight)] ||
      (typeof e.flight === "string" ? e.flight : null) ||
      "Other";
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(e);
  });
  const order = [...flightLabels.__order, "Other"];
  return [...groups.entries()]
    .sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
    .map(([label, items]) => ({ label, entries: items }));
}

/**
 * Returns the score-result label (Eagle, Birdie, Par, Bogey, etc.) for a given
 * score vs par. Falls back to null if score/par can't be determined.
 */
function scoreResultLabel(score, par) {
  const s = Number(score);
  const p = Number(par);
  if (isNaN(s) || isNaN(p) || s <= 0) return null;
  const diff = s - p;
  if (diff <= -3) return "Albatross";
  if (diff === -2) return "Eagle";
  if (diff === -1) return "Birdie";
  if (diff === 0) return "Par";
  if (diff === 1) return "Bogey";
  if (diff === 2) return "Double Bogey";
  if (diff >= 3) return `+${diff} Bogey`;
  return null;
}

/**
 * Formats round results into a clean, shareable text message
 * mirroring the layout of the Results page.
 */
export function formatResultsText(round, results, dayLabel = null, flightData = {}) {
  if (!round || !results) return "";

  const lines = [];
  const isStableford = !!results.stableford;
  const dayTag = dayLabel ? ` — ${dayLabel}` : "";
  const { grossDisplay, netDisplay } = computeStandingsDisplay(
    results.gross_results, results.net_results, results.payouts, isStableford
  );
  const eventName = round.event_name || "Golf Results";
  const courseName = round.course_name || "";
  const dateStr = round.date
    ? new Date(round.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
    : "";

  // Header
  lines.push(`🏌️ ${eventName}`);
  if (courseName) lines.push(`📍 ${courseName}`);
  if (dateStr) lines.push(`📅 ${dateStr}`);
  lines.push("");

  // Pot breakdown (mirrors the grid cards on Results page)
  if (results.total_pot > 0) {
    lines.push(`💰 Total Pot: $${Math.round(results.total_pot)}`);
    const potItems = [];
    if (results.gross_pot > 0) potItems.push(`Gross: $${Math.round(results.gross_pot)}`);
    if (results.net_pot > 0) potItems.push(`Net: $${Math.round(results.net_pot)}`);
    if (results.side_pot > 0) potItems.push(`Side Games: $${Math.round(results.side_pot)}`);
    if (results.kp_separate_pot > 0) potItems.push(`KP Pot: $${Math.round(results.kp_separate_pot)}`);
    if (results.deuce_pot > 0) potItems.push(`Deuce Pot: $${Math.round(results.deuce_pot)}`);
    if (potItems.length > 0) lines.push(`   ${potItems.join("  |  ")}`);
    lines.push("");
  }

  // Team vs individual standings — multi-day non-final day holds the main purse
  const isTeamEvent = !!(round.game_type && round.game_type !== "individual");
  const holdMain = !!round.is_multi_day && !results.is_series_cumulative;

  const flightSections = formatFlightSections(results, isStableford, flightData, round);
  const hasFlights = flightSections.length > 0;
  const flightLabels = hasFlights ? buildPlayerFlightLabels(results, flightData) : {};

  if (hasFlights) {
    lines.push(...flightSections);
  } else if (holdMain) {
    lines.push("🏆 MAIN STANDINGS HELD");
    lines.push("   Gross & net purses held until the final round.");
    lines.push("   Side games (skins, KPs, deuces) settle today.");
    lines.push("");
  } else if (isTeamEvent && (results.team_vegas_results || []).length > 0) {
    // Las Vegas (1 gross / 2 net): one combined leaderboard, one prize list.
    const vegas = results.team_vegas_results;
    const eligible = vegas.filter(t => !t.disqualified);
    lines.push("🏆 LAS VEGAS — 1 GROSS / 2 NET");
    vegas.forEach(t => {
      if (t.disqualified) { lines.push(`—. ${t.team_name} — DQ`); return; }
      const better = eligible.filter(x => x.vegas_total < t.vegas_total).length;
      const tied = eligible.filter(x => x.vegas_total === t.vegas_total).length > 1;
      const perMember = t.payout > 0 && t.members?.length ? t.payout / t.members.length : 0;
      lines.push(`${tied ? "T" : ""}${better + 1}. ${t.team_name} — ${t.vegas_total}${perMember > 0.01 ? ` — $${perMember.toFixed(2)}/player` : ""}`);
    });
    lines.push("");
  } else if (isTeamEvent) {
    const teamGross = results.team_gross_results || [];
    const teamNet = results.team_net_results || [];
    const { grossDisplay: tgDisplay, netDisplay: tnDisplay } = computeTeamStandingsDisplay(teamGross, teamNet, isStableford);
    const formatLabel = (() => {
      const gt = round.game_type || "";
      if (gt === "team_scramble" || round.team_format === "scramble") return "Scramble";
      if (gt === "team_chapman") return "Chapman";
      if (gt === "team_6_6_6") return "6-6-6";
      if (gt === "team_aggregate" || round.team_format === "aggregate") return "Aggregate";
      return "Best Ball";
    })();
    if (teamGross.length > 0) {
      lines.push(`🏆 TEAM GROSS ${formatLabel.toUpperCase()}`);
      teamGross.forEach((t) => {
        const label = rankLabel(tgDisplay[t.team_id]);
        if (t.disqualified) { lines.push(`${label}. ${t.team_name} — DQ`); return; }
        const perMember = t.gross_payout > 0 && t.members?.length ? t.gross_payout / t.members.length : 0;
        lines.push(`${label}. ${t.team_name} — ${t.best_ball_gross}${isStableford ? ' pts' : ''}${perMember > 0.01 ? ` — $${perMember.toFixed(2)}/player` : ""}`);
      });
      lines.push("");
    }
    if (teamNet.length > 0) {
      lines.push(`📊 TEAM NET ${formatLabel.toUpperCase()}`);
      teamNet.forEach((t) => {
        const label = rankLabel(tnDisplay[t.team_id]);
        if (t.disqualified) { lines.push(`${label}. ${t.team_name} — DQ`); return; }
        const perMember = t.net_payout > 0 && t.members?.length ? t.net_payout / t.members.length : 0;
        lines.push(`${label}. ${t.team_name} — ${t.best_ball_net}${isStableford ? ' pts' : ''}${perMember > 0.01 ? ` — $${perMember.toFixed(2)}/player` : ""}`);
      });
      lines.push("");
    }
  } else {
    // Gross standings
    const grossStandings = results.gross_results || [];
    if (grossStandings.length > 0) {
      lines.push(isStableford ? "🏆 GROSS POINTS" : "🏆 GROSS STANDINGS");
      grossStandings.forEach((p) => {
        const display = grossDisplay[p.player_id];
        const label = rankLabel(display);
        if (p.disqualified) {
          lines.push(`${label}. ${p.name} — DQ`);
          return;
        }
        const payout = results.payouts?.find(x => x.player_id === p.player_id);
        const grossPayout = payout?.gross_payout || 0;
        lines.push(`${label}. ${p.name} — ${p.gross_total}${isStableford ? ' pts' : ''}${grossPayout > 0.01 ? ` — $${grossPayout.toFixed(2)}` : ""}`);
      });
      lines.push("");
    }

    // Net standings
    const netStandings = results.net_results || [];
    if (netStandings.length > 0) {
      lines.push(isStableford ? "📊 NET POINTS" : "📊 NET STANDINGS");
      netStandings.forEach((p) => {
        const display = netDisplay[p.player_id];
        const label = rankLabel(display);
        if (p.disqualified) {
          lines.push(`${label}. ${p.name} — DQ`);
          return;
        }
        const payout = results.payouts?.find(x => x.player_id === p.player_id);
        const netPayout = payout?.net_payout || 0;
        lines.push(`${label}. ${p.name} — ${p.net_total}${isStableford ? ' pts' : ''}${netPayout > 0.01 ? ` — $${netPayout.toFixed(2)}` : ""}`);
      });
      lines.push("");
    }
  }

  // Multi-flight / multi-day: side games are listed per flight-day from each
  // round's own results (the final round's combined results only carry the
  // final flight's skins), so the flat blocks below are skipped.
  // Team-aware KP/deuce naming for the single-round (non-series) blocks below.
  const sideGameTeams = buildTeamNameByPlayer([round]);

  const perFlightSideGames = formatSideGamesSections(flightData.sideGames || []);
  const useSideGameEntries = perFlightSideGames.length > 0;
  if (useSideGameEntries) lines.push(...perFlightSideGames);

  // Side games day indicator — multi-day series settle side games day-by-day
  if (dayTag && !useSideGameEntries) {
    lines.push(`🎲 SIDE GAMES${dayTag}`);
    lines.push("");
  }

  // Gross Skins
  const grossSkins = results.gross_skins || [];
  const showGrossSkins = round.gross_skins_enabled || (results.gross_skins_allocated_pot > 0) || grossSkins.length > 0;
  if (showGrossSkins && !useSideGameEntries) {
    const pot = results.gross_skins_allocated_pot || results.gross_skins_separate_pot || 0;
    lines.push(`⛳ GROSS SKINS${pot > 0 ? ` ($${Math.round(pot)} pot)` : ""}`);
    if (grossSkins.length > 0) {
      groupByFlight(grossSkins, flightLabels).forEach(group => {
        if (group.label) lines.push(`   ── ${group.label} ──`);
        group.entries.forEach(skin => {
          const playerName = round.players?.find(p => p.player_id === skin.player_id)?.name || skin.name || skin.player_id;
          const carry = skin.carryover_from?.length > 0 ? ` (carries ${skin.carryover_from.join(",")})` : "";
          const resultType = skin.achievement || scoreResultLabel(skin.score, round.par?.[skin.hole - 1]);
          lines.push(`   Hole ${skin.hole} — ${playerName}${resultType ? ` — ${resultType}` : ""}${carry}`);
          if (skin.value > 0) {
            lines.push(`   +$${skin.value.toFixed(2)}`);
          }
        });
      });
    } else {
      lines.push("   No skins won");
    }
    lines.push("");
  }

  // Net Skins
  const netSkins = results.net_skins || [];
  const showNetSkins = round.net_skins_enabled || (results.net_skins_allocated_pot > 0) || netSkins.length > 0;
  if (showNetSkins && !useSideGameEntries) {
    const pot = results.net_skins_allocated_pot || results.net_skins_separate_pot || 0;
    lines.push(`🎯 NET SKINS${pot > 0 ? ` ($${Math.round(pot)} pot)` : ""}`);
    if (netSkins.length > 0) {
      groupByFlight(netSkins, flightLabels).forEach(group => {
        if (group.label) lines.push(`   ── ${group.label} ──`);
        group.entries.forEach(skin => {
          const playerName = round.players?.find(p => p.player_id === skin.player_id)?.name || skin.name || skin.player_id;
          const carry = skin.carryover_from?.length > 0 ? ` (carries ${skin.carryover_from.join(",")})` : "";
          const resultType = skin.achievement || scoreResultLabel(skin.score, round.par?.[skin.hole - 1]);
          lines.push(`   Hole ${skin.hole} — ${playerName}${resultType ? ` — ${resultType}` : ""}${carry}`);
          if (skin.value > 0) {
            lines.push(`   +$${skin.value.toFixed(2)}`);
          }
        });
      });
    } else {
      lines.push("   No skins won");
    }
    lines.push("");
  }

  // KP Winners
  const kpResults = results.kp_results || [];
  if (kpResults.length > 0 && !useSideGameEntries) {
    const kpPot = results.kp_separate_pot > 0 ? ` ($${Math.round(results.kp_separate_pot)} pot)` : "";
    lines.push(`🎯 KP WINNERS${kpPot}`);
    const perEntryAmount = Number(results.kp_per_entry_amount) || 0;
    const kpFoldedIntoSkins = !round.kp_separate_buy_in && (round.gross_skins_enabled || round.net_skins_enabled);
    groupByFlight(kpResults, flightLabels).forEach(group => {
      if (group.label) lines.push(`   ── ${group.label} ──`);
      group.entries.forEach(kp => {
        lines.push(`   Hole ${kp.hole} — ${sideGameWinnerLabel(round, kp.player_id, kp.name, sideGameTeams)}`);
        if (perEntryAmount > 0) {
          lines.push(`   +$${perEntryAmount.toFixed(2)}${shareSuffix(kp.player_id, perEntryAmount, sideGameTeams)}`);
        } else if (kpFoldedIntoSkins) {
          lines.push(`   (included in skins)`);
        }
      });
    });
    lines.push("");
  }

  // Deuces
  if (round.deuce_pot_enabled && !useSideGameEntries) {
    const deuces = results.deuces || [];
    const deucePot = results.deuce_pot > 0 ? ` ($${Math.round(results.deuce_pot)} pot)` : "";
    lines.push(`✌️ DEUCE POT${deucePot}`);
    if (deuces.length > 0) {
      const perDeuceAmount = results.deuce_per_entry_amount || 0;
      groupByFlight(deuces, flightLabels).forEach(group => {
        if (group.label) lines.push(`   ── ${group.label} ──`);
        group.entries.forEach(d => {
          lines.push(`   Hole ${d.hole} — ${sideGameWinnerLabel(round, d.player_id, d.name, sideGameTeams)}`);
          if (perDeuceAmount > 0) {
            lines.push(`   +$${perDeuceAmount.toFixed(2)}${shareSuffix(d.player_id, perDeuceAmount, sideGameTeams)}`);
          }
        });
      });
    } else {
      lines.push("   No deuces this round");
    }
    lines.push("");
  }

  // Final payouts summary
  const payouts = (results.payouts || []).filter(p => p.total_payout > 0.01);
  if (payouts.length > 0) {
    lines.push(hasFlights ? "💵 TOTAL PAYOUTS (ALL FLIGHTS)" : "💵 FINAL PAYOUTS");
    const sortedPayouts = [...payouts].sort((a, b) => b.total_payout - a.total_payout);

    // Team events: group each payout under its team so the message reads as
    // team results rather than a flat list of individual players.
    const teamByPlayer = {};
    if (isTeamEvent) {
      const allTeams = [
        ...(results.team_vegas_results || []),
        ...(results.team_gross_results || []),
        ...(results.team_net_results || []),
        ...(flightData.flights || []).flatMap(f => [...(f.team_gross_results || []), ...(f.team_net_results || [])]),
        ...(results.all_flight_standings || []).flatMap(f => [...(f.team_gross_results || []), ...(f.team_net_results || [])]),
      ];
      allTeams.forEach(t => {
        (t.members || []).forEach(m => {
          if (m.player_id && !teamByPlayer[m.player_id]) teamByPlayer[m.player_id] = t.team_name;
        });
      });
    }

    if (isTeamEvent && Object.keys(teamByPlayer).length > 0) {
      const groups = new Map();
      sortedPayouts.forEach(p => {
        const key = teamByPlayer[p.player_id] || "Other";
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(p);
      });
      const ordered = [...groups.entries()].sort((a, b) => {
        const sum = arr => arr.reduce((s, x) => s + x.total_payout, 0);
        return sum(b[1]) - sum(a[1]);
      });
      ordered.forEach(([teamName, members]) => {
        const teamTotal = members.reduce((s, x) => s + x.total_payout, 0);
        lines.push(`   ${teamName} — $${teamTotal.toFixed(2)}`);
        members.forEach(p => lines.push(`      ${p.name} — $${p.total_payout.toFixed(2)}`));
      });
    } else {
      sortedPayouts.forEach(p => {
        lines.push(`   ${p.name} — $${p.total_payout.toFixed(2)}`);
      });
    }
    lines.push("");
  }

  return lines.join("\n").trim();
}
import { computeStandingsDisplay, computeTeamStandingsDisplay, rankLabel } from "@/lib/standingsRanks";

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
export function formatResultsText(round, results, dayLabel = null) {
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

  if (holdMain) {
    lines.push("🏆 MAIN STANDINGS HELD");
    lines.push("   Gross & net purses held until the final round.");
    lines.push("   Side games (skins, KPs, deuces) settle today.");
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

  // Side games day indicator — multi-day series settle side games day-by-day
  if (dayTag) {
    lines.push(`🎲 SIDE GAMES${dayTag}`);
    lines.push("");
  }

  // Gross Skins
  const grossSkins = results.gross_skins || [];
  const showGrossSkins = round.gross_skins_enabled || (results.gross_skins_allocated_pot > 0) || grossSkins.length > 0;
  if (showGrossSkins) {
    const pot = results.gross_skins_allocated_pot || results.gross_skins_separate_pot || 0;
    lines.push(`⛳ GROSS SKINS${pot > 0 ? ` ($${Math.round(pot)} pot)` : ""}`);
    if (grossSkins.length > 0) {
      grossSkins.forEach(skin => {
        const playerName = round.players?.find(p => p.player_id === skin.player_id)?.name || skin.name || skin.player_id;
        const carry = skin.carryover_from?.length > 0 ? ` (carries ${skin.carryover_from.join(",")})` : "";
        const resultType = skin.achievement || scoreResultLabel(skin.score, round.par?.[skin.hole - 1]);
        lines.push(`   Hole ${skin.hole} — ${playerName}${resultType ? ` — ${resultType}` : ""}${carry}`);
        if (skin.value > 0) {
          lines.push(`   +$${skin.value.toFixed(2)}`);
        }
      });
    } else {
      lines.push("   No skins won");
    }
    lines.push("");
  }

  // Net Skins
  const netSkins = results.net_skins || [];
  const showNetSkins = round.net_skins_enabled || (results.net_skins_allocated_pot > 0) || netSkins.length > 0;
  if (showNetSkins) {
    const pot = results.net_skins_allocated_pot || results.net_skins_separate_pot || 0;
    lines.push(`🎯 NET SKINS${pot > 0 ? ` ($${Math.round(pot)} pot)` : ""}`);
    if (netSkins.length > 0) {
      netSkins.forEach(skin => {
        const playerName = round.players?.find(p => p.player_id === skin.player_id)?.name || skin.name || skin.player_id;
        const carry = skin.carryover_from?.length > 0 ? ` (carries ${skin.carryover_from.join(",")})` : "";
        const resultType = skin.achievement || scoreResultLabel(skin.score, round.par?.[skin.hole - 1]);
        lines.push(`   Hole ${skin.hole} — ${playerName}${resultType ? ` — ${resultType}` : ""}${carry}`);
        if (skin.value > 0) {
          lines.push(`   +$${skin.value.toFixed(2)}`);
        }
      });
    } else {
      lines.push("   No skins won");
    }
    lines.push("");
  }

  // KP Winners
  const kpResults = results.kp_results || [];
  if (kpResults.length > 0) {
    const kpPot = results.kp_separate_pot > 0 ? ` ($${Math.round(results.kp_separate_pot)} pot)` : "";
    lines.push(`🎯 KP WINNERS${kpPot}`);
    const perEntryAmount = Number(results.kp_per_entry_amount) || 0;
    const kpFoldedIntoSkins = !round.kp_separate_buy_in && (round.gross_skins_enabled || round.net_skins_enabled);
    kpResults.forEach(kp => {
      const playerName = round.players?.find(p => p.player_id === kp.player_id)?.name || kp.player_id;
      lines.push(`   Hole ${kp.hole} — ${playerName}`);
      if (perEntryAmount > 0) {
        lines.push(`   +$${perEntryAmount.toFixed(2)}`);
      } else if (kpFoldedIntoSkins) {
        lines.push(`   (included in skins)`);
      }
    });
    lines.push("");
  }

  // Deuces
  if (round.deuce_pot_enabled) {
    const deuces = results.deuces || [];
    const deucePot = results.deuce_pot > 0 ? ` ($${Math.round(results.deuce_pot)} pot)` : "";
    lines.push(`✌️ DEUCE POT${deucePot}`);
    if (deuces.length > 0) {
      const perDeuceAmount = results.deuce_per_entry_amount || 0;
      deuces.forEach(d => {
        const playerName = round.players?.find(p => p.player_id === d.player_id)?.name || d.player_id;
        lines.push(`   Hole ${d.hole} — ${playerName}`);
        if (perDeuceAmount > 0) {
          lines.push(`   +$${perDeuceAmount.toFixed(2)}`);
        }
      });
    } else {
      lines.push("   No deuces this round");
    }
    lines.push("");
  }

  // Final payouts summary
  const payouts = (results.payouts || []).filter(p => p.total_payout > 0);
  if (payouts.length > 0) {
    lines.push("💵 FINAL PAYOUTS");
    payouts.forEach(p => {
      lines.push(`   ${p.name} — $${Math.round(p.total_payout)}`);
    });
    lines.push("");
  }

  return lines.join("\n").trim();
}
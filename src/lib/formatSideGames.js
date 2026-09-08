import { buildTeamNameByPlayer } from "@/lib/teamPlayerLookup";

/**
 * Score-result label (Eagle, Birdie, Par…) for a score vs par.
 */
export function scoreResultLabel(score, par) {
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

const nameFor = (round, playerId, fallback) =>
  round?.players?.find(p => p.player_id === playerId)?.name || fallback || playerId;

/**
 * Team-aware winner label: "Team Name (Winning Player)" when the round runs
 * team side games, otherwise just the player's name.
 */
export function sideGameWinnerLabel(round, playerId, fallback, teamNameByPlayer) {
  const player = nameFor(round, playerId, fallback);
  const team = teamNameByPlayer?.[playerId];
  return team?.name ? `${team.name} (${player})` : player;
}

/** Per-player share line for a team side-game win. */
export function shareSuffix(playerId, amount, teamNameByPlayer) {
  const size = teamNameByPlayer?.[playerId]?.size || 1;
  if (size <= 1 || !(amount > 0)) return "";
  return ` ($${(amount / size).toFixed(2)}/player)`;
}

function skinsLines(title, skins, pot, round) {
  const lines = [`   ${title}${pot > 0 ? ` ($${Math.round(pot)} pot)` : ""}`];
  if (skins.length === 0) {
    lines.push("      No skins won");
    return lines;
  }
  skins.forEach(skin => {
    const label = skin.achievement || scoreResultLabel(skin.score, round.par?.[skin.hole - 1]);
    const carry = skin.carryover_from?.length > 0 ? ` (carries ${skin.carryover_from.join(",")})` : "";
    lines.push(`      Hole ${skin.hole} — ${nameFor(round, skin.player_id, skin.name)}${label ? ` — ${label}` : ""}${carry}`);
    if (skin.value > 0) lines.push(`      +$${skin.value.toFixed(2)}`);
  });
  return lines;
}

/**
 * Builds the side-games text section for a multi-flight / multi-day tournament,
 * one block per flight-day, using each round's OWN side-game results and pots.
 *
 * entries: [{ label, round, results, suppressKP }] — same shape the Tournament
 * Results page uses to render its Side Games section on screen.
 */
export function formatSideGamesSections(entries = []) {
  if (entries.length === 0) return [];
  // Tournament-wide player → team lookup so pooled KP/deuce winners from other
  // flights/days read as teams, matching the on-screen results.
  const teamNameByPlayer = buildTeamNameByPlayer(entries.map(e => e.round).filter(Boolean));
  const lines = ["🎲 SIDE GAMES"];
  lines.push("");

  entries.forEach(entry => {
    const { round, results: res = {}, label, suppressKP, playerFlightMap, flightLabels, flightDayLabels } = entry;
    const block = [];

    const grossSkins = res.gross_skins || [];
    if (round.gross_skins_enabled || grossSkins.length > 0) {
      const pot = res.gross_skins_allocated_pot || res.gross_skins_separate_pot
        || grossSkins.reduce((s, k) => s + (k.value || 0), 0);
      block.push(...skinsLines("⛳ Gross Skins", grossSkins, pot, round));
    }

    const netSkins = res.net_skins || [];
    if (round.net_skins_enabled || netSkins.length > 0) {
      const pot = res.net_skins_allocated_pot || res.net_skins_separate_pot
        || netSkins.reduce((s, k) => s + (k.value || 0), 0);
      block.push(...skinsLines("🎯 Net Skins", netSkins, pot, round));
    }

    const kps = suppressKP ? [] : (res.kp_results || []);
    if (kps.length > 0) {
      const per = Number(res.kp_per_entry_amount) || 0;
      block.push(`   🎯 KP Winners${res.kp_separate_pot > 0 ? ` ($${Math.round(res.kp_separate_pot)} pot)` : ""}`);
      const renderKp = (kp) => {
        block.push(`      Hole ${kp.hole} — ${sideGameWinnerLabel(round, kp.player_id, kp.name, teamNameByPlayer)}`);
        if (per > 0) block.push(`      +$${per.toFixed(2)}${shareSuffix(kp.player_id, per, teamNameByPlayer)}`);
      };
      // Pooled tournament-wide KP (non-hybrid multi-flight): sub-group by
      // flight + date, mirroring the on-screen KpWinnersCard behavior.
      if (playerFlightMap && Object.keys(playerFlightMap).length > 0) {
        const byGroup = {};
        kps.forEach(kp => {
          const fn = String(kp.flight || playerFlightMap[kp.player_id] || "1");
          const key = `${fn}-${kp.date || ""}`;
          if (!byGroup[key]) byGroup[key] = [];
          byGroup[key].push(kp);
        });
        Object.keys(byGroup).sort((a, b) => {
          const [fa, da] = a.split("-");
          const [fb, db] = b.split("-");
          if (Number(fa) !== Number(fb)) return Number(fa) - Number(fb);
          return new Date(da) - new Date(db);
        }).forEach(key => {
          const groupLabel = flightDayLabels?.[key] || flightLabels?.[key.split("-")[0]] || `Flight ${key.split("-")[0]}`;
          block.push(`      ── ${groupLabel} ──`);
          byGroup[key].forEach(renderKp);
        });
      } else {
        kps.forEach(renderKp);
      }
    }

    const deuces = res.deuces || [];
    if (round.deuce_pot_enabled || deuces.length > 0) {
      const per = Number(res.deuce_per_entry_amount) || 0;
      block.push(`   ✌️ Deuce Pot${res.deuce_pot > 0 ? ` ($${Math.round(res.deuce_pot)} pot)` : ""}`);
      if (deuces.length === 0) {
        block.push("      No deuces");
      } else {
        deuces.forEach(d => {
          block.push(`      Hole ${d.hole} — ${sideGameWinnerLabel(round, d.player_id, d.name, teamNameByPlayer)}`);
          if (per > 0) block.push(`      +$${per.toFixed(2)}${shareSuffix(d.player_id, per, teamNameByPlayer)}`);
        });
      }
    }

    if (block.length === 0) return;
    lines.push(`━━━ ${String(label || "").toUpperCase()} ━━━`);
    lines.push(...block);
    lines.push("");
  });

  return lines.length > 2 ? lines : [];
}
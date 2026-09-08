import { computeTeamSkins, splitTeamSideGamePayouts, teamSideGamesActive } from "@/lib/teamScoreEngine";

/**
 * Converts a round's individual skins into team skins (and splits team side-game
 * payouts among members) for team events where team side games are enabled.
 *
 * Shared by the main recompute path and the sibling-round recompute so a
 * recomputed sibling (e.g. Day 2 of a non-final flight) never falls back to
 * individual skins rows.
 */
export function applyTeamSideGames(round, results) {
  if (!round?.game_type || round.game_type === "individual") return results;

  const kpFolded = round.kps_enabled && !round.kp_separate_buy_in &&
    (round.gross_skins_enabled || round.net_skins_enabled);
  // Aggregate and Las Vegas keep side games individual.
  if (kpFolded || !teamSideGamesActive(round)) return results;

  const wantsGrossSkins = !!round.gross_skins_enabled;
  const wantsNetSkins = !!round.net_skins_enabled;
  let out = { ...results };

  if (wantsGrossSkins || wantsNetSkins) {
    const teamSkins = computeTeamSkins(
      { ...round, results: out },
      wantsGrossSkins ? (out.gross_skins_allocated_pot || out.gross_skins_separate_pot || 0) : 0,
      wantsNetSkins ? (out.net_skins_allocated_pot || out.net_skins_separate_pot || 0) : 0
    );
    if (wantsGrossSkins) out.gross_skins = teamSkins.gross_skins;
    if (wantsNetSkins) out.net_skins = teamSkins.net_skins;
    out.payouts = (out.payouts || []).map((p) => {
      const gsp = wantsGrossSkins ? (teamSkins.grossSkinsPlayerPayouts[p.player_id] || 0) : (p.gross_skins_payout || 0);
      const nsp = wantsNetSkins ? (teamSkins.netSkinsPlayerPayouts[p.player_id] || 0) : (p.net_skins_payout || 0);
      return {
        ...p,
        gross_skins_payout: gsp,
        net_skins_payout: nsp,
        total_payout: (p.gross_payout || 0) + (p.net_payout || 0) + (p.kp_payout || 0) + gsp + nsp + (p.deuce_payout || 0),
      };
    });
  }

  out.payouts = splitTeamSideGamePayouts({ ...round, results: out }, out.payouts);
  return out;
}
import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Trophy } from "lucide-react";
import SkinsTable from "@/components/results/SkinsTable";
import { getTeamOfPlayer } from "@/lib/teamScoreEntry";

/**
 * Renders one day's side games (gross skins, net skins, KP winners, deuce pot).
 * Used for the current day and — in a multi-day series — each prior day, so the
 * final results screen shows every day's side games, each labeled with its day.
 */
export default function SideGamesSection({ round, results, dayLabel }) {
  if (!round || !results) return null;

  const players = round.players || [];
  const kpResults = results.kp_results || [];

  // Team side games: show team name as the winner instead of the individual.
  // Aggregate format keeps side games individual (no valid "team skin").
  const isTeamEvent = !!(round.game_type && round.game_type !== "individual");
  const isAggregate = round.game_type === 'team_aggregate' ||
    (round.team_mode === true && round.team_format === 'aggregate');
  const isTeamSideGame = isTeamEvent && !isAggregate && round.skins_team_mode !== false;

  const getDisplayName = (playerId) => {
    const playerName = players.find(p => p.player_id === playerId)?.name || playerId;
    if (!isTeamSideGame) return { primary: playerName, secondary: null };
    const team = getTeamOfPlayer(round, playerId);
    return { primary: team?.label || team?.name || playerName, secondary: playerName };
  };

  const showGrossSkins = round.gross_skins_enabled || (results.gross_skins_allocated_pot > 0) || (results.gross_skins_separate_pot > 0) || (results.gross_skins?.length > 0);
  const showNetSkins = round.net_skins_enabled || (results.net_skins_allocated_pot > 0) || (results.net_skins_separate_pot > 0) || (results.net_skins?.length > 0);

  const hasAny = showGrossSkins || showNetSkins || kpResults.length > 0 || round.deuce_pot_enabled;
  if (!hasAny) return null;

  return (
    <div>
      {dayLabel && (
        <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wide mt-5 mb-1">{dayLabel} · Side Games</h3>
      )}

      {showGrossSkins && (
        <div className="mt-3">
          <SkinsTable
            title="⛳ Gross Skins"
            skins={results.gross_skins || []}
            totalPot={results.gross_skins_allocated_pot || results.gross_skins_separate_pot || 0}
            par={round.par || []}
          />
        </div>
      )}

      {showNetSkins && (
        <div className="mt-3">
          <SkinsTable
            title="🎯 Net Skins"
            skins={results.net_skins || []}
            totalPot={results.net_skins_allocated_pot || results.net_skins_separate_pot || 0}
            par={round.par || []}
          />
        </div>
      )}

      {kpResults.length > 0 && (
        <Card className="border-0 shadow-sm mt-3">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-semibold flex items-center gap-2">
                <Trophy className="w-4 h-4 text-accent" /> KP Winners
              </h3>
              {results.kp_separate_pot > 0 && (
                <span className="text-sm font-semibold text-accent">${Math.round(results.kp_separate_pot)} pot</span>
              )}
            </div>
            <div className="space-y-2">
              {(() => {
                const kpFoldedIntoSkins = !round.kp_separate_buy_in && (round.gross_skins_enabled || round.net_skins_enabled);
                const perEntryAmount = Number(results.kp_per_entry_amount) || 0;
                return kpResults.map((kp, i) => {
                  const { primary, secondary } = getDisplayName(kp.player_id);
                  return (
                    <div key={i} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/50">
                      <div>
                        <span className="font-medium text-sm">{primary}</span>
                        {secondary && <span className="text-xs text-muted-foreground ml-2">({secondary})</span>}
                        <span className="text-xs text-muted-foreground ml-2">Hole {kp.hole}</span>
                      </div>
                      {perEntryAmount > 0 ? (
                        <span className="text-sm font-semibold" style={{ color: '#d4a017' }}>+${perEntryAmount.toFixed(2)}</span>
                      ) : kpFoldedIntoSkins ? (
                        <span className="text-xs text-muted-foreground italic">included in skins</span>
                      ) : null}
                    </div>
                  );
                });
              })()}
            </div>
          </CardContent>
        </Card>
      )}

      {round.deuce_pot_enabled && (
        <Card className="border-0 shadow-sm mt-3">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-semibold flex items-center gap-2">✌️ Deuce Pot</h3>
              <span className="text-sm font-semibold text-accent">${Math.round(results.deuce_pot || 0)} pot</span>
            </div>
            {results.deuces?.length > 0 ? (
              <div className="space-y-2">
                {results.deuces.map((d, i) => {
                  const { primary, secondary } = getDisplayName(d.player_id);
                  const perDeuceAmount = Number(results.deuce_per_entry_amount) || 0;
                  return (
                    <div key={i} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/50">
                      <div>
                        <span className="font-medium text-sm">{primary}</span>
                        {secondary && <span className="text-xs text-muted-foreground ml-2">({secondary})</span>}
                        <span className="text-xs text-muted-foreground ml-2">Hole {d.hole}</span>
                      </div>
                      <span className="text-sm font-semibold" style={{ color: '#d4a017' }}>+${perDeuceAmount.toFixed(2)}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No deuces this round — pot carries over or is forfeited per your rules.</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
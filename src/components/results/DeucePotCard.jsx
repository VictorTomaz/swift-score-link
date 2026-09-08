import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { getSideGameDisplayName } from "@/lib/teamPlayerLookup";

/** One day/flight's deuce pot winners. */
export default function DeucePotCard({ round, results, title, teamNameByPlayer }) {
  if (!round?.deuce_pot_enabled) return null;

  // Naming rule lives in @/lib/teamPlayerLookup — never re-implement it here.
  const getDisplayName = (playerId) =>
    getSideGameDisplayName(round, playerId, null, teamNameByPlayer);

  const perDeuceAmount = Number(results.deuce_per_entry_amount) || 0;

  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-semibold flex items-center gap-2">✌️ {title || "Deuce Pot"}</h3>
          <span className="text-sm font-semibold text-accent">${Number(results.deuce_pot || 0).toFixed(2).replace(/\.00$/, '')} pot</span>
        </div>
        {results.deuces?.length > 0 ? (
          <div className="space-y-2">
            {results.deuces.map((d, i) => {
              const { primary, secondary, teamSize: size } = getDisplayName(d.player_id);
              const teamSize = secondary ? size : 1;
              const perPlayer = teamSize > 1 ? perDeuceAmount / teamSize : perDeuceAmount;
              return (
                <div key={i} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/50">
                  <div>
                    <span className="font-medium text-sm">{primary}</span>
                    {secondary && <span className="text-xs text-muted-foreground ml-2">({secondary})</span>}
                    <span className="text-xs text-muted-foreground ml-2">Hole {d.hole}</span>
                  </div>
                  <span className="text-sm font-semibold text-right" style={{ color: '#d4a017' }}>
                    +${perDeuceAmount.toFixed(2)}
                    {teamSize > 1 && (
                      <span className="block text-[10px] font-normal text-muted-foreground">${perPlayer.toFixed(2)}/player</span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No deuces this round — pot carries over or is forfeited per your rules.</p>
        )}
      </CardContent>
    </Card>
  );
}
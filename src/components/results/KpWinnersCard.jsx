import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Trophy } from "lucide-react";
import { getSideGameDisplayName } from "@/lib/teamPlayerLookup";

/**
 * One day/flight's KP winners. When a playerFlightMap is supplied (pooled
 * tournament-wide KP), winners are sub-grouped by flight + day.
 */
export default function KpWinnersCard({ round, results, title, playerFlightMap, flightLabels, flightDayLabels, teamNameByPlayer }) {
  const kpResults = results?.kp_results || [];
  if (kpResults.length === 0) return null;

  // Naming rule lives in @/lib/teamPlayerLookup — never re-implement it here.
  const getDisplayName = (playerId, fallbackName) =>
    getSideGameDisplayName(round, playerId, fallbackName, teamNameByPlayer);

  const perEntryAmount = Number(results.kp_per_entry_amount) || 0;
  const kpFoldedIntoSkins = !round.kp_separate_buy_in && (round.gross_skins_enabled || round.net_skins_enabled);

  const renderKpRow = (kp, i) => {
    const { primary, secondary, teamSize: size } = getDisplayName(kp.player_id, kp.name);
    // Team side games: the KP is won by the team, so show each member's share.
    const teamSize = secondary ? size : 1;
    const perPlayer = teamSize > 1 ? perEntryAmount / teamSize : perEntryAmount;
    return (
      <div key={i} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/50">
        <div>
          <span className="font-medium text-sm">{primary}</span>
          {secondary && <span className="text-xs text-muted-foreground ml-2">({secondary})</span>}
          <span className="text-xs text-muted-foreground ml-2">Hole {kp.hole}</span>
        </div>
        {perEntryAmount > 0 ? (
          <span className="text-sm font-semibold text-right" style={{ color: '#d4a017' }}>
            +${perEntryAmount.toFixed(2)}
            {teamSize > 1 && (
              <span className="block text-[10px] font-normal text-muted-foreground">${perPlayer.toFixed(2)}/player</span>
            )}
          </span>
        ) : kpFoldedIntoSkins ? (
          <span className="text-xs text-muted-foreground italic">included in skins</span>
        ) : null}
      </div>
    );
  };

  const renderBody = () => {
    if (playerFlightMap && Object.keys(playerFlightMap).length > 0) {
      const byGroup = {};
      kpResults.forEach(kp => {
        const fn = String(kp.flight || playerFlightMap[kp.player_id] || '1');
        const key = `${fn}-${kp.date || ''}`;
        if (!byGroup[key]) byGroup[key] = [];
        byGroup[key].push(kp);
      });
      return Object.keys(byGroup).sort((a, b) => {
        const [fa, da] = a.split('-');
        const [fb, db] = b.split('-');
        if (Number(fa) !== Number(fb)) return Number(fa) - Number(fb);
        return new Date(da) - new Date(db);
      }).map(key => (
        <div key={key} className="space-y-1.5">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide pt-1">
            {flightDayLabels?.[key] || flightLabels?.[key.split('-')[0]] || `Flight ${key.split('-')[0]}`}
          </p>
          {byGroup[key].map((kp, i) => renderKpRow(kp, `${key}-${i}`))}
        </div>
      ));
    }
    return kpResults.map((kp, i) => renderKpRow(kp, i));
  };

  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-semibold flex items-center gap-2">
            <Trophy className="w-4 h-4 text-accent" /> {title || "KP Winners"}
          </h3>
          {results.kp_separate_pot > 0 && (
            <span className="text-sm font-semibold text-accent">
              {perEntryAmount > 0
                ? `$${perEntryAmount.toFixed(2).replace(/\.00$/, '')} each`
                : `${Number(results.kp_separate_pot).toFixed(2).replace(/\.00$/, '')} pot`}
            </span>
          )}
        </div>
        <div className="space-y-2">{renderBody()}</div>
      </CardContent>
    </Card>
  );
}
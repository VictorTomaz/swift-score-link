import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Trophy } from "lucide-react";
import SkinsTable from "@/components/results/SkinsTable";
import { getSideGameDisplayName } from "@/lib/teamPlayerLookup";

/**
 * Renders one day's side games (gross skins, net skins, KP winners, deuce pot).
 * Used for the current day and — in a multi-day series — each prior day, so the
 * final results screen shows every day's side games, each labeled with its day.
 */
export default function SideGamesSection({ round, results, dayLabel, suppressKP, playerFlightMap, flightLabels, flightDayLabels, teamNameByPlayer }) {
  if (!round || !results) return null;

  const players = round.players || [];
  const kpResults = results.kp_results || [];

  // Naming rule lives in @/lib/teamPlayerLookup — never re-implement it here.
  const getDisplayName = (playerId, fallbackName) =>
    getSideGameDisplayName(round, playerId, fallbackName, teamNameByPlayer);

  const showGrossSkins = round.gross_skins_enabled || (results.gross_skins_allocated_pot > 0) || (results.gross_skins_separate_pot > 0) || (results.gross_skins?.length > 0);
  const showNetSkins = round.net_skins_enabled || (results.net_skins_allocated_pot > 0) || (results.net_skins_separate_pot > 0) || (results.net_skins?.length > 0);

  // Per-entry KP payout — for hybrid/multi-flight tournaments this is the
  // tournament-wide pooled amount (every winner gets the same regardless of
  // flight size). Shown in the header so equal payouts are visible at a glance.
  const kpPerEntryAmount = Number(results.kp_per_entry_amount) || 0;

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

      {kpResults.length > 0 && !suppressKP && (
        <Card className="border-0 shadow-sm mt-3">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-semibold flex items-center gap-2">
                <Trophy className="w-4 h-4 text-accent" /> KP Winners
              </h3>
              {results.kp_separate_pot > 0 && (
                <span className="text-sm font-semibold text-accent">
                  {kpPerEntryAmount > 0
                    ? `$${kpPerEntryAmount.toFixed(2).replace(/\.00$/, '')} each`
                    : `${Number(results.kp_separate_pot).toFixed(2).replace(/\.00$/, '')} pot`}
                </span>
              )}
            </div>
            <div className="space-y-2">
              {(() => {
                const kpFoldedIntoSkins = !round.kp_separate_buy_in && (round.gross_skins_enabled || round.net_skins_enabled);
                const perEntryAmount = Number(results.kp_per_entry_amount) || 0;

                const renderKpRow = (kp, i) => {
                  const { primary, secondary } = getDisplayName(kp.player_id, kp.name);
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
                };

                // Tournament-wide KP (hybrid/multi-flight): group winners by flight+day.
                if (playerFlightMap && Object.keys(playerFlightMap).length > 0) {
                  const byGroup = {};
                  kpResults.forEach(kp => {
                    const fn = String(kp.flight || playerFlightMap[kp.player_id] || '1');
                    const date = kp.date || '';
                    const key = `${fn}-${date}`;
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
                        {flightDayLabels?.[key] || (() => {
                          const [fn] = key.split('-');
                          return flightLabels?.[fn] || `Flight ${fn}`;
                        })()}
                      </p>
                      {byGroup[key].map((kp, i) => renderKpRow(kp, `${key}-${i}`))}
                    </div>
                  ));
                }

                return kpResults.map((kp, i) => renderKpRow(kp, i));
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
              <span className="text-sm font-semibold text-accent">${Number(results.deuce_pot || 0).toFixed(2).replace(/\.00$/, '')} pot</span>
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
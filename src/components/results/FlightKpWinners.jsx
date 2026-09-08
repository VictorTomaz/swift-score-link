import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Trophy } from "lucide-react";
import { getSideGameDisplayName } from "@/lib/teamPlayerLookup";

/**
 * KP winners for a single flight. Tournament-wide KP money is pooled, so every
 * winner shows the same per-entry amount — this just embeds each flight's
 * winners inside that flight's section instead of one combined list.
 * KPs are grouped by day (using flightDayLabels) so each winner's day is visible.
 *
 * Winner naming comes from @/lib/teamPlayerLookup (team events show the team,
 * with the individual in parentheses) — never re-implement that rule here.
 */
export default function FlightKpWinners({ kps, perEntryAmount, playerNames, flightDayLabels, flightNumber, round, teamNameByPlayer }) {
  if (!kps || kps.length === 0) return null;

  // Group KPs by date so we can label which day each winner came from.
  const byDate = {};
  kps.forEach(kp => {
    const d = kp.date || '';
    if (!byDate[d]) byDate[d] = [];
    byDate[d].push(kp);
  });
  const sortedDates = Object.keys(byDate).sort((a, b) => new Date(a) - new Date(b));
  const hasMultipleDays = sortedDates.length > 1;

  // KP pots settle per-day, so each winner can carry its own day's amount.
  const amountFor = (kp) => (kp.amount != null ? kp.amount : perEntryAmount) || 0;
  const uniformAmount = kps.every(kp => amountFor(kp) === amountFor(kps[0]));

  const dayLabelFor = (date) => {
    if (!date) return null;
    const full = flightDayLabels?.[`${flightNumber}-${date}`];
    if (full) return full.split('·').pop().trim();
    return null;
  };

  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-semibold flex items-center gap-2">
            <Trophy className="w-4 h-4 text-accent" /> KP Winners
          </h4>
          {uniformAmount && amountFor(kps[0]) > 0 && (
            <span className="text-xs font-semibold text-accent">
              ${amountFor(kps[0]).toFixed(2).replace(/\.00$/, '')} each
            </span>
          )}
        </div>
        <div className="space-y-1.5">
          {sortedDates.map(date => {
            const dayLabel = dayLabelFor(date);
            return (
              <div key={date || 'none'} className="space-y-1.5">
                {hasMultipleDays && dayLabel && (
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide pt-1">{dayLabel}</p>
                )}
                {byDate[date].map((kp, i) => {
                  const { primary, secondary } = getSideGameDisplayName(
                    round,
                    kp.player_id,
                    kp.name || playerNames?.[kp.player_id],
                    teamNameByPlayer
                  );
                  const amt = amountFor(kp);
                  return (
                    <div key={`${date}-${i}`} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                      <div>
                        <span className="font-medium text-sm">{primary}</span>
                        {secondary && <span className="text-xs text-muted-foreground ml-2">({secondary})</span>}
                        <span className="text-xs text-muted-foreground ml-2">Hole {kp.hole}</span>
                      </div>
                      {amt > 0 && (
                        <span className="text-sm font-semibold" style={{ color: '#d4a017' }}>+${amt.toFixed(2)}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
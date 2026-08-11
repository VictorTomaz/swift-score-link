import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Trophy } from "lucide-react";

/**
 * Displays a single flight's top gross/net finishers in a compact card.
 * Used on the final flight's Results page to show each flight's own winners
 * alongside the combined Field Standings.
 */
export default function FlightStandings({ round, results, flightLabel, payouts, holdMainPayouts, placesCount }) {
  const grossResults = (results?.gross_results || []).filter(r => !r.disqualified);
  const netResults = (results?.net_results || []).filter(r => !r.disqualified);

  if (grossResults.length === 0 && netResults.length === 0) return null;

  const findPayout = (playerId) => payouts?.find(p => p.player_id === playerId);

  const renderList = (data, scoreKey, payoutKey, label) => {
    // Show as many places as are actually being paid (non-zero payout),
    // not a hardcoded 3 — the organizer may configure 4+ places per flight.
    const paidCount = data.filter(r => {
      const p = findPayout(r.player_id);
      return p && (p[payoutKey] || 0) > 0;
    }).length;
    const winners = data.slice(0, Math.max(paidCount, placesCount || 3));
    if (winners.length === 0) return null;
    return (
      <div className="flex-1">
        <p className="text-xs font-semibold text-muted-foreground mb-2">{label}</p>
        <div className="space-y-1">
          {winners.map((r, i) => {
            const payout = findPayout(r.player_id);
            const amount = holdMainPayouts ? 0 : (payout?.[payoutKey] || 0);
            return (
              <div key={r.player_id || i} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1.5 min-w-0">
                  <span className="text-muted-foreground font-medium w-5">{i + 1}.</span>
                  <span className="font-medium truncate">{r.name || '—'}</span>
                  {amount > 0 && (
                    <span className="text-xs font-semibold text-accent">+${Number.isInteger(amount) ? amount : amount.toFixed(2)}</span>
                  )}
                </span>
                <span className="font-bold text-foreground shrink-0 ml-2">
                  {r[scoreKey] ?? '—'}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Trophy className="w-4 h-4 text-primary" />
          <p className="text-sm font-bold text-foreground">{flightLabel || round?.event_name || 'Flight'}</p>
          <span className="text-xs text-muted-foreground ml-auto truncate">{round?.course_name || ''}</span>
        </div>
        <div className="flex gap-4">
          {renderList(grossResults, 'gross_total', 'gross_payout', 'Gross')}
          {renderList(netResults, 'net_total', 'net_payout', 'Net')}
        </div>
      </CardContent>
    </Card>
  );
}
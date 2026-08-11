import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Trophy, DollarSign } from "lucide-react";

/**
 * Prominently displays the Low Gross of the Field and Low Net of the Field
 * winners with their prize amounts. Shown on the final flight's Results page
 * for multi-flight tournaments with field prizes enabled.
 */
export default function FieldPrizesCard({ results }) {
  const grossWinner = results?.field_gross_winner;
  const netWinner = results?.field_net_winner;
  const grossPrize = results?.field_gross_prize || 0;
  const netPrize = results?.field_net_prize || 0;

  if (!grossWinner && !netWinner) return null;

  const renderWinner = (winner, prize, scoreKey, label) => {
    if (!winner) return null;
    return (
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-muted-foreground mb-1.5">{label}</p>
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="font-bold text-foreground truncate">{winner.name || '—'}</p>
            <p className="text-xs text-muted-foreground">
              {winner.flight || ''} · Score: {winner[scoreKey] ?? '—'}
            </p>
          </div>
          {prize > 0 && (
            <div className="text-right shrink-0">
              <p className="text-lg font-bold text-accent">${Math.round(prize)}</p>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <Card className="border-2 border-primary/30 shadow-md bg-primary/5">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Trophy className="w-5 h-5 text-primary" />
          <p className="text-sm font-bold text-foreground">Field Prizes</p>
          <span className="text-xs text-muted-foreground ml-auto">
            Best across all flights
          </span>
        </div>
        <div className="flex gap-4">
          {renderWinner(grossWinner, grossPrize, 'gross_total', 'Low Gross of the Field')}
          {renderWinner(netWinner, netPrize, 'net_total', 'Low Net of the Field')}
        </div>
      </CardContent>
    </Card>
  );
}
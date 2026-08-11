import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trophy, Award, Edit2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { computeStandingsDisplay, rankLabel } from "@/lib/standingsRanks";

const findPayoutForPlayer = (playerId, payouts) =>
  payouts?.find(p => p.player_id === playerId) ?? null;

export default function GrossNetResults({ results, round, players, onEditScore, editMode, holdMainPayouts, isMultiFlight }) {
  const payouts = results.payouts || [];
  const playersList = players || round?.players || [];
  const grossResults = results.gross_results || [];
  const netResults = results.net_results || [];
  const isStableford = !!results.stableford;
  const { grossDisplay, netDisplay } = computeStandingsDisplay(grossResults, netResults, payouts, isStableford);

  const renderRow = (r, scoreKey, rankColorClass, payoutKey, display) => {
    const payout = findPayoutForPlayer(r.player_id, payouts);
    const score = r.disqualified ? "" : (Array.isArray(r[scoreKey])
      ? r[scoreKey].reduce((a, b) => a + (Number(b) || 0), 0)
      : r[scoreKey]);

    return (
      <div key={r.player_id} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/50">
        <div className="flex items-center gap-3 flex-1">
          <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
            display?.showRank && !r.disqualified && display.rank === 1 ? rankColorClass : "bg-muted text-muted-foreground"
          }`}>
            {r.disqualified ? "—" : rankLabel(display)}
          </span>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm text-foreground">{r.name}</span>
              {isMultiFlight && r.flight && (
                <Badge variant="secondary" className="text-xs font-semibold">{r.flight}</Badge>
              )}
              {r.disqualified && <Badge variant="destructive" className="text-xs">DQ</Badge>}
            </div>
            {!holdMainPayouts && !isMultiFlight && !r.disqualified && payout?.[payoutKey] > 0 && (
              <span className="text-xs font-semibold text-accent">+${Number.isInteger(payout[payoutKey]) ? payout[payoutKey] : payout[payoutKey].toFixed(2)}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-bold text-foreground">{score}{isStableford ? ' pts' : ''}</span>
          {editMode && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2"
              onClick={() => onEditScore?.(playersList.find(p => p.player_id === r.player_id))}
            >
              <Edit2 className="w-3 h-3 text-edit" />
            </Button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Trophy className="w-4 h-4 text-accent" />
            {isStableford ? 'Gross Points' : 'Gross Standings'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {grossResults.map(r =>
            renderRow(r, "gross_total", "bg-accent/20 text-accent", "gross_payout", grossDisplay[r.player_id])
          )}
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Award className="w-4 h-4 text-primary" />
            {isStableford ? 'Net Points' : 'Net Standings'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {netResults.map(r =>
            renderRow(r, "net_total", "bg-primary/20 text-primary", "net_payout", netDisplay[r.player_id])
          )}
        </CardContent>
      </Card>
    </div>
  );
}
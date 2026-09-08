import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trophy, Edit2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Single combined leaderboard for the Las Vegas (1 Gross / 2 Net) format.
 * There is no separate gross/net list — every team is ranked on one total.
 */
export default function VegasStandings({ results, round, players, onEditScore, editMode, holdMainPayouts, title }) {
  const teams = results?.team_vegas_results || [];
  if (teams.length === 0) return null;

  const eligible = teams.filter(t => !t.disqualified);
  const rankFor = (team) => {
    if (team.disqualified) return "—";
    const better = eligible.filter(t => t.vegas_total < team.vegas_total).length;
    const tied = eligible.filter(t => t.vegas_total === team.vegas_total).length > 1;
    return `${tied ? "T" : ""}${better + 1}`;
  };

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Trophy className="w-4 h-4 text-accent" />
          {title || "Las Vegas — 1 Gross / 2 Net"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {teams.map(team => {
          const perMember = !holdMainPayouts && team.payout > 0 && team.members?.length
            ? team.payout / team.members.length
            : 0;
          const rank = rankFor(team);
          return (
            <div key={team.team_id} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/50">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <span className={`w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-xs font-bold ${
                  rank === "1" ? "bg-accent/20 text-accent" : "bg-muted text-muted-foreground"
                }`}>
                  {rank}
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm text-foreground truncate">{team.team_name}</span>
                    {team.disqualified && <Badge variant="destructive" className="text-xs">DQ</Badge>}
                  </div>
                  {perMember > 0 && (
                    <span className="text-xs font-semibold text-accent">
                      +${Number.isInteger(perMember) ? perMember : perMember.toFixed(2)}/player
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="font-bold text-foreground">{team.disqualified ? "DQ" : team.vegas_total}</span>
                {editMode && team.members?.map(m => (
                  <Button
                    key={m.player_id}
                    size="sm"
                    variant="ghost"
                    className="h-7 px-1.5"
                    onClick={() => onEditScore?.(players?.find(p => p.player_id === m.player_id))}
                    title={`Edit ${m.name}`}
                  >
                    <Edit2 className="w-3 h-3 text-edit" />
                  </Button>
                ))}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
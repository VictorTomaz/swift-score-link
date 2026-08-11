import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trophy, Award, Edit2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { computeTeamStandingsDisplay, rankLabel } from "@/lib/standingsRanks";

export default function TeamStandings({ results, round, players, onEditScore, editMode, holdMainPayouts }) {
  const teamGrossResults = results.team_gross_results || [];
  const teamNetResults = results.team_net_results || [];
  const { grossDisplay, netDisplay } = computeTeamStandingsDisplay(teamGrossResults, teamNetResults);

  const formatLabel = (() => {
    const gt = round?.game_type || "";
    if (gt === "team_scramble" || round?.team_format === "scramble") return "Scramble";
    if (gt === "team_chapman") return "Chapman";
    if (gt === "team_6_6_6") return "6-6-6";
    if (gt === "team_aggregate" || round?.team_format === "aggregate") return "Aggregate";
    return "Best Ball";
  })();

  const renderTeamRow = (team, scoreKey, rankColorClass, payoutKey, display) => {
    const score = team.disqualified ? "DQ" : team[scoreKey];
    const perMemberPayout = team[payoutKey] > 0 && team.members?.length
      ? team[payoutKey] / team.members.length
      : 0;

    return (
      <div key={team.team_id} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/50">
        <div className="flex items-center gap-3 flex-1">
          <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
            display?.showRank && !team.disqualified && display.rank === 1 ? rankColorClass : "bg-muted text-muted-foreground"
          }`}>
            {team.disqualified ? "—" : rankLabel(display)}
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm text-foreground">{team.team_name}</span>
              {team.disqualified && <Badge variant="destructive" className="text-xs">DQ</Badge>}
            </div>
            {!holdMainPayouts && !team.disqualified && perMemberPayout > 0 && (
              <span className="text-xs font-semibold text-accent">+${Number.isInteger(perMemberPayout) ? perMemberPayout : perMemberPayout.toFixed(2)}/player</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="font-bold text-foreground">{score}</span>
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
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Trophy className="w-4 h-4 text-accent" />
            Team Gross {formatLabel}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {teamGrossResults.map(team =>
            renderTeamRow(team, "best_ball_gross", "bg-accent/20 text-accent", "gross_payout", grossDisplay[team.team_id])
          )}
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Award className="w-4 h-4 text-primary" />
            Team Net {formatLabel}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {teamNetResults.map(team =>
            renderTeamRow(team, "best_ball_net", "bg-primary/20 text-primary", "net_payout", netDisplay[team.team_id])
          )}
        </CardContent>
      </Card>
    </div>
  );
}
import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Trophy } from "lucide-react";
import VegasStandings from "@/components/results/VegasStandings";

/**
 * Displays a single flight's top gross/net finishers in a compact card.
 * Used on the final flight's Results page to show each flight's own winners
 * alongside the combined Field Standings.
 */
export default function FlightStandings({ round, results, flightLabel, payouts, holdMainPayouts, placesCount, forceStacked }) {
  const isTeamEvent = !!(round?.game_type && round.game_type !== "individual") || round?.team_mode === true;

  // Las Vegas (1 gross / 2 net): one combined leaderboard for the flight.
  if ((results?.team_vegas_results || []).length > 0) {
    return (
      <VegasStandings
        results={results}
        round={round}
        holdMainPayouts={holdMainPayouts}
        title={`${flightLabel || round?.event_name || 'Flight'} — Las Vegas (1 Gross / 2 Net)`}
      />
    );
  }

  // Team event: render team best-ball standings instead of individual player scores.
  if (isTeamEvent && (results?.team_gross_results?.length > 0 || results?.team_net_results?.length > 0)) {
    const teamGross = (results?.team_gross_results || []).filter(t => !t.disqualified);
    const teamNet = (results?.team_net_results || []).filter(t => !t.disqualified);
    if (teamGross.length === 0 && teamNet.length === 0) return null;

    const renderTeamList = (data, scoreKey, payoutKey, label) => {
      if (data.length === 0) return null;
      return (
        <div className="flex-1">
          <p className="text-xs font-semibold text-muted-foreground mb-2">{label}</p>
          <div className="space-y-1">
            {data.map((t, i) => {
              // Use the team's own payout only. Never sum members' individual
              // payouts here — those come from individual gross/net standings and
              // summing them makes a team look paid in both gross and net.
              const perMember = !holdMainPayouts && t[payoutKey] > 0 && t.members?.length
                ? t[payoutKey] / t.members.length : 0;
              return (
                <div key={t.team_id || i} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1.5 min-w-0">
                    <span className="text-muted-foreground font-medium w-5">{i + 1}.</span>
                    <span className="font-medium truncate">{t.team_name || '—'}</span>
                    {perMember > 0 && (
                      <span className="text-xs font-semibold text-accent">+${Number.isInteger(perMember) ? perMember : perMember.toFixed(2)}/p</span>
                    )}
                  </span>
                  <span className="font-bold text-foreground shrink-0 ml-2">
                    {t.disqualified ? 'DQ' : (t[scoreKey] ?? '—')}
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
          <div className={forceStacked ? "flex flex-col gap-4" : "flex gap-4"}>
            {renderTeamList(teamGross, 'best_ball_gross', 'gross_payout', 'Team Gross')}
            {renderTeamList(teamNet, 'best_ball_net', 'net_payout', 'Team Net')}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Individual event: render player standings.
  const grossResults = (results?.gross_results || []).filter(r => !r.disqualified);
  const netResults = (results?.net_results || []).filter(r => !r.disqualified);

  if (grossResults.length === 0 && netResults.length === 0) return null;

  const findPayout = (playerId) => payouts?.find(p => p.player_id === playerId);

  const renderList = (data, scoreKey, payoutKey, label) => {
    const winners = data;
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
        <div className={forceStacked ? "flex flex-col gap-4" : "flex gap-4"}>
          {renderList(grossResults, 'gross_total', 'gross_payout', 'Gross')}
          {renderList(netResults, 'net_total', 'net_payout', 'Net')}
        </div>
      </CardContent>
    </Card>
  );
}
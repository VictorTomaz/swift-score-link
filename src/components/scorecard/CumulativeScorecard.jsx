import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CalendarDays, Users, Loader2, FileWarning } from "lucide-react";
import { useSeriesRounds } from "@/hooks/useSeriesRounds";

/**
 * Read-only cumulative scorecard for multi-day tournament series.
 *
 * Uses the shared useSeriesRounds hook (deduplicated + cached with the Results
 * page's own final-day check) so only ONE series fetch happens per page load.
 * Rows are built synchronously from each round's SAVED results — no RoundScore
 * fetch, no live recomputation — exactly the data the generateResultsPdf
 * engine reads, so the on-screen card and the PDF always agree.
 *
 * The final day's saved results are cumulative (is_series_cumulative=true),
 * so previous days' totals are subtracted to recover each per-day value.
 */
export default function CumulativeScorecard({ round }) {
  const isTeam = !!(round?.game_type && round.game_type !== "individual") || !!round?.team_mode;
  const { data: seriesRounds = [], isLoading } = useSeriesRounds(round);

  const { rows, dayMeta } = React.useMemo(
    () => buildRowsFromSavedResults(seriesRounds, isTeam),
    [seriesRounds, isTeam]
  );

  if (!round?.is_multi_day) return null;

  const numDays = dayMeta.length;
  const hasData = numDays > 0 && rows.some(r => r.hasAny);

  const fmtDate = d => {
    if (!d) return "";
    try {
      return new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
    } catch { return d; }
  };

  const nameCol = "min-w-[7rem]";
  const dayCol = "min-w-[3.5rem] text-center";
  const totalCol = "min-w-[3.5rem] text-center";

  return (
    <Card className="border-0 shadow-sm mt-3">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          {isTeam ? <Users className="w-4 h-4 text-primary" /> : <CalendarDays className="w-4 h-4 text-primary" />}
          Series Scorecard
          {numDays > 0 && (
            <span className="text-xs font-normal text-muted-foreground">
              · {numDays} day{numDays > 1 ? "s" : ""}{isTeam ? " · Teams" : ""}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-4 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading series scores…
          </div>
        ) : !hasData ? (
          <div className="p-4 flex items-start gap-2 text-sm text-muted-foreground">
            <FileWarning className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
            <span>Series standings not available on screen — use the "Series Scorecard PDF" button above to generate the full scorecard.</span>
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[60vh]">
            <table className="w-full text-xs border-collapse" style={{ minWidth: "max-content" }}>
              <thead className="sticky top-0 z-10">
                <tr className="bg-muted">
                  <th className={`text-left px-3 py-2 font-semibold text-muted-foreground ${nameCol}`}>
                    {isTeam ? "Team" : "Player"}
                  </th>
                  {dayMeta.map(d => (
                    <th key={d.roundId} className={`px-1 py-2 font-semibold text-muted-foreground ${dayCol}`}>
                      {fmtDate(d.date)}
                    </th>
                  ))}
                  <th className={`px-2 py-2 font-bold text-primary ${totalCol}`}>Total</th>
                </tr>
                <tr className="bg-muted border-b border-border">
                  <td className={`px-3 py-1 text-[10px] text-muted-foreground font-medium ${nameCol}`}>Par</td>
                  {dayMeta.map(d => (
                    <td key={d.roundId} className={`px-1 py-1 text-[10px] text-muted-foreground ${dayCol}`}>
                      {d.totalPar || "—"}
                    </td>
                  ))}
                  <td className={`px-2 py-1 text-[10px] text-muted-foreground font-bold ${totalCol}`}>
                    {dayMeta.reduce((a, d) => a + (d.totalPar || 0), 0)}
                  </td>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, ri) => (
                  <tr key={row.key} className={`border-b border-border/50 ${ri % 2 === 0 ? "bg-card" : "bg-muted/20"}`}>
                    <td className={`px-3 py-2 ${nameCol}`}>
                      <p className="font-semibold text-foreground leading-tight truncate">{row.label}</p>
                      {row.subLabel && <p className="text-[10px] text-muted-foreground truncate">{row.subLabel}</p>}
                    </td>
                    {dayMeta.map(d => {
                      const gross = row.dayGross[d.roundId];
                      const net = row.dayNet[d.roundId];
                      return (
                        <td key={d.roundId} className={`px-1 py-2 ${dayCol}`}>
                          <p className="font-semibold text-foreground leading-tight">
                            {gross != null ? gross : "—"}
                            {net != null && (
                              <span className="font-semibold text-foreground">/<span style={{ color: '#d4a017' }}>{net}</span></span>
                            )}
                          </p>
                        </td>
                      );
                    })}
                    <td className={`px-2 py-2 ${totalCol}`}>
                      <p className="font-bold text-foreground leading-tight">
                        {row.hasAny ? row.seriesGross : "—"}
                        {row.hasAny && row.seriesNet > 0 && (
                          <span className="font-bold text-foreground">/<span style={{ color: '#d4a017' }}>{row.seriesNet}</span></span>
                        )}
                      </p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="px-3 py-2 border-t border-border/50">
          <p className="text-[10px] text-muted-foreground">
            Each day shows gross/net (net in gold). Total column = cumulative gross/net across all days.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function lastName(name) {
  if (!name) return "";
  const parts = String(name).trim().split(/\s+/);
  return parts[parts.length - 1];
}

/**
 * Build scorecard rows purely from each round's SAVED results. The final
 * (latest-dated child) round stores cumulative totals, so we subtract prior
 * days to get its per-day value — mirroring generateResultsPdf.
 */
function buildRowsFromSavedResults(seriesRounds, isTeam) {
  const childRounds = seriesRounds.filter(r => r.parent_round_id);
  const finalRoundId = childRounds.length > 0
    ? [...childRounds].sort((a, b) => new Date(b.date) - new Date(a.date))[0].id
    : null;

  const rows = [];
  const dayMeta = seriesRounds.map(r => ({
    roundId: r.id,
    date: r.date,
    totalPar: (r.par || []).reduce((a, b) => a + b, 0),
  }));

  for (const r of seriesRounds) {
    const rResults = r.results || {};
    const isCumulative = r.id === finalRoundId && !!rResults.is_series_cumulative;

    if (isTeam) {
      const teamGross = rResults.team_gross_results || [];
      const teamNet = rResults.team_net_results || [];
      teamGross.forEach(tg => {
        const tn = teamNet.find(t => t.team_name === tg.team_name) || {};
        let row = rows.find(s => s.key === tg.team_name);
        if (!row) {
          row = {
            key: tg.team_name,
            label: tg.team_name || "—",
            subLabel: (tg.members || []).map(m => lastName(m.name)).join(" / "),
            dayGross: {}, dayNet: {}, seriesGross: 0, seriesNet: 0, hasAny: false,
          };
          rows.push(row);
        }
        const savedGross = tg.best_ball_gross ?? tg.gross_total ?? null;
        const savedNet = tn.best_ball_net ?? tn.net_total ?? null;
        if (isCumulative && savedGross != null) {
          const prevGross = Object.values(row.dayGross).reduce((a, g) => a + (g || 0), 0);
          const prevNet = Object.values(row.dayNet).reduce((a, n) => a + (n || 0), 0);
          row.dayGross[r.id] = savedGross - prevGross;
          row.dayNet[r.id] = savedNet != null ? savedNet - prevNet : null;
          row.seriesGross = savedGross;
          if (savedNet != null) row.seriesNet = savedNet;
          row.hasAny = true;
        } else {
          row.dayGross[r.id] = savedGross;
          row.dayNet[r.id] = savedNet;
          if (savedGross != null) { row.seriesGross += savedGross; row.hasAny = true; }
          if (savedNet != null) row.seriesNet += savedNet;
        }
      });
    } else {
      const grossResults = rResults.gross_results || [];
      const netResults = rResults.net_results || [];
      grossResults.forEach(gr => {
        const nr = netResults.find(n => n.player_id === gr.player_id) || {};
        let row = rows.find(s => s.key === gr.player_id);
        if (!row) {
          row = {
            key: gr.player_id,
            label: gr.name || gr.player_id,
            subLabel: "",
            dayGross: {}, dayNet: {}, seriesGross: 0, seriesNet: 0, hasAny: false,
          };
          rows.push(row);
        }
        const savedGross = gr.gross_total ?? null;
        const savedNet = nr.net_total ?? null;
        if (isCumulative && savedGross != null) {
          const prevGross = Object.values(row.dayGross).reduce((a, g) => a + (g || 0), 0);
          const prevNet = Object.values(row.dayNet).reduce((a, n) => a + (n || 0), 0);
          row.dayGross[r.id] = savedGross - prevGross;
          row.dayNet[r.id] = savedNet != null ? savedNet - prevNet : null;
          row.seriesGross = savedGross;
          if (savedNet != null) row.seriesNet = savedNet;
          row.hasAny = true;
        } else {
          row.dayGross[r.id] = savedGross;
          row.dayNet[r.id] = savedNet;
          if (savedGross != null) { row.seriesGross += savedGross; row.hasAny = true; }
          if (savedNet != null) row.seriesNet += savedNet;
        }
      });
    }
  }

  return { rows, dayMeta };
}
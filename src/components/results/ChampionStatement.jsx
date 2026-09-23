import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Trophy } from "lucide-react";
import ChampionRow from "@/components/results/ChampionRow";
import { totalPurse } from "@/lib/flightChampions";

/**
 * Champion statement — one row per flight per crowned division, plus the
 * Champion Purse (paid on top of the place payouts) when one was set.
 * rows: output of buildChampionRows
 */
export default function ChampionStatement({ rows, showFlightLabels = true }) {
  if (!rows || rows.length === 0) return null;
  const flightCount = new Set(rows.map((r) => r.flightNumber)).size;
  const purseTotal = totalPurse(rows);

  return (
    <Card className="border-2 border-primary/40 bg-primary/10 shadow-md mb-5">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center justify-center gap-2.5">
          <Trophy className="w-6 h-6 text-accent shrink-0" />
          <p className="text-lg sm:text-xl font-extrabold text-foreground tracking-tight text-center">
            {rows.length > 1 ? "Congratulations to our Champions!" : "Congratulations to our Champion!"}
          </p>
        </div>
        <div className="space-y-2.5">
          {rows.map((r) => (
            <ChampionRow
              key={r.key || r.flightNumber}
              row={r}
              showFlightLabel={showFlightLabels && flightCount > 1}
            />
          ))}
        </div>
        {purseTotal > 0 && (
          <p className="text-xs text-center text-muted-foreground">
            Champion Purse total ${Math.round(purseTotal)} — paid separately, on top of the place payouts.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
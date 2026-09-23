import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Trophy, Loader2 } from "lucide-react";
import { getLeaders, getChampionConfig, championFor } from "@/lib/flightChampions";
import ChampionPickGroup from "@/components/results/ChampionPickGroup";

/**
 * Playoff declaration. Appears only for flights/divisions (gross, net) the host
 * crowns that are tied for first — an outright leader is champion automatically.
 * Saving writes the champion to every round in the series so every surface
 * reads the same answer. flights: [{ flightNumber, label, results }]
 */
export default function DeclareChampionCard({ round, flights, seriesRounds }) {
  const queryClient = useQueryClient();
  const { mode, champions, divisions } = getChampionConfig(round);
  const showDivision = !(divisions.length === 1 && divisions[0] === "gross");
  const multiFlight = (flights || []).length > 1;
  const [busy, setBusy] = useState(false);

  const ties = [];
  (flights || []).forEach((f) => divisions.forEach((division) => {
    const candidates = getLeaders(f.results, division);
    if (candidates.length > 1) ties.push({ ...f, division, candidates, key: `${f.flightNumber}-${division}` });
  }));

  const [picks, setPicks] = useState(() => {
    const init = {};
    ties.forEach((t) => {
      const c = championFor(champions, t.flightNumber, t.division);
      if (c) init[t.key] = c.player_id;
    });
    return init;
  });

  if (ties.length === 0) return null;

  const allRounds = [round, ...(seriesRounds || [])]
    .filter(Boolean)
    .filter((r, i, arr) => arr.findIndex((x) => x.id === r.id) === i);

  const writeChampions = async (next, message) => {
    setBusy(true);
    try {
      await Promise.all(allRounds.map((r) => base44.entities.Round.update(r.id, { flight_champions: next })));
      // Legacy winner-take-all rounds only: money moves, so recompute.
      if (mode === "winner_take_all") {
        const { recomputeRoundResults } = await import("@/lib/recomputeResults");
        for (const r of allRounds.filter((r) => r.results)) {
          try { await recomputeRoundResults(r.id, { silent: true }); } catch (e) { /* keep going */ }
        }
      }
      queryClient.invalidateQueries({ queryKey: ["round", round.id] });
      queryClient.invalidateQueries({ queryKey: ["series-rounds"] });
      queryClient.invalidateQueries({ queryKey: ["tournament-series"] });
      toast.success(message);
    } catch (e) {
      toast.error("Failed to save champion: " + (e.message || "Unknown error"));
    } finally {
      setBusy(false);
    }
  };

  const isTieEntry = (c) => ties.some(
    (t) => String(t.flightNumber) === String(c.flight_number || 1) && t.division === (c.division || "gross")
  );

  const save = () => {
    const kept = (champions || []).filter((c) => !isTieEntry(c));
    const declared = ties.filter((t) => picks[t.key]).map((t) => ({
      flight_number: Number(t.flightNumber) || 1,
      division: t.division,
      player_id: picks[t.key],
      player_name: t.candidates.find((c) => c.player_id === picks[t.key])?.name || "",
      via_playoff: true,
      declared_at: new Date().toISOString(),
    }));
    writeChampions([...kept, ...declared], declared.length > 1 ? "Champions saved" : "Champion saved");
  };

  const clearAll = () => {
    setPicks({});
    writeChampions((champions || []).filter((c) => !isTieEntry(c)), "Playoff picks cleared");
  };

  const hasSaved = (champions || []).some(isTieEntry);

  return (
    <Card className="border border-primary/30 bg-card shadow-sm mb-4">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start gap-2">
          <Trophy className="w-4 h-4 text-primary shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">Declare the playoff winner</p>
            <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">
              {mode === "winner_take_all"
                ? "The player you pick takes the full 1st-place money; anyone else tied moves to the next place."
                : "Names the champion for the record. Place money still splits evenly between tied players."}
            </p>
          </div>
        </div>

        <div className="space-y-3">
          {ties.map((t) => (
            <ChampionPickGroup
              key={t.key}
              title={[multiFlight ? t.label : null, showDivision ? (t.division === "net" ? "Net" : "Gross") : null].filter(Boolean).join(" · ")}
              candidates={t.candidates}
              selected={picks[t.key]}
              disabled={busy}
              onSelect={(id) => setPicks((p) => ({ ...p, [t.key]: p[t.key] === id ? undefined : id }))}
            />
          ))}
        </div>

        <div className="flex gap-2">
          <Button onClick={save} disabled={busy} className="flex-1 gap-2">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trophy className="w-4 h-4" />}
            {hasSaved ? "Update champion" : "Save champion"}
          </Button>
          {hasSaved && (
            <Button variant="outline" onClick={clearAll} disabled={busy}>Clear</Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
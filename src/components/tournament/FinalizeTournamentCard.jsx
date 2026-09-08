import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Trophy, Loader2, CheckCircle2 } from "lucide-react";
import FinalizeWarningDialog, { findUnscoredRounds } from "@/components/results/FinalizeWarningDialog";
import { recomputeRoundResults } from "@/lib/recomputeResults";

/**
 * Tournament-level finalize. Sets the SAME flags the per-round toggle sets
 * (is_series_final + is_final_flight) on the final round — the latest day of
 * the highest flight — and clears them everywhere else so the tournament can
 * never end up half-finalized on two different rounds. Then recomputes that
 * round, which is what produces the combined results. No payout logic changes.
 */
export default function FinalizeTournamentCard({ seriesRounds, finalRound, anchorId, isFinalized }) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [unscoredWarning, setUnscoredWarning] = useState(null);

  const runFinalize = async () => {
    setBusy(true);
    try {
      const others = seriesRounds.filter(r => r.id !== finalRound.id &&
        (r.is_series_final || r.is_final_flight));
      await Promise.all(others.map(r =>
        base44.entities.Round.update(r.id, { is_series_final: false, is_final_flight: false })
      ));
      await base44.entities.Round.update(finalRound.id, {
        is_series_final: true,
        is_final_flight: true,
      });
      await recomputeRoundResults(finalRound.id);
      await queryClient.invalidateQueries({ queryKey: ["tournament-series", anchorId] });
      queryClient.invalidateQueries({ queryKey: ["series-rounds"] });
      toast.success("Tournament finalized — combined results are ready");
    } catch (e) {
      toast.error("Failed to finalize: " + (e.message || "Unknown error"));
    } finally {
      setBusy(false);
    }
  };

  const handleClick = () => {
    const unscored = findUnscoredRounds(seriesRounds);
    if (unscored.length > 0) {
      setUnscoredWarning(unscored);
      return;
    }
    runFinalize();
  };

  return (
    <>
      <Card className="border-0 shadow-sm bg-primary/5">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-start gap-2">
            {isFinalized
              ? <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />
              : <Trophy className="w-4 h-4 text-primary shrink-0 mt-0.5" />}
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">
                {isFinalized ? "Tournament finalized" : "Finalize the tournament"}
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">
                {isFinalized
                  ? "The main gross & net purse has been paid out from the combined standings across every flight and day. Re-run this if you edit any scores."
                  : "Pays the held main purse from the combined standings across every flight and day. Side games already settled per day. Run this once all flights are finished."}
              </p>
            </div>
          </div>
          <Button onClick={handleClick} disabled={busy || !finalRound} className="w-full gap-2">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trophy className="w-4 h-4" />}
            {busy ? "Computing combined results..." : isFinalized ? "Re-finalize & Recompute" : "Finalize Tournament"}
          </Button>
        </CardContent>
      </Card>

      <FinalizeWarningDialog
        open={!!unscoredWarning}
        onOpenChange={(o) => { if (!o) setUnscoredWarning(null); }}
        unscored={unscoredWarning || []}
        onConfirm={() => { setUnscoredWarning(null); runFinalize(); }}
      />
    </>
  );
}
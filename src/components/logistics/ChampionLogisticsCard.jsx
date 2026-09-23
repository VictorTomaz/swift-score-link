import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Trophy, Loader2, Save, Lock } from "lucide-react";
import { useSeriesRounds } from "@/hooks/useSeriesRounds";
import { getChampionConfig } from "@/lib/flightChampions";
import ChampionDivisionPicker from "@/components/logistics/ChampionDivisionPicker";
import ChampionPurseFields from "@/components/logistics/ChampionPurseFields";

/**
 * Champion & Playoffs — per tournament, default off. Saves to every round in
 * the series except legacy Winner-Takes-All rounds, which are never touched.
 */
export default function ChampionLogisticsCard({ round, onSaved }) {
  const queryClient = useQueryClient();
  const { data: series = [] } = useSeriesRounds(round);
  const cfg = getChampionConfig(round);
  const [enabled, setEnabled] = useState(cfg.enabled);
  const [divisions, setDivisions] = useState(cfg.divisions);
  const [purses, setPurses] = useState(cfg.purses);
  const [saving, setSaving] = useState(false);

  const allRounds = [round, ...series].filter((r, i, arr) => r && arr.findIndex((x) => x?.id === r.id) === i);
  const flights = [...new Map(allRounds.map((r) => [r.flight_number || 1, r])).values()]
    .sort((a, b) => (a.flight_number || 1) - (b.flight_number || 1))
    .map((r) => ({ flightNumber: r.flight_number || 1, label: r.flight_name || `Flight ${r.flight_number || 1}` }));

  if (cfg.isLegacyWinnerTakeAll) {
    return (
      <Card className="border-0 shadow-sm">
        <CardContent className="p-4 flex items-start gap-2">
          <Lock className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground">
            Champion & Playoffs is locked for this tournament — it was recorded with the old Winner Takes All rule, so its payouts stay exactly as they were.
          </p>
        </CardContent>
      </Card>
    );
  }

  const save = async () => {
    setSaving(true);
    const payload = { champion_enabled: enabled, champion_divisions: divisions, champion_purse_per_flight: purses, champion_payout_mode: "title_only" };
    try {
      const targets = allRounds.filter((r) => !getChampionConfig(r).isLegacyWinnerTakeAll);
      await Promise.all(targets.map((r) => base44.entities.Round.update(r.id, payload)));
      onSaved?.(payload);
      queryClient.invalidateQueries({ queryKey: ["rounds"] });
      queryClient.invalidateQueries({ queryKey: ["round"] });
      queryClient.invalidateQueries({ queryKey: ["series-rounds"] });
      toast.success("Champion settings saved");
    } catch (e) {
      toast.error("Failed to save: " + (e.message || "Unknown error"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><Trophy className="w-4 h-4 text-accent" /> Champion & Playoffs</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Optional — crown a champion and settle ties by playoff. Place money always splits evenly.</p>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>
        {enabled && (
          <div className="space-y-4">
            <ChampionDivisionPicker value={divisions} onChange={setDivisions} />
            <ChampionPurseFields flights={flights} divisions={divisions} value={purses} onChange={setPurses} />
          </div>
        )}
        <Button onClick={save} disabled={saving} className="w-full gap-2">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Champion Settings
        </Button>
      </CardContent>
    </Card>
  );
}
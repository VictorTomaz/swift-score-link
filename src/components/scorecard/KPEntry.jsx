import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import MobileSelect from "@/components/ui/mobile-select";
import { SelectItem } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Target, Plus, Trash2 } from "lucide-react";

export default function KPEntry({ round, onUpdate }) {
  const par3Holes = (round.par || []).map((p, i) => ({ hole: i + 1, par: p })).filter(h => h.par === 3);
  const [kpWinners, setKpWinners] = useState(round.kp_winners || []);
  const [selectedHole, setSelectedHole] = useState("");
  const [selectedPlayer, setSelectedPlayer] = useState("");

  useEffect(() => {
    setKpWinners(round.kp_winners || []);
  }, [round.kp_winners]);

  const addKP = () => {
    if (!selectedHole || !selectedPlayer) return;
    if (selectedPlayer === "no-winner") {
      // Mark hole as KP but with no winner
      const updated = [...kpWinners, { hole: Number(selectedHole), player_id: null }];
      setKpWinners(updated);
      onUpdate({ kp_winners: updated, kp_holes: updated.map(k => k.hole) });
    } else {
      const updated = [...kpWinners, { hole: Number(selectedHole), player_id: selectedPlayer }];
      setKpWinners(updated);
      onUpdate({ kp_winners: updated, kp_holes: updated.map(k => k.hole) });
    }
    setSelectedHole("");
    setSelectedPlayer("");
  };

  const removeKP = (index) => {
    const updated = kpWinners.filter((_, i) => i !== index);
    setKpWinners(updated);
    onUpdate({ kp_winners: updated, kp_holes: updated.map(k => k.hole) });
  };

  const getPlayerName = (id) => round.players?.find(p => p.player_id === id)?.name || id;

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Target className="w-4 h-4" />
          KP Winners
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {kpWinners.map((kp, i) => (
          <div key={i} className="flex items-center justify-between p-3 bg-muted rounded-lg">
            <div>
              <p className="font-medium text-sm">Hole {kp.hole}</p>
              <p className="text-xs text-muted-foreground">{kp.player_id ? getPlayerName(kp.player_id) : "No Winner"}</p>
            </div>
            <Button variant="ghost" size="icon" onClick={() => removeKP(i)}>
              <Trash2 className="w-4 h-4 text-destructive" />
            </Button>
          </div>
        ))}

        <div className="flex gap-2">
          <div className="flex-1 space-y-1">
            <Label className="text-xs">Hole</Label>
            <MobileSelect value={selectedHole} onValueChange={setSelectedHole} placeholder="Hole" label="Select Hole">
              {par3Holes.length > 0
                ? par3Holes.map(h => <SelectItem key={h.hole} value={String(h.hole)}>Hole {h.hole}</SelectItem>)
                : Array.from({ length: 18 }, (_, i) => (
                    <SelectItem key={i + 1} value={String(i + 1)}>Hole {i + 1}</SelectItem>
                  ))
              }
            </MobileSelect>
          </div>
          <div className="flex-1 space-y-1">
            <Label className="text-xs">Winner</Label>
            <MobileSelect value={selectedPlayer} onValueChange={setSelectedPlayer} placeholder="Player" label="Select Winner">
              <SelectItem value="no-winner">No Winner</SelectItem>
              {(round.players || []).map(p => (
                <SelectItem key={p.player_id} value={p.player_id}>{p.name}</SelectItem>
              ))}
            </MobileSelect>
          </div>
          <div className="pt-5">
            <Button size="icon" onClick={addKP} disabled={!selectedHole || !selectedPlayer}>
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
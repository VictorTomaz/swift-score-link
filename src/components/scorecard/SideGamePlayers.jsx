import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import InfoTooltip from "@/components/InfoTooltip";
import { Label } from "@/components/ui/label";
import { AlertTriangle } from "lucide-react";

export default function SideGamePlayers({ round, onUpdate }) {
  const players = round.players || [];

  const allPlayerIds = players.map(p => p.player_id);

  // If a pool list is empty, the engine treats ALL players as participants — mirror that in the UI
  const effectiveDeuceIds = (round.deuce_player_ids?.length > 0) ? round.deuce_player_ids : allPlayerIds;
  const effectiveKpIds = (round.kp_player_ids?.length > 0) ? round.kp_player_ids : allPlayerIds;
  const effectiveGrossSkinsIds = (round.gross_skins_player_ids?.length > 0) ? round.gross_skins_player_ids : allPlayerIds;
  const effectiveNetSkinsIds = (round.net_skins_player_ids?.length > 0) ? round.net_skins_player_ids : allPlayerIds;

  // Local state so UI doesn't snap back when the oversize realtime broadcast wipes cache fields
  const [deucePlayerIds, setDeucePlayerIds] = useState(() => effectiveDeuceIds);
  const [kpPlayerIds, setKpPlayerIds] = useState(() => effectiveKpIds);
  const [grossSkinsPlayerIds, setGrossSkinsPlayerIds] = useState(() => effectiveGrossSkinsIds);
  const [netSkinsPlayerIds, setNetSkinsPlayerIds] = useState(() => effectiveNetSkinsIds);

  // Re-sync local state when round prop updates (e.g. after adding/removing players)
  useEffect(() => { setDeucePlayerIds((round.deuce_player_ids?.length > 0) ? round.deuce_player_ids : allPlayerIds); }, [round.deuce_player_ids, players.length]);
  useEffect(() => { setKpPlayerIds((round.kp_player_ids?.length > 0) ? round.kp_player_ids : allPlayerIds); }, [round.kp_player_ids, players.length]);
  useEffect(() => { setGrossSkinsPlayerIds((round.gross_skins_player_ids?.length > 0) ? round.gross_skins_player_ids : allPlayerIds); }, [round.gross_skins_player_ids, players.length]);
  useEffect(() => { setNetSkinsPlayerIds((round.net_skins_player_ids?.length > 0) ? round.net_skins_player_ids : allPlayerIds); }, [round.net_skins_player_ids, players.length]);

  const updateDeuce = (ids) => { setDeucePlayerIds(ids); onUpdate({ deuce_player_ids: ids }); };
  const updateKP = (ids) => { setKpPlayerIds(ids); onUpdate({ kp_player_ids: ids }); };
  const updateGrossSkins = (ids) => { setGrossSkinsPlayerIds(ids); onUpdate({ gross_skins_player_ids: ids }); };
  const updateNetSkins = (ids) => { setNetSkinsPlayerIds(ids); onUpdate({ net_skins_player_ids: ids }); };

  const toggleDeuce = (playerId) => {
    const updated = deucePlayerIds.includes(playerId)
      ? deucePlayerIds.filter(id => id !== playerId)
      : [...deucePlayerIds, playerId];
    updateDeuce(updated);
  };

  const toggleKP = (playerId) => {
    const updated = kpPlayerIds.includes(playerId)
      ? kpPlayerIds.filter(id => id !== playerId)
      : [...kpPlayerIds, playerId];
    updateKP(updated);
  };

  const toggleGrossSkins = (playerId) => {
    const updated = grossSkinsPlayerIds.includes(playerId)
      ? grossSkinsPlayerIds.filter(id => id !== playerId)
      : [...grossSkinsPlayerIds, playerId];
    updateGrossSkins(updated);
  };

  const toggleNetSkins = (playerId) => {
    const updated = netSkinsPlayerIds.includes(playerId)
      ? netSkinsPlayerIds.filter(id => id !== playerId)
      : [...netSkinsPlayerIds, playerId];
    updateNetSkins(updated);
  };

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <CardTitle className="text-base font-semibold flex items-center">Side Game Players <InfoTooltip text="Select which players are participating in each separate buy-in side game. Only selected players contribute to and can win from that specific pot." /></CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {round.deuce_pot_enabled && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium flex items-center">Deuce Pot (${round.deuce_buy_in} buy-in) <InfoTooltip text="Select the players who paid into the Deuce Pot. Only these players can win it by making a 2 on a par-3." /></p>
              <div className="flex gap-2">
                <button onClick={() => updateDeuce(allPlayerIds)} className="text-xs text-primary underline">Select All</button>
                <button onClick={() => updateDeuce([])} className="text-xs text-muted-foreground underline">Clear</button>
              </div>
            </div>
            <div className="space-y-2 ml-2">
              {players.map(player => (
                <div key={player.player_id} className="flex items-center gap-2">
                  <Checkbox
                    id={`deuce-${player.player_id}`}
                    checked={deucePlayerIds.includes(player.player_id)}
                    onCheckedChange={() => toggleDeuce(player.player_id)}
                  />
                  <Label htmlFor={`deuce-${player.player_id}`} className="text-sm cursor-pointer">
                    {player.name}
                  </Label>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {deucePlayerIds.length} of {players.length} players selected
            </p>
            {deucePlayerIds.length === 0 && (
              <div className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                No players selected — the Deuce Pot will not be calculated. Select at least one player.
              </div>
            )}
          </div>
        )}

        {round.kps_enabled && round.kp_separate_buy_in && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium flex items-center">KP Pool (${round.kp_buy_in} buy-in) <InfoTooltip text="Select the players who paid into the KP (Closest to Pin) pool. Only these players compete for and can win KP prizes." /></p>
              <div className="flex gap-2">
                <button onClick={() => updateKP(allPlayerIds)} className="text-xs text-primary underline">Select All</button>
                <button onClick={() => updateKP([])} className="text-xs text-muted-foreground underline">Clear</button>
              </div>
            </div>
            <div className="space-y-2 ml-2">
              {players.map(player => (
                <div key={player.player_id} className="flex items-center gap-2">
                  <Checkbox
                    id={`kp-${player.player_id}`}
                    checked={kpPlayerIds.includes(player.player_id)}
                    onCheckedChange={() => toggleKP(player.player_id)}
                  />
                  <Label htmlFor={`kp-${player.player_id}`} className="text-sm cursor-pointer">
                    {player.name}
                  </Label>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {kpPlayerIds.length} of {players.length} players selected
            </p>
            {kpPlayerIds.length === 0 && (
              <div className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                No players selected — the KP Pool will not be calculated. Select at least one player.
              </div>
            )}
          </div>
        )}

        {round.gross_skins_enabled && round.gross_skins_separate_buy_in && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium flex items-center">Gross Skins Pool (${round.gross_skins_buy_in} buy-in) <InfoTooltip text="Select who paid into the separate Gross Skins pot. Only these players' raw scores compete for gross skins." /></p>
              <div className="flex gap-2">
                <button onClick={() => updateGrossSkins(allPlayerIds)} className="text-xs text-primary underline">Select All</button>
                <button onClick={() => updateGrossSkins([])} className="text-xs text-muted-foreground underline">Clear</button>
              </div>
            </div>
            <div className="space-y-2 ml-2">
              {players.map(player => (
                <div key={player.player_id} className="flex items-center gap-2">
                  <Checkbox
                    id={`gross-skins-${player.player_id}`}
                    checked={grossSkinsPlayerIds.includes(player.player_id)}
                    onCheckedChange={() => toggleGrossSkins(player.player_id)}
                  />
                  <Label htmlFor={`gross-skins-${player.player_id}`} className="text-sm cursor-pointer">
                    {player.name}
                  </Label>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {grossSkinsPlayerIds.length} of {players.length} players selected
            </p>
            {grossSkinsPlayerIds.length === 0 && (
              <div className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                No players selected — Gross Skins will not be calculated. Select at least one player.
              </div>
            )}
          </div>
        )}

        {round.net_skins_enabled && round.net_skins_separate_buy_in && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium flex items-center">Net Skins Pool (${round.net_skins_buy_in} buy-in) <InfoTooltip text="Select who paid into the separate Net Skins pot. Only these players' handicap-adjusted scores compete for net skins." /></p>
              <div className="flex gap-2">
                <button onClick={() => updateNetSkins(allPlayerIds)} className="text-xs text-primary underline">Select All</button>
                <button onClick={() => updateNetSkins([])} className="text-xs text-muted-foreground underline">Clear</button>
              </div>
            </div>
            <div className="space-y-2 ml-2">
              {players.map(player => (
                <div key={player.player_id} className="flex items-center gap-2">
                  <Checkbox
                    id={`net-skins-${player.player_id}`}
                    checked={netSkinsPlayerIds.includes(player.player_id)}
                    onCheckedChange={() => toggleNetSkins(player.player_id)}
                  />
                  <Label htmlFor={`net-skins-${player.player_id}`} className="text-sm cursor-pointer">
                    {player.name}
                  </Label>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {netSkinsPlayerIds.length} of {players.length} players selected
            </p>
            {netSkinsPlayerIds.length === 0 && (
              <div className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                No players selected — Net Skins will not be calculated. Select at least one player.
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
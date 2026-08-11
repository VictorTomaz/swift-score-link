import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import InfoTooltip from "@/components/InfoTooltip";

export default function CustomModeSettings({ form, update: updateRaw }) {
  const update = (key, value) => {
    if (typeof key === 'object') return updateRaw(key);
    return updateRaw({ [key]: value });
  };

  const [grossInput, setGrossInput] = React.useState(String(form.custom_gross_places ?? ''));
  const [netInput, setNetInput] = React.useState(String(form.custom_net_places ?? ''));
  const placeP = Number(form.custom_place_payout_percent) || 0;
  const gamesP = Number(form.custom_games_percent) || 0;
  const placeSplitTotal = placeP + gamesP;
  const placeSplitValid = Math.round(placeSplitTotal) === 100;

  const totalPot = (Number(form.buy_in) || 0) * (Number(form.player_count) || 0);
  const placePayoutPot = totalPot * (placeP / 100);
  const gamesPot = totalPot * (gamesP / 100);
  const grossPlaces = form.custom_gross_places !== "" && form.custom_gross_places !== null ? Number(form.custom_gross_places) : 0;
  const netPlaces = form.custom_net_places !== "" && form.custom_net_places !== null ? Number(form.custom_net_places) : 0;

  const totalPlacesForSplit = grossPlaces + netPlaces;
  const grossPlacePot = totalPlacesForSplit > 0 ? placePayoutPot * (grossPlaces / totalPlacesForSplit) : 0;
  const netPlacePot = totalPlacesForSplit > 0 ? placePayoutPot * (netPlaces / totalPlacesForSplit) : 0;
  const totalPlacesPaid = grossPlaces + netPlaces;

  const mainGame = form.games?.find(g => g.is_main) || form.games?.[0];
  const isTeam = mainGame?.type === 'team' || form.team_mode || (form.game_type && form.game_type !== 'individual');
  const isChild = !!form.parent_round_id;
  const isMultiFlight = !!form.is_multi_flight || form.series_type === 'multi_flight';
  // A new flight collects its own entry fee (buy-in > 0) and sets its own
  // payout depth. An additional day of an existing flight has buy-in = 0
  // (fee collected on Day 1) — places are frozen, inherited from Day 1.
  const isFrozenPlaces = isChild && (!isMultiFlight || Number(form.buy_in) === 0);
  const teamSize = mainGame?.team_size || form.team_size || 2;
  const playerCount = Number(form.player_count) || 1;
  const fieldCount = isTeam ? Math.max(1, Math.round(playerCount / teamSize)) : playerCount;
  const fieldPayPercent = (totalPlacesPaid / fieldCount) * 100;

  // Detect if the games pot has nowhere to go
  const grossSkinsTakesPot = form.gross_skins_enabled && !form.gross_skins_separate_buy_in;
  const netSkinsTakesPot = form.net_skins_enabled && !form.net_skins_separate_buy_in;
  const kpTakesPot = form.kps_enabled && !form.kp_separate_buy_in && !form.gross_skins_enabled && !form.net_skins_enabled;
  const anySideGameEnabled = form.gross_skins_enabled || form.net_skins_enabled || form.kps_enabled;
  const gamesPotStranded = gamesP > 0 && anySideGameEnabled && !grossSkinsTakesPot && !netSkinsTakesPot && !kpTakesPot;

  return (

    <Card className="border-0 shadow-sm mt-4">
      <CardHeader>
        <CardTitle className="text-base font-semibold">Custom Payout Settings</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">

        {/* Total pot preview */}
        {totalPot > 0 && (
          <div className="bg-muted/50 rounded-lg p-3 text-sm text-center text-muted-foreground">
            Total Pot: <span className="font-bold text-foreground">${totalPot.toFixed(2)}</span>
          </div>
        )}

        {/* Pot split */}
        <div>
          <p className="text-sm font-medium mb-3 flex items-center gap-1">Pot Split <InfoTooltip text="Divide the total pot between place payouts (gross/net standings) and side games (skins, KPs)." /></p>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label className="text-xs flex items-center gap-1">Place Payouts % <InfoTooltip text="Percentage of the total pot awarded to players based on their gross and net finishing positions." /></Label>
              <div className="flex gap-1">
                  <Input
                    type="number" min={0} max={100}
                    value={form.custom_place_payout_percent ?? ""}
                    onChange={e => {
                      const v = e.target.value === "" ? "" : Number(e.target.value);
                      update("custom_place_payout_percent", v);
                      if (v !== "") update("custom_games_percent", Math.max(0, 100 - v));
                    }}
                    onFocus={e => e.target.select()}
                  />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-10 px-2"
                  onClick={() => {
                    update("custom_place_payout_percent", "");
                    update("custom_games_percent", "");
                  }}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
              {placePayoutPot > 0 && <p className="text-xs text-muted-foreground">${placePayoutPot.toFixed(2)}</p>}
            </div>
            <div className="space-y-1">
              <Label className="text-xs flex items-center gap-1">Side Games % <InfoTooltip text="Percentage of the total pot allocated to side games like skins and KPs." /></Label>
              <div className="flex gap-1">
                <Input
                   type="number" min={0} max={100}
                   value={form.custom_games_percent ?? ""}
                   onChange={e => {
                     const v = e.target.value === "" ? "" : Number(e.target.value);
                     update("custom_games_percent", v);
                     if (v !== "") update("custom_place_payout_percent", Math.max(0, 100 - v));
                   }}
                   onFocus={e => e.target.select()}
                 />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-10 px-2"
                  onClick={() => {
                    update("custom_games_percent", "");
                    update("custom_place_payout_percent", "");
                  }}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
              {gamesPot > 0 && <p className="text-xs text-muted-foreground">${gamesPot.toFixed(2)}</p>}
              </div>
              </div>
              {placePayoutPot > 0 && (
              <div className="mt-3 p-3 bg-muted/30 rounded-lg text-xs text-muted-foreground">
              <p>Place Pot Breakdown: <span className="font-semibold text-foreground">${grossPlacePot.toFixed(2)} gross + ${netPlacePot.toFixed(2)} net</span></p>
              </div>
              )}
          {!placeSplitValid && (placeP > 0 || gamesP > 0) && (
            <p className="text-xs text-destructive mt-1">Must total 100% (currently {placeSplitTotal}%)</p>
          )}
          {gamesPotStranded && (
            <p className="text-xs text-amber-600 mt-1">⚠️ The {gamesP}% Side Games pot (${gamesPot.toFixed(2)}) has nowhere to go — all side games are using separate buy-ins. Set Side Games % to 0%, or enable at least one side game without a separate buy-in.</p>
          )}
        </div>


        {/* Places Paid */}
         {placeP > 0 && (
         <div className={isFrozenPlaces ? 'opacity-50 pointer-events-none' : ''}>
           <p className="text-sm font-medium mb-3">Places Paid</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-xs flex items-center gap-1">Gross Spots Paid <InfoTooltip text="Number of gross finishing positions that receive payouts." /></Label>
                <div className="flex gap-1">
                  <Input
                    type="number" min={0} max={playerCount}
                    value={grossInput}
                    disabled={isFrozenPlaces}
                    onChange={e => {
                      setGrossInput(e.target.value);
                      if (e.target.value !== '') update("custom_gross_places", Number(e.target.value));
                    }}
                    onBlur={() => {
                      const n = grossInput === '' ? 0 : Number(grossInput);
                      setGrossInput(String(n));
                      update("custom_gross_places", n);
                    }}
                    onFocus={e => e.target.select()}
                  />
                  <Button variant="ghost" size="icon" className="h-10 px-2" disabled={isFrozenPlaces} onClick={() => { setGrossInput('0'); update("custom_gross_places", 0); }}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs flex items-center gap-1">Net Spots Paid <InfoTooltip text="Number of net finishing positions that receive payouts." /></Label>
                <div className="flex gap-1">
                  <Input
                    type="number" min={0} max={playerCount}
                    value={netInput}
                    disabled={isFrozenPlaces}
                    onChange={e => {
                      setNetInput(e.target.value);
                      if (e.target.value !== '') update("custom_net_places", Number(e.target.value));
                    }}
                    onBlur={() => {
                      const n = netInput === '' ? 0 : Number(netInput);
                      setNetInput(String(n));
                      update("custom_net_places", n);
                    }}
                    onFocus={e => e.target.select()}
                  />
                  <Button variant="ghost" size="icon" className="h-10 px-2" disabled={isFrozenPlaces} onClick={() => { setNetInput('0'); update("custom_net_places", 0); }}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
            {fieldPayPercent > 0 && placeP > 0 && (
              <p className="text-xs text-muted-foreground text-center mt-2">
                Total: {fieldPayPercent.toFixed(1)}% of field paid ({totalPlacesPaid} of {fieldCount} {isTeam ? 'teams' : 'players'})
              </p>
            )}
            {isFrozenPlaces && (
              <p className="text-xs text-muted-foreground text-center mt-2 italic">
                Inherited from Day 1 — places paid are set on the first day of this flight.
              </p>
            )}
            {isChild && !isFrozenPlaces && (
              <p className="text-xs text-muted-foreground text-center mt-2 italic">
                Each flight sets its own payout depth — configure this flight's places independently.
              </p>
            )}
         </div>
         )}

        {/* Payout curve note */}
        <p className="text-xs text-muted-foreground italic">
          Payouts use a 0.75× descending curve: 1st place earns the most, each subsequent place is 75% of the previous.
        </p>

      </CardContent>
    </Card>
  );
}
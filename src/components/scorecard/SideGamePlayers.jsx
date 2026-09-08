import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import InfoTooltip from "@/components/InfoTooltip";
import { Label } from "@/components/ui/label";
import { AlertTriangle } from "lucide-react";
import useSideGamePool from "@/hooks/useSideGamePool";
import { teamSideGamesActive } from "@/lib/teamScoreEngine";

export default function SideGamePlayers({ round, onUpdate }) {
  const players = round.players || [];

  const allPlayerIds = players.map(p => p.player_id);

  // An unconfigured pool means everyone; an explicitly cleared pool means nobody.
  // Each pool keeps its own authoritative selection so a stripped realtime
  // broadcast can never re-check boxes the organizer unchecked.
  const deuce = useSideGamePool(round.deuce_player_ids, allPlayerIds, (v) => onUpdate({ deuce_player_ids: v }));
  const kp = useSideGamePool(round.kp_player_ids, allPlayerIds, (v) => onUpdate({ kp_player_ids: v }));
  const grossSkins = useSideGamePool(round.gross_skins_player_ids, allPlayerIds, (v) => onUpdate({ gross_skins_player_ids: v }));
  const netSkins = useSideGamePool(round.net_skins_player_ids, allPlayerIds, (v) => onUpdate({ net_skins_player_ids: v }));

  const deucePlayerIds = deuce.selectedIds;
  const kpPlayerIds = kp.selectedIds;
  const grossSkinsPlayerIds = grossSkins.selectedIds;
  const netSkinsPlayerIds = netSkins.selectedIds;

  const updateDeuce = deuce.update;
  const updateKP = kp.update;
  const updateGrossSkins = grossSkins.update;
  const updateNetSkins = netSkins.update;

  const toggleDeuce = deuce.toggle;
  const toggleKP = kp.toggle;
  const toggleGrossSkins = grossSkins.toggle;
  const toggleNetSkins = netSkins.toggle;

  // ─── TEAM-LEVEL SELECTION ───────────────────────────────────
  // The view follows the setup wizard's "Team Side Games" toggle (skins_team_mode):
  //   ON  → team-level selection (check a whole team at once)
  //   OFF → individual selection
  const isTeamMode = !!round.team_mode;
  const isTeamView = isTeamMode && teamSideGamesActive(round);

  // Group ALL roster players into teams (mirrors buildTeams but includes unscored players)
  const teams = React.useMemo(() => {
    if (!isTeamMode) return [];
    const teamSize = round.team_size || 2;
    const hasGroupTags = players.some(p => (p.tee_group || "").trim());
    if (hasGroupTags) {
      const groups = {};
      const unassigned = [];
      for (const p of players) {
        const tag = (p.tee_group || "").trim();
        if (tag) {
          if (!groups[tag]) groups[tag] = [];
          groups[tag].push(p);
        } else {
          unassigned.push(p);
        }
      }
      const grouped = Object.keys(groups).sort().map(tag => ({
        team_id: tag,
        team_name: groups[tag].map(p => p.name).join(" / "),
        members: groups[tag],
      }));
      unassigned.forEach(p => {
        grouped.push({ team_id: `solo_${p.player_id}`, team_name: p.name, members: [p] });
      });
      return grouped;
    }
    const result = [];
    for (let i = 0; i < players.length; i += teamSize) {
      const members = players.slice(i, i + teamSize);
      const label = String.fromCharCode(65 + Math.floor(i / teamSize));
      result.push({
        team_id: `auto_${label}`,
        team_name: members.map(p => p.name).join(" / "),
        members,
      });
    }
    return result;
  }, [isTeamMode, players, round.team_size]);

  // Toggle an entire team: if all members are in the pool, remove them; otherwise add them all
  const toggleTeam = (memberIds, selectedIds, updateFn) => {
    const allIn = memberIds.every(id => selectedIds.includes(id));
    if (allIn) {
      updateFn(selectedIds.filter(id => !memberIds.includes(id)));
    } else {
      updateFn([...new Set([...selectedIds, ...memberIds])]);
    }
  };

  // Render the checkbox list for a side game pool — team view or individual view
  const renderPoolList = (selectedIds, toggleFn, idPrefix) => {
    if (isTeamView && teams.length > 0) {
      return (
        <div className="space-y-2 ml-2">
          {teams.map(team => {
            const memberIds = team.members.map(m => m.player_id);
            const allIn = memberIds.every(id => selectedIds.includes(id));
            return (
              <div key={team.team_id} className="flex items-start gap-2">
                <Checkbox
                  id={`${idPrefix}-team-${team.team_id}`}
                  checked={allIn}
                  onCheckedChange={() => toggleTeam(memberIds, selectedIds, (ids) => {
                    if (idPrefix === 'deuce') updateDeuce(ids);
                    else if (idPrefix === 'kp') updateKP(ids);
                    else if (idPrefix === 'gross-skins') updateGrossSkins(ids);
                    else updateNetSkins(ids);
                  })}
                />
                <div className="flex flex-col">
                  <Label htmlFor={`${idPrefix}-team-${team.team_id}`} className="text-sm cursor-pointer font-medium">
                    {team.team_name}
                  </Label>
                  {team.members.length > 1 && (
                    <span className="text-xs text-muted-foreground">
                      {team.members.length} players
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      );
    }
    return (
      <div className="space-y-2 ml-2">
        {players.map(player => (
          <div key={player.player_id} className="flex items-center gap-2">
            <Checkbox
              id={`${idPrefix}-${player.player_id}`}
              checked={selectedIds.includes(player.player_id)}
              onCheckedChange={() => toggleFn(player.player_id)}
            />
            <Label htmlFor={`${idPrefix}-${player.player_id}`} className="text-sm cursor-pointer">
              {player.name}
            </Label>
          </div>
        ))}
      </div>
    );
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
            {renderPoolList(deucePlayerIds, toggleDeuce, 'deuce')}
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
            {renderPoolList(kpPlayerIds, toggleKP, 'kp')}
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
            {renderPoolList(grossSkinsPlayerIds, toggleGrossSkins, 'gross-skins')}
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
            {renderPoolList(netSkinsPlayerIds, toggleNetSkins, 'net-skins')}
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
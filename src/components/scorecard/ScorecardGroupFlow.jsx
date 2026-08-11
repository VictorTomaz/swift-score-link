import React, { useState, useEffect, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Lock, Users, Clock } from "lucide-react";
import { isSingleTeamScoreFormat, getEntryTeams } from "@/lib/teamScoreEntry";

// Safeguard: restore round players from sessionStorage if empty
const getRoundPlayersFromStorage = (roundId) => {
  try {
    const stored = sessionStorage.getItem(`round_${roundId}`);
    return stored ? JSON.parse(stored).players : null;
  } catch {
    return null;
  }
};

/**
 * ScorecardGroupFlow
 *
 * Manages sequential score entry for a physical scorecard group (2–4 players).
 * Players are grouped by tee time (and group tag in team mode) so teammates
 * stay together in the selection UI.
 */
export default function ScorecardGroupFlow({
  round,
  onPlayerSelect,
  selectedForGroup = [],
  onSelectedForGroupChange,
  onGroupLocked,
  onVerified,
  onEdit,
  currentPlayerId,
  completedPlayerIds = [],
  showVerify,
  verifyTotals,
  verifyPlayerName,
  scoreMode = 'tap',
}) {
  // Safeguard: restore players from sessionStorage if round.players is empty
  let players = round.players || [];
  if (!players.length && round.id) {
    const stored = getRoundPlayersFromStorage(round.id);
    if (stored?.length) {
      players = stored;
    }
  }

  // lockedPlayerIds is determined by whether we have selectedForGroup set
  const lockedPlayerIds = selectedForGroup.length > 0 ? selectedForGroup : null;

  // Group players by tee time + group tag (team mode) or just tee time.
  // Match the full team-mode detection used everywhere else (team_mode flag
  // OR a team game_type) — the setup wizard doesn't set team_mode for team
  // game types like aggregate, so checking the flag alone misses them and
  // teammates end up split apart in the score-entry UI.
  const isTeamMode = round.team_mode === true ||
    ["team_scramble", "team_best_ball", "team_6_6_6", "team_chapman", "team_aggregate"].includes(round.game_type);
  const isTeamScore = isSingleTeamScoreFormat(round);
  const teams = isTeamScore ? getEntryTeams(round) : [];
  const playerGroups = useMemo(() => {
    // Team-mode rounds that keep per-player entry (best ball, aggregate):
    // group players by team using the same auto-split logic as the scorecard
    // (tee_group tag, else auto-split by team_size) so teammates stay together
    // even when no tee_group tags were assigned.
    if (isTeamMode && !isTeamScore) {
      const entryTeams = getEntryTeams(round);
      return entryTeams.map((team) => ({
        label: team.label || team.name,
        players: team.members,
      }));
    }
    const groups = {};
    const ungrouped = [];
    for (const p of players) {
      const teeTime = (p.tee_time || "").trim();
      if (!teeTime) {
        ungrouped.push(p);
        continue;
      }
      const key = `Tee ${teeTime}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(p);
    }
    const groupKeys = Object.keys(groups).sort();
    const result = [];
    for (const key of groupKeys) {
      result.push({ label: key, players: groups[key] });
    }
    if (ungrouped.length > 0) {
      result.push({ label: "Unassigned", players: ungrouped });
    }
    return result;
  }, [players, isTeamMode, isTeamScore, round]);

  const togglePlayerForGroup = (id) => {
    const newSelected = selectedForGroup.includes(id)
      ? selectedForGroup.filter(x => x !== id)
      : [...selectedForGroup, id];
    onSelectedForGroupChange?.(newSelected);
  };

  const toggleTeam = (team) => {
    const allSelected = team.memberIds.every(id => selectedForGroup.includes(id));
    onSelectedForGroupChange?.(allSelected ? [] : [...team.memberIds]);
  };

  const selectGroup = (groupPlayers) => {
    // Toggle: if all are already selected, deselect; else select all
    const allSelected = groupPlayers.every(p => selectedForGroup.includes(p.player_id) || completedPlayerIds?.includes(p.player_id));
    if (allSelected) {
      // Deselect this group
      const idsToRemove = groupPlayers.map(p => p.player_id);
      onSelectedForGroupChange?.(selectedForGroup.filter(id => !idsToRemove.includes(id)));
    } else {
      // Select all eligible (not completed) players in this group
      const eligible = groupPlayers
        .filter(p => !completedPlayerIds?.includes(p.player_id))
        .map(p => p.player_id);
      const newSet = [...new Set([...selectedForGroup, ...eligible])];
      onSelectedForGroupChange?.(newSet);
    }
  };

  const scrollToScoreEntry = () => {
    setTimeout(() => {
      const el = document.getElementById('score-entry-area');
      if (el) {
        const y = el.getBoundingClientRect().top + window.scrollY - 60;
        window.scrollTo({ top: y, behavior: 'smooth' });
      }
    }, 300);
  };

  const scrollToVoiceEntry = () => {
    setTimeout(() => {
      const el = document.getElementById('voice-entry-area');
      if (el) {
        const y = el.getBoundingClientRect().top + window.scrollY - 80;
        window.scrollTo({ top: y, behavior: 'smooth' });
      }
    }, 300);
  };

  const lockGroup = () => {
    if (selectedForGroup.length < 1) return;
    onGroupLocked?.(selectedForGroup);
    onPlayerSelect(selectedForGroup[0]);
    scrollToScoreEntry();
  };

  const lockGroupForType = () => {
    if (selectedForGroup.length < 1) return;
    onGroupLocked?.(selectedForGroup);
    onPlayerSelect(selectedForGroup[0]);
    scrollToScoreEntry();
  };

  const lockGroupForDictate = () => {
    if (selectedForGroup.length < 1) return;
    onGroupLocked?.(selectedForGroup);
    onPlayerSelect(selectedForGroup[0]);
    scrollToVoiceEntry();
  };

  // ── Player List (always visible) ──
   const playerListContent = (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Users className="w-4 h-4 text-primary" />
          <p className="text-sm font-semibold text-foreground">Select Scorecard Players</p>
        </div>
       {lockedPlayerIds && (
         <p className="text-xs text-muted-foreground mb-3">
           Current scorecard selected. Check players for next scorecard or continue below.
         </p>
       )}
       {!lockedPlayerIds && (
         <p className="text-xs text-muted-foreground mb-3">
           {isTeamScore
             ? "Pick a team, then lock to enter one team score per hole."
             : "Pick 1–5 players from this physical scorecard, then lock to begin entry."}
         </p>
       )}
       {isTeamScore ? (
         <div className="mb-4 last:mb-0">
           <div className="flex items-center gap-1.5 mb-2">
             <Users className="w-3 h-3 text-muted-foreground" />
             <span className="text-xs font-semibold text-muted-foreground">Teams</span>
             <span className="text-xs text-muted-foreground/60">({teams.length})</span>
           </div>
           <div className="grid grid-cols-1 gap-2">
             {teams.map((team) => {
               const selected = team.memberIds.every(id => selectedForGroup.includes(id));
               const isCompleted = team.memberIds.every(id => completedPlayerIds?.includes(id));
               return (
                 <button
                   key={team.id}
                   onClick={() => !isCompleted && toggleTeam(team)}
                   disabled={isCompleted}
                   className={`p-3 rounded-lg text-left border-2 transition-all min-h-[auto] ${
                     isCompleted
                       ? "border-green-500 bg-green-100 cursor-default"
                       : selected
                       ? "border-primary bg-primary/5"
                       : "border-border hover:border-primary/50"
                   }`}
                 >
                   <div className="flex items-start justify-between gap-2">
                     <div className="min-w-0 flex-1">
                       <p className={`font-medium text-sm leading-tight break-words ${isCompleted ? "text-green-800" : "text-foreground"}`}>{team.label}</p>
                       <p className={`text-xs ${isCompleted ? "text-green-700" : "text-muted-foreground"}`}>
                         {team.members.map(m => m.name).join(" · ")}
                       </p>
                     </div>
                     <div className="flex-shrink-0">
                       {isCompleted && <CheckCircle2 className="w-4 h-4 text-green-600" />}
                       {!isCompleted && selected && <CheckCircle2 className="w-4 h-4 text-primary" />}
                     </div>
                   </div>
                 </button>
               );
             })}
           </div>
         </div>
       ) : (
         playerGroups.map((g, gi) => (
           <div key={gi} className="mb-4 last:mb-0">
             {/* Group header with Select All toggle */}
             <div className="flex items-center justify-between mb-2">
               <div className="flex items-center gap-1.5">
                 <Clock className="w-3 h-3 text-muted-foreground" />
                 <span className="text-xs font-semibold text-muted-foreground">{g.label}</span>
                 <span className="text-xs text-muted-foreground/60">({g.players.length})</span>
               </div>
               <button
                 onClick={() => selectGroup(g.players)}
                 className="text-xs font-medium text-primary hover:underline"
               >
                 {g.players.every(p => selectedForGroup.includes(p.player_id) || completedPlayerIds?.includes(p.player_id))
                   ? "Deselect" : "Select Group"}
               </button>
             </div>
             <div className="grid grid-cols-2 gap-2">
                {g.players.map(player => {
                  const selected = selectedForGroup.includes(player.player_id);
                   const isCompleted = completedPlayerIds?.includes(player.player_id);
                   return (
                     <button
                       key={player.player_id}
                       onClick={() => !isCompleted && togglePlayerForGroup(player.player_id)}
                       disabled={isCompleted}
                       className={`p-3 rounded-lg text-left border-2 transition-all min-h-[auto] ${
                         isCompleted
                           ? "border-green-500 bg-green-100 cursor-default"
                           : selected
                           ? "border-primary bg-primary/5"
                           : "border-border hover:border-primary/50"
                       }`}
                     >
                       <div className="flex items-start justify-between gap-2">
                         <div className="min-w-0 flex-1">
                           <p className={`font-medium text-sm leading-tight break-words ${isCompleted ? "text-green-800" : "text-foreground"}`}>{player.name}</p>
                           <p className={`text-xs ${isCompleted ? "text-green-700" : "text-muted-foreground"}`}>
                             {player.course_handicap != null
                               ? `CH ${player.course_handicap < 0 ? `+${Math.abs(player.course_handicap)}` : player.course_handicap}`
                               : `HI ${player.is_plus_handicap ? `+${player.handicap}` : player.handicap}`}
                           </p>
                         </div>
                         <div className="flex-shrink-0">
                           {isCompleted && <CheckCircle2 className="w-4 h-4 text-green-600" />}
                           {!isCompleted && selected && <CheckCircle2 className="w-4 h-4 text-primary" />}
                         </div>
                       </div>
                     </button>
                   );
                })}
             </div>
           </div>
         ))
       )}
       <Button
         className="w-full gap-2 active:scale-95 transition-transform"
         disabled={selectedForGroup.length < 1}
         onClick={() => {
           if (scoreMode === 'tap') lockGroup();
           else if (scoreMode === 'type') lockGroupForType();
           else if (scoreMode === 'dictate') lockGroupForDictate();
         }}
       >
         <Lock className="w-4 h-4" />
         {lockedPlayerIds ? "Start Next Scorecard" : "Start Scorecard"} ({selectedForGroup?.length || 0})
       </Button>
      </CardContent>
    </Card>
  );

  // ── Verify screen (shown after hole 18) — full-screen modal ──
  const verifyCard = showVerify && lockedPlayerIds ? (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="border-0 shadow-lg w-full max-w-sm">
        <CardContent className="p-8 text-center space-y-6">
          <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto" />
          <div>
            <p className="text-xl font-bold text-foreground">{verifyPlayerName}</p>
            <p className="text-sm text-muted-foreground">18 holes complete</p>
          </div>
          {verifyTotals && (
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-secondary/40 rounded-lg p-4">
                <p className="text-xs text-muted-foreground">Front 9</p>
                <p className="text-3xl font-bold text-foreground">{verifyTotals.front9 != null ? verifyTotals.front9 : "—"}</p>
              </div>
              <div className="bg-secondary/40 rounded-lg p-4">
                <p className="text-xs text-muted-foreground">Back 9</p>
                <p className="text-3xl font-bold text-foreground">{verifyTotals.back9 != null ? verifyTotals.back9 : "—"}</p>
              </div>
              <div className="bg-primary/10 rounded-lg p-4">
                <p className="text-xs text-muted-foreground">Total</p>
                <p className="text-3xl font-bold text-primary">{verifyTotals.total != null ? verifyTotals.total : "—"}</p>
              </div>
            </div>
          )}
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => onEdit?.()}>Edit</Button>
            <Button className="flex-1" onClick={() => onVerified(currentPlayerId)}>Verify & Continue</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  ) : null;

  // ── Active entry — show player progress strip ──
   const groupPlayers = lockedPlayerIds ? players.filter(p => lockedPlayerIds.includes(p.player_id)) : [];
  const progressCard = lockedPlayerIds && !showVerify ? (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-wide">Scorecard Progress</p>
        {isTeamScore ? (
          (() => {
            const team = teams.find(t => t.memberIds.every(id => lockedPlayerIds.includes(id)))
              || teams.find(t => t.memberIds.some(id => lockedPlayerIds.includes(id)));
            if (!team) return null;
            const isDone = team.memberIds.every(id => completedPlayerIds.includes(id));
            return (
              <div className="flex gap-2">
                <div className={`flex-1 rounded-lg p-2 text-center border-2 ${isDone ? "border-green-500 bg-green-50" : "border-primary bg-primary/5"}`}>
                  {isDone ? (
                    <CheckCircle2 className="w-4 h-4 text-green-500 mx-auto mb-1" />
                  ) : (
                    <div className="w-2 h-2 rounded-full mx-auto mb-1 bg-primary" />
                  )}
                  <p className={`text-xs font-medium truncate ${isDone ? "text-green-600" : "text-primary"}`}>
                    {team.label}
                  </p>
                </div>
              </div>
            );
          })()
        ) : (
          <>
            <p className="text-xs text-muted-foreground mb-3">Tap any player to edit their scores</p>
            <div className="flex gap-2">
              {groupPlayers.map((player) => {
                const isActive = player.player_id === currentPlayerId;
                const isDone = completedPlayerIds.includes(player.player_id);
                return (
                  <button
                    key={player.player_id}
                    onClick={() => onPlayerSelect(player.player_id)}
                    className={`flex-1 rounded-lg p-2 text-center border-2 transition-all active:scale-95 ${
                      isDone
                        ? "border-green-500 bg-green-50"
                        : isActive
                        ? "border-primary bg-primary/5"
                        : "border-border bg-muted/30"
                    }`}
                  >
                    {isDone ? (
                      <CheckCircle2 className="w-4 h-4 text-green-500 mx-auto mb-1" />
                    ) : (
                      <div className={`w-2 h-2 rounded-full mx-auto mb-1 ${isActive ? "bg-primary" : "bg-muted-foreground/30"}`} />
                    )}
                    <p className={`text-xs font-medium truncate ${isActive ? "text-primary" : isDone ? "text-green-600" : "text-muted-foreground"}`}>
                      {player.name.split(" ")[0]}
                    </p>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  ) : null;

  return (
    <>
      {verifyCard}
      {progressCard}
      {playerListContent}
    </>
  );
}
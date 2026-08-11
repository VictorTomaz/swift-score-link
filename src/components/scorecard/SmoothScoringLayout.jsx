import React, { useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, CheckCircle2 } from "lucide-react";
import { isSingleTeamScoreFormat, getTeamOfPlayer } from "@/lib/teamScoreEntry";

/**
 * SmoothScoringLayout
 * 
 * A consolidated scoring interface that keeps everything visible at once:
 * - Current hole & par at top
 * - Player selector strip (always visible)
 * - Score buttons in a compact grid
 * - Quick score summary
 * - Verify button appears inline when ready
 * 
 * Eliminates unnecessary scrolling and keeps the flow seamless.
 */
export default function SmoothScoringLayout({
  round,
  currentHole,
  onHoleChange,
  selectedPlayer,
  onPlayerSelect,
  playerScores,
  onScoreTap,
  completedPlayerIds = [],
  groupLockedPlayerIds,
  showVerify,
  onVerifyClick,
  onVerifySubmit,
  dqFlags = {},
  flashedButton,
  onPointerDown,
  onPointerMove,
  isEditing = false,
}) {
  const holePar = round.par?.[currentHole] || 4;
  const currentPlayerData = round.players.find(p => p.player_id === selectedPlayer);
  const currentScores = playerScores[selectedPlayer] || [];
  
  const scoreButtons = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "X"];
  
  const calculateTotals = (scores) => {
    const isX = s => String(s).toUpperCase() === "X";
    const hasDQ = scores.some(isX);
    const sumNine = (arr) => {
      if (arr.some(isX)) return null;
      return arr.reduce((a, s) => { const n = Number(s); return a + (isNaN(n) ? 0 : n); }, 0);
    };
    const front9 = sumNine(scores.slice(0, 9));
    const back9 = sumNine(scores.slice(9, 18));
    const total = (front9 === null || back9 === null) ? null : front9 + back9;
    return { front9, back9, total, hasDQ };
  };
  
  const totals = currentScores.length === 18 ? calculateTotals(currentScores) : null;
  const allFilled = currentScores.length === 18 && currentScores.every(s => s && String(s).length > 0);
  const isCurrentPlayerDone = completedPlayerIds.includes(selectedPlayer);
  


  const totalPlayers = round.players?.length || 0;
  const allPlayersComplete = totalPlayers > 0 && completedPlayerIds.length >= totalPlayers && completedPlayerIds.length > 0;

  const isTeamScore = isSingleTeamScoreFormat(round);
  const activeTeam = isTeamScore ? getTeamOfPlayer(round, selectedPlayer) : null;
  const scoringHeader = isTeamScore ? (activeTeam?.label || "Team") : (currentPlayerData?.name || "");
  
  // Player group strip (always visible, compact)
  const groupPlayers = groupLockedPlayerIds ? round.players.filter(p => groupLockedPlayerIds.includes(p.player_id)) : [];
  
  return (
    <div className="max-w-2xl mx-auto space-y-3">
      {/* Hole header (compact) */}
      <div id="score-entry-area" className="flex items-center justify-between px-4 py-3 bg-primary/5 rounded-xl">
        <button type="button" disabled={currentHole === 0} onClick={() => onHoleChange(currentHole - 1)} className="w-9 h-9 flex items-center justify-center rounded-md bg-card text-foreground disabled:opacity-30">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="text-center">
          <p className="text-3xl font-bold text-foreground">Hole {currentHole + 1}</p>
          <p className="text-sm text-muted-foreground">Par {holePar}</p>
        </div>
        <button type="button" disabled={currentHole === 17} onClick={() => onHoleChange(currentHole + 1)} className="w-9 h-9 flex items-center justify-center rounded-md bg-card text-foreground disabled:opacity-30">
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Hole progress dots (one line, centered) */}
      <div className="flex justify-center gap-1 flex-wrap px-2">
        {Array.from({ length: 18 }, (_, i) => {
          const allFilled = round.players.every(p => playerScores[p.player_id]?.[i]);
          return (
            <button
              key={i}
              onClick={() => onHoleChange(i)}
              className={`w-6 h-6 rounded-full text-xs font-medium transition-all ${
                i === currentHole
                  ? "bg-primary text-primary-foreground"
                  : allFilled
                  ? "bg-primary/20 text-primary"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {i + 1}
            </button>
          );
        })}
      </div>

      {/* Player group progress (if in group mode) */}
      {groupLockedPlayerIds && groupPlayers.length > 0 && (
        isTeamScore ? (
          <div className="flex gap-2 px-2">
            <div className={`flex-1 rounded-lg p-2 text-center border-2 text-sm font-medium ${
              activeTeam && activeTeam.memberIds.every(id => completedPlayerIds.includes(id))
                ? "border-green-500 bg-green-50 text-green-700"
                : "border-primary bg-primary/5 text-primary"
            }`}>
              {activeTeam && activeTeam.memberIds.every(id => completedPlayerIds.includes(id))
                ? <CheckCircle2 className="w-4 h-4 mx-auto mb-1" /> : null}
              {activeTeam?.label || "Team"}
            </div>
          </div>
        ) : (
          <div className="flex gap-2 px-2">
            {groupPlayers.map((player) => {
              const isDone = completedPlayerIds.includes(player.player_id);
              const isActive = player.player_id === selectedPlayer;
              return (
                <button
                  key={player.player_id}
                  onClick={() => onPlayerSelect(player.player_id)}
                  className={`flex-1 rounded-lg p-2 text-center border-2 transition-all text-sm font-medium ${
                    isDone
                      ? "border-green-500 bg-green-50 text-green-700"
                      : isActive
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border bg-muted/30 text-muted-foreground"
                  }`}
                >
                  {isDone ? <CheckCircle2 className="w-4 h-4 mx-auto mb-1" /> : null}
                  {player.name.split(" ")[0]}
                </button>
              );
            })}
          </div>
        )
      )}

      {/* Score buttons (main action area) */}
      {currentPlayerData && (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xl font-bold text-foreground mb-3">{scoringHeader}</p>
            <div className="grid grid-cols-4 gap-2">
              {scoreButtons.map((score) => {
                const holeScore = String(playerScores[selectedPlayer]?.[currentHole] || "");
                const isSelected = holeScore === String(score) && holeScore !== "";
                const isFlashing = flashedButton === score;
                const isDoneFlash = flashedButton === `done_${score}`;
                const isBig = ["2", "3", "4", "5", "6", "7", "8"].includes(score);
                return (
                  <button
                    key={score}
                    type="button"
                    onPointerDown={(e) => {
                      onPointerDown(e);
                      if (navigator.vibrate) {
                        navigator.vibrate([15, 10, 15]);
                      }
                    }}
                    onClick={(e) => {
                      e.preventDefault();
                      onScoreTap(selectedPlayer, score);
                    }}
                    className={`rounded-md font-bold transition-all duration-75 active:opacity-75 active:scale-95 ${
                      isBig ? "col-span-1 row-span-2 h-28 text-4xl" : "h-10 text-sm"
                    } ${
                      isDoneFlash
                        ? "bg-destructive text-destructive-foreground scale-95 shadow-lg"
                        : isFlashing
                        ? "bg-accent text-accent-foreground scale-95 shadow-lg"
                        : isSelected
                        ? "bg-primary text-primary-foreground"
                        : score === "X"
                        ? "bg-destructive/40 text-red-700"
                        : "bg-secondary text-secondary-foreground"
                    }`}
                  >
                    {score}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Score summary + verify button (inline) */}
      {totals && (
        <Card className={`border-0 shadow-sm ${showVerify ? "bg-primary/5" : ""}`}>
          <CardContent className="p-4 space-y-3">
            <div>
              <p className="text-sm font-semibold text-foreground mb-2">Score Summary</p>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className={`rounded-lg p-2 ${totals.front9 === null ? "bg-destructive/10" : "bg-secondary/40"}`}>
                  <p className="text-xs text-muted-foreground">Front 9</p>
                  <p className={`font-bold text-lg ${totals.front9 === null ? "text-destructive" : "text-foreground"}`}>
                    {totals.front9 != null ? totals.front9 : "—"}
                  </p>
                </div>
                <div className={`rounded-lg p-2 ${totals.back9 === null ? "bg-destructive/10" : "bg-secondary/40"}`}>
                  <p className="text-xs text-muted-foreground">Back 9</p>
                  <p className={`font-bold text-lg ${totals.back9 === null ? "text-destructive" : "text-foreground"}`}>
                    {totals.back9 != null ? totals.back9 : "—"}
                  </p>
                </div>
                <div className={`rounded-lg p-2 ${totals.hasDQ ? "bg-destructive/10" : "bg-primary/10"}`}>
                  <p className="text-xs text-muted-foreground">Total</p>
                  <p className={`font-bold text-lg ${totals.hasDQ ? "text-destructive" : "text-primary"}`}>
                    {totals.hasDQ ? "DQ" : (totals.total != null ? totals.total : "—")}
                  </p>
                </div>
              </div>
              {totals.hasDQ && (
                <p className="text-xs text-destructive bg-destructive/10 rounded-md px-2 py-1 text-center">
                  ⚠️ Player has X (DQ) on one or more holes — excluded from gross/net payouts
                </p>
              )}
            </div>

            {dqFlags[selectedPlayer] && (
              <p className="text-xs text-destructive">⚠️ DQ (X marked)</p>
            )}

            {/* Verify button — shown inline when all 18 filled */}
            {groupLockedPlayerIds && allFilled && !isCurrentPlayerDone && !showVerify && (
              <Button className="w-full mt-2 gap-2" onClick={onVerifyClick}>
                Verify Scores
              </Button>
            )}

            {/* Verify action buttons — shown inline */}
            {showVerify && (
              <div className="flex gap-2 mt-3">
                <button type="button" onClick={() => onVerifyClick(false)} className="flex-1 py-2 px-4 rounded-md border-2 border-border bg-card text-foreground font-medium text-sm">
                  Edit
                </button>
                <Button className="flex-1" onClick={() => onVerifySubmit(selectedPlayer)}>
                  Verify & Continue
                </Button>
              </div>
            )}

            {allPlayersComplete && completedPlayerIds.length === (round.players?.length || 0) && (
              <div className="text-center py-4">
                <p className="text-3xl text-green-600 font-bold flex items-center justify-center gap-2">✅ All Scores In!</p>
                <p className="text-sm text-muted-foreground mt-2">
                  Scroll down to Compute Results or add another scorecard
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
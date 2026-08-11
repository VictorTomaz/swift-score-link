import React, { useState, useRef, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Zap, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import ScorecardGroupFlow from "@/components/scorecard/ScorecardGroupFlow";
import SmoothScoringLayout from "@/components/scorecard/SmoothScoringLayout";
import { isSingleTeamScoreFormat, getTeamOfPlayer } from "@/lib/teamScoreEntry";

// Banner removed - only one at page level
export default function TapScoreEntry({ round, onUpdate, onScoresChange, switchMode, initialScores, selectedPlayerId: externalSelectedPlayerId, onPlayerSelect,
  selectedForGroup, onSelectedForGroupChange, groupLockedPlayerIds, onGroupLocked, completedPlayerIds, onCompletedChange, showVerify, onShowVerifyChange, onPlayerScoreSave }) {
  const scoreMode = 'tap';
  const [currentHole, setCurrentHole] = useState(0);
  const [selectedPlayer, setSelectedPlayerLocal] = useState(externalSelectedPlayerId || round.players[0]?.player_id || null);
  const setSelectedPlayer = (id) => {
    setSelectedPlayerLocal(id);
    onPlayerSelect?.(id);
  };
  const [playerScores, setPlayerScores] = useState(() => {
    // initialScores comes from DB (via Scorecard parent) — always preferred.
    // sessionStorage is only a crash-recovery fallback for when DB has nothing yet.
    let sessionScores = null;
    try {
      const roundId = new URLSearchParams(window.location.search).get("id");
      const raw = roundId ? sessionStorage.getItem(`liveScores_${roundId}`) : null;
      sessionScores = raw ? JSON.parse(raw) : null;
    } catch {}

    const countValid = (arr) => arr ? arr.filter(s => s !== '' && s !== null && s !== undefined && s !== 0).length : 0;

    const initial = {};
    round.players.forEach(p => {
      const fromDb = initialScores?.[p.player_id]; // DB is authoritative
      const fromSession = sessionScores?.[p.player_id];
      // DB wins if it has data; only use session as crash-recovery when DB is empty
      const best = countValid(fromDb) > 0 ? fromDb : (fromSession || p.scores || new Array(18).fill(""));
      initial[p.player_id] = best.map(s => (s === 0 || s === null || s === undefined) ? '' : String(s));
    });
    return initial;
  });
  const [dqFlags, setDqFlags] = useState(() => {
    const initial = {};
    round.players.forEach(p => {
      initial[p.player_id] = p.grossNetDQ || false;
    });
    return initial;
  });

  const [flashedButton, setFlashedButton] = React.useState(null);
  const isTeamScore = isSingleTeamScoreFormat(round);
  const [clearConfirm, setClearConfirm] = React.useState(false);
  const [trialPressed, setTrialPressed] = React.useState(false);
  const pointerStartRef = React.useRef({ x: 0, y: 0 });
  const hasMovedRef = React.useRef(false);
  const updateDebounceRef = React.useRef(null);

  // Group flow state — all managed in parent via props (no local shadow copies)
  const setGroupLockedPlayerIds = onGroupLocked || (() => {});
  const setShowVerify = onShowVerifyChange || (() => {});

  // Sync initial scores up to parent on mount — but only if we actually have scores to report
  React.useEffect(() => {
    const hasAnyScore = Object.values(playerScores).some(arr =>
      arr.some(s => s !== '' && s !== null && s !== undefined && s !== 0)
    );
    if (hasAnyScore) {
      onScoresChange?.(playerScores);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync external player selection changes into local state
  React.useEffect(() => {
    if (externalSelectedPlayerId && externalSelectedPlayerId !== selectedPlayer) {
      setSelectedPlayerLocal(externalSelectedPlayerId);
    }
  }, [externalSelectedPlayerId]);

  // intentionally removed: do NOT sync initialScores into playerScores after mount.
  // Once the user starts tapping, local state is the source of truth and must never be overwritten.

  // Reset hole to 1 when player changes
  React.useEffect(() => {
    setCurrentHole(0);
  }, [selectedPlayer]);

  // Reset move flag when navigating holes to allow editing
  React.useEffect(() => {
    hasMovedRef.current = false;
  }, [currentHole]);



  const handleClearAllScores = () => {
    const cleared = {};
    round.players.forEach(p => {
      cleared[p.player_id] = new Array(18).fill("");
    });
    setPlayerScores(cleared);
    setDqFlags({});
    onScoresChange?.(cleared);
    // Persist cleared scores to sessionStorage + localStorage
    try {
      const roundId = new URLSearchParams(window.location.search).get("id");
      if (roundId) {
        sessionStorage.setItem(`liveScores_${roundId}`, JSON.stringify(cleared));
        localStorage.setItem(`liveScores_backup_${roundId}`, JSON.stringify(cleared));
      }
    } catch {}
    // Save cleared scores to RoundScore records immediately
    round.players.forEach(p => {
      onPlayerScoreSave?.(p.player_id, cleared[p.player_id]);
    });
    setClearConfirm(false);
    toast.success("All scores cleared");
  };

  const scoreButtons = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "X"];
  const holePar = round.par?.[currentHole] || 4;
  
  // Calculate completion status - updates whenever playerScores changes
  const allComplete = React.useMemo(() => {
    return round.players.every(p => {
      const scores = playerScores[p.player_id];
      if (!scores || scores.length !== 18) return false;
      return scores.every(s => s && String(s).length > 0);
    });
  }, [playerScores, round.players]);

  const calculateScoreTotals = (scores) => {
    const isX = s => String(s).toUpperCase() === "X";
    const hasDQ = scores.some(isX);
    const sumNine = (arr) => {
      if (arr.some(isX)) return null;
      return arr.reduce((sum, s) => { const n = Number(s); return sum + (isNaN(n) ? 0 : n); }, 0);
    };
    const front9 = sumNine(scores.slice(0, 9));
    const back9 = sumNine(scores.slice(9, 18));
    const total = (front9 === null || back9 === null) ? null : front9 + back9;
    return { front9, back9, total, hasDQ };
  };

  const handlePointerDown = (e) => {
    pointerStartRef.current = { x: e.clientX, y: e.clientY };
    hasMovedRef.current = false;
  };

  const handlePointerMove = (e) => {
    const moveX = Math.abs(e.clientX - pointerStartRef.current.x);
    const moveY = Math.abs(e.clientY - pointerStartRef.current.y);
    if (moveX > 20 || moveY > 20) {
      hasMovedRef.current = true;
    }
  };

  const handleScoreTap = (playerId, score) => {
    if (hasMovedRef.current) return;

    const team = isTeamScore ? getTeamOfPlayer(round, playerId) : null;
    const targets = team ? team.memberIds : [playerId];

    const newScores = { ...playerScores };
    for (const tid of targets) {
      newScores[tid] = [...(playerScores[tid] || new Array(18).fill(""))];
      newScores[tid][currentHole] = String(score);
    }

    setFlashedButton(score);
    setTimeout(() => setFlashedButton(null), 150);

    if (score === "X") {
      setDqFlags(d => {
        const nd = { ...d };
        targets.forEach(tid => { nd[tid] = true; });
        return nd;
      });
    }

    setPlayerScores(newScores);

    // PRIMARY: Save to RoundScore record — tiny, never hits size limit
    if (onPlayerScoreSave) {
      for (const tid of targets) {
        onPlayerScoreSave(tid, newScores[tid]);
      }
    }

    // Write directly to sessionStorage on every tap (no React state update in parent = no re-render cascade)
    try {
      const roundId = new URLSearchParams(window.location.search).get("id");
      if (roundId) {
        sessionStorage.setItem(`liveScores_${roundId}`, JSON.stringify(newScores));
        localStorage.setItem(`liveScores_backup_${roundId}`, JSON.stringify(newScores));
      }
    } catch {}

    // Notify parent debounced — only to keep liveScores ref in sync for compute, not for re-rendering
    if (updateDebounceRef.current) clearTimeout(updateDebounceRef.current);
    updateDebounceRef.current = setTimeout(() => {
      onScoresChange?.(newScores);
    }, 2000);

    if (currentHole < 17) {
      setCurrentHole(h => h + 1);
    } else {
      // Hole 18 complete — show verify
      setFlashedButton(`done_${score}`);
      setTimeout(() => {
        setFlashedButton(null);
        if (selectedForGroup.length > 0) {
          setShowVerify(true);
        }
      }, 600);
    }
  };

  const handleVerified = (playerId) => {
    if (isTeamScore) {
      const team = getTeamOfPlayer(round, playerId);
      const ids = team ? team.memberIds : [playerId];
      const newCompleted = [...new Set([...completedPlayerIds, ...ids])];
      onCompletedChange(newCompleted);
      setShowVerify(false);

      const allPlayersComplete = newCompleted.length >= round.players.length;
      if (!allPlayersComplete) {
        onSelectedForGroupChange([]);
        setSelectedPlayer(round.players[0]?.player_id || null);
        setCurrentHole(0);
        setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 300);
      }
      return;
    }

    const newCompleted = [...completedPlayerIds, playerId];
    onCompletedChange(newCompleted);
    setShowVerify(false);

    const currentIndex = selectedForGroup.indexOf(playerId);
    const nextPlayerId = selectedForGroup[currentIndex + 1];

    if (nextPlayerId) {
      // Next player in same group — scroll to score entry area
      setSelectedPlayer(nextPlayerId);
      setCurrentHole(0);
      setTimeout(() => {
        const scoreEntryArea = document.getElementById('score-entry-area');
        if (scoreEntryArea) {
          scoreEntryArea.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 300);
    } else {
      // Check if ALL players in the round are complete
      const allPlayersComplete = newCompleted.length >= round.players.length;

      if (allPlayersComplete) {
        // All done — no scroll needed
      } else {
        // More players to score — reset for next group
        onSelectedForGroupChange([]);
        setSelectedPlayer(round.players[0]?.player_id || null);
        setCurrentHole(0);
        // Scroll back up to player selection
        setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 300);
      }
    }
  };

  const clearAllScores = () => {
    const empty = {};
    round.players.forEach(p => { empty[p.player_id] = new Array(18).fill(""); });
    setPlayerScores(empty);
    onScoresChange?.(empty);
    setGroupLockedPlayerIds(null);
    onCompletedChange([]);
    setShowVerify(false);
    setCurrentHole(0);
    toast.success("All scores cleared");
  };

  const generateDummyScores = () => {
    setTrialPressed(true);
    setTimeout(() => setTrialPressed(false), 150);
    
    const newScores = {};
    const playerIds = round.players.map(p => p.player_id);
    playerIds.forEach(pid => {
      newScores[pid] = Array.from({ length: 18 }, () => String(Math.floor(Math.random() * 4) + 3));
    });
    // 2% chance per hole that the group gets a deuce (assigned to one random player)
    for (let h = 0; h < 18; h++) {
      if (Math.random() < 0.10 && playerIds.length > 0) {
        const lucky = playerIds[Math.floor(Math.random() * playerIds.length)];
        newScores[lucky][h] = "2";
      }
    }
    setPlayerScores(newScores);
    onScoresChange?.(newScores);
    toast.success("Dummy scores generated for all players");
  };

  const currentPlayerData = round.players.find(p => p.player_id === selectedPlayer);
  const currentScores = playerScores[selectedPlayer] || [];
  const currentTotals = currentScores?.length === 18 ? calculateScoreTotals(currentScores) : null;

  const verifyPlayerData = round.players.find(p => p.player_id === selectedPlayer);
  const verifyScores = playerScores[selectedPlayer] || [];
  const verifyTotals = verifyScores.length === 18 ? calculateScoreTotals(verifyScores) : null;
  const verifyName = isTeamScore ? (getTeamOfPlayer(round, selectedPlayer)?.label || "Team") : verifyPlayerData?.name;

  return (
    <div className="space-y-4 pb-20">
      {/* Group Flow / Player Selector */}
      <ScorecardGroupFlow
        round={round}
        onPlayerSelect={(id) => {
          setSelectedPlayer(id);
        }}
        selectedForGroup={selectedForGroup}
        onSelectedForGroupChange={onSelectedForGroupChange}
        onGroupLocked={(ids) => setGroupLockedPlayerIds(ids)}
        onVerified={handleVerified}
        onEdit={() => setShowVerify(false)}
        currentPlayerId={selectedPlayer}
        completedPlayerIds={completedPlayerIds}
        showVerify={showVerify}
        verifyTotals={verifyTotals}
        verifyPlayerName={verifyName}
        scoreMode={scoreMode}
      />

      {/* Clear all scores button */}
      <div className="px-4 space-y-4">
        {clearConfirm ? (
          <div className="flex items-center gap-3">
            <span className="text-sm text-destructive font-medium">Clear all scores?</span>
            <Button size="sm" onClick={handleClearAllScores} className="text-destructive">Yes</Button>
            <button type="button" onClick={() => setClearConfirm(false)} className="inline-flex items-center px-3 py-1.5 rounded-md border-2 border-border bg-card text-foreground text-sm font-medium">No</button>
          </div>
        ) : (
          <Button onClick={() => setClearConfirm(true)} variant="destructive" size="sm" className="w-full gap-2">
            🗑️ Clear all scores
          </Button>
        )}
      </div>

      {/* Smooth Scoring Layout — always show it */}
      <SmoothScoringLayout
        round={round}
        currentHole={currentHole}
        onHoleChange={setCurrentHole}
        selectedPlayer={selectedPlayer}
        onPlayerSelect={setSelectedPlayer}
        playerScores={playerScores}
        onScoreTap={handleScoreTap}
        completedPlayerIds={completedPlayerIds}
        groupLockedPlayerIds={groupLockedPlayerIds}
        showVerify={showVerify}
        onVerifyClick={(show) => show !== false && setShowVerify(true)}
        onVerifySubmit={handleVerified}
        dqFlags={dqFlags}
        flashedButton={flashedButton}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
      />

      {/* Trial button */}
      <div className="flex gap-2 justify-center px-4">
        <button type="button" onClick={generateDummyScores} className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-md border-2 font-medium text-xs transition-all ${
          trialPressed ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-foreground'
        }`}>
          <Zap className="w-3 h-3" /> Trial Scores
        </button>
      </div>

      {/* Final Verify Screen */}
      {showVerify && selectedForGroup.length > 0 && verifyTotals && (
        <Card className="border-0 shadow-sm bg-primary/5 mx-4">
          <CardContent className="p-6 text-center space-y-4">
            <div>
              <p className="text-lg font-bold text-foreground">{verifyName}</p>
              <p className="text-sm text-muted-foreground">18 holes complete</p>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className={`rounded-lg p-3 ${verifyTotals.front9 === null ? "bg-destructive/10" : "bg-secondary/40"}`}>
                <p className="text-xs text-muted-foreground">Front 9</p>
                <p className={`text-2xl font-bold ${verifyTotals.front9 === null ? "text-destructive" : "text-foreground"}`}>
                  {verifyTotals.front9 != null ? verifyTotals.front9 : "—"}
                </p>
              </div>
              <div className={`rounded-lg p-3 ${verifyTotals.back9 === null ? "bg-destructive/10" : "bg-secondary/40"}`}>
                <p className="text-xs text-muted-foreground">Back 9</p>
                <p className={`text-2xl font-bold ${verifyTotals.back9 === null ? "text-destructive" : "text-foreground"}`}>
                  {verifyTotals.back9 != null ? verifyTotals.back9 : "—"}
                </p>
              </div>
              <div className={`rounded-lg p-3 ${verifyTotals.hasDQ ? "bg-destructive/10" : "bg-primary/10"}`}>
                <p className="text-xs text-muted-foreground">Total</p>
                <p className={`text-2xl font-bold ${verifyTotals.hasDQ ? "text-destructive" : "text-primary"}`}>
                  {verifyTotals.hasDQ ? "DQ" : (verifyTotals.total != null ? verifyTotals.total : "—")}
                </p>
              </div>
            </div>

            {verifyTotals.hasDQ && (
              <p className="text-xs text-destructive bg-destructive/10 rounded-md px-2 py-1 text-center">
                ⚠️ Player has X (DQ) on one or more holes — excluded from gross/net payouts
              </p>
            )}

            <div className="flex gap-2">
              <button type="button" onClick={() => setShowVerify(false)} className="flex-1 py-2 px-4 rounded-md border-2 border-border bg-card text-foreground font-medium text-sm">Edit</button>
              <Button className="flex-1" onClick={() => handleVerified(selectedPlayer)}>Verify & Continue</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
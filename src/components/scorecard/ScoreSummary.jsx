import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Pencil, Check } from "lucide-react";
import ScoreEditModal from "@/components/results/ScoreEditModal";

export default function ScoreSummary({ round, liveScores, onScoresChange, onEditModeChange, roundId: roundIdProp }) {
  const players = round.players || [];
  const par = round.par || new Array(18).fill(4);
  const roundId = roundIdProp || round?.id || new URLSearchParams(window.location.search).get("id");

  const countValid = arr => arr ? arr.filter(s => s !== '' && s !== null && s !== undefined && s !== 0).length : 0;

  const [committedScores, setCommittedScores] = useState({});

  // Sync scores from liveScores (loaded by parent from RoundScore DB) or fall back to round.players.
  // When liveScores has an entry for a player — even if all empty (cleared) — use it so
  // cleared scores don't fall back to stale roster scores from the DB.
  React.useEffect(() => {
    if (!players.length) return;
    const updated = {};
    players.forEach(p => {
      const live = liveScores?.[p.player_id];
      const fromRoster = p.scores || [];
      const src = live ? live : fromRoster;
      updated[p.player_id] = [...(src || []), ...new Array(18).fill('')].slice(0, 18).map(s => (!s || s === 0) ? '' : String(s));
    });
    setCommittedScores(updated);
  }, [liveScores, players.length]);

  const [editMode, setEditMode] = useState(false);
  const [editKey, setEditKey] = useState(0);
  const inputRefs = React.useRef({});
  const [editValues, setEditValues] = useState({});
  const [editingPlayer, setEditingPlayer] = useState(null);
  const [isSavingScore, setIsSavingScore] = useState(false);

  if (!players.length) return null;

  const handleEditPlayer = (player) => {
    setEditingPlayer(player);
  };

  // Build current scores for a player from best available source (committed > live > empty)
  const getCurrentScores = (player) => {
    const committed = committedScores?.[player.player_id];
    const live = liveScores?.[player.player_id];
    const src = committed || live || [];
    return [...src, ...new Array(18).fill('')].slice(0, 18).map(s => (!s || s === 0) ? '' : String(s));
  };

  const handleSaveScores = async (newScores) => {
    if (!editingPlayer) return;
    setIsSavingScore(true);
    const normalized = newScores.map(s => {
      const str = String(s).trim().toUpperCase();
      if (str === 'X') return 'X';
      const n = parseInt(str, 10);
      return (!isNaN(n) && n >= 1 && n <= 20) ? String(n) : '';
    });
    const newCommitted = {
      ...(committedScores || {}),
      [editingPlayer.player_id]: normalized
    };
    setCommittedScores(newCommitted);
    onScoresChange?.({ [editingPlayer.player_id]: normalized });
    setIsSavingScore(false);
    setEditingPlayer(null);
  };

  const front9Par = par.slice(0, 9).reduce((a, b) => a + b, 0);
  const back9Par = par.slice(9, 18).reduce((a, b) => a + b, 0);
  const totalPar = front9Par + back9Par;

  const isX = s => String(s).toUpperCase() === 'X';

  const getScoreStyle = (score, parVal) => {
    if (score === 'X' || score === 'x') return { color: 'text-destructive font-bold', shape: '' };
    if (!score || score === 0) return { color: 'text-muted-foreground', shape: '' };
    const diff = Number(score) - parVal;
    if (diff <= -2) return { color: 'text-yellow-500 font-bold', shape: 'ring-2 ring-yellow-500 rounded-full' };
    if (diff === -1) return { color: 'text-red-500 font-bold', shape: 'ring-2 ring-red-500 rounded-full' };
    if (diff === 0)  return { color: 'text-foreground font-semibold', shape: '' };
    if (diff === 1)  return { color: 'text-blue-400', shape: 'ring-1 ring-blue-400 rounded-sm' };
    return { color: 'text-blue-300', shape: 'ring-1 ring-blue-300 rounded-sm' };
  };

  const sumNine = (arr) => {
    if (arr.some(isX)) return null;
    return arr.reduce((a, s) => {
      if (s === null || s === undefined || s === '' || s === 0 || s === '0') return a;
      const n = Number(s);
      return a + (isNaN(n) ? 0 : n);
    }, 0);
  };

  const holes = Array.from({ length: 18 }, (_, i) => i + 1);
  const front = holes.slice(0, 9);
  const back = holes.slice(9, 18);
  const cellBase = "text-center text-xs font-semibold min-w-[28px] w-[28px] py-1.5";

  const strokesOnHole = (player, holeIdx) => {
    const teeName = player.tee_preference;
    const teeSet = teeName && round.course_tee_sets?.find(t => t.name === teeName);
    const hhi = (teeSet?.hole_handicap_indexes) || round.hole_handicap_indexes;
    if (!hhi || hhi.length === 0) return 0;
    const holeHI = Number(hhi[holeIdx]);
    if (!holeHI || isNaN(holeHI)) return 0;
    const isPlus = !!player.is_plus_handicap || (player.course_handicap != null && Number(player.course_handicap) < 0);
    const absHcp = player.course_handicap != null ? Math.abs(Number(player.course_handicap)) : Math.abs(player.handicap ?? 0);
    const flooredHcp = Math.floor(absHcp);
    if (isPlus) return holeHI > (18 - flooredHcp) ? -1 : 0;
    const strokes1 = flooredHcp > 0 && holeHI <= flooredHcp ? 1 : 0;
    const strokes2 = flooredHcp > 18 && holeHI <= (flooredHcp - 18) ? 1 : 0;
    const strokes3 = flooredHcp > 36 && holeHI <= (flooredHcp - 36) ? 1 : 0;
    return strokes1 + strokes2 + strokes3;
  };

  return (
    <Card className="border-0 shadow-sm max-w-full overflow-hidden">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-lg">Score Summary</CardTitle>
        {onScoresChange && (
          <button type="button" onClick={() => setEditMode(!editMode)} className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-md border-2 ${editMode ? 'bg-primary text-primary-foreground border-primary' : 'bg-edit text-edit-foreground border-edit'} text-xs font-medium`}>
            <Pencil className="w-3.5 h-3.5" /> {editMode ? 'Done' : 'Edit'}
          </button>
        )}
      </CardHeader>
      {editMode && (
        <div className="mx-4 mb-3 flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-700 rounded-lg">
          <span className="text-amber-500 text-base leading-none mt-0.5">⚠️</span>
          <p className="text-xs text-amber-800 dark:text-amber-300 font-medium">
            Tap any player's name to edit their scores.
          </p>
        </div>
      )}
      <CardContent className="p-0">
        <div className="overflow-x-auto overflow-y-auto max-h-[70vh]" style={{ WebkitOverflowScrolling: 'touch', maxWidth: '100%' }}>
          <table className="w-full text-xs border-collapse" style={{ minWidth: 'max-content' }}>
            <thead className="sticky top-0 z-10">
              <tr className="bg-muted">
                <th className="text-left px-3 py-2 font-semibold text-muted-foreground w-28 min-w-[7rem]">Hole</th>
                {front.map(h => <th key={h} className={`${cellBase} text-muted-foreground`}>{h}</th>)}
                <th className={`${cellBase} text-muted-foreground border-l border-border`}>F9</th>
                {back.map(h => <th key={h} className={`${cellBase} text-muted-foreground border-l border-border/30`}>{h}</th>)}
                <th className={`${cellBase} text-muted-foreground border-l border-border`}>B9</th>
                <th className={`${cellBase} text-primary border-l border-border`}>Tot</th>
                <th className={`${cellBase} text-green-600 border-l border-border`}>Net</th>
              </tr>
              <tr className="border-b border-border bg-muted">
                <td className="px-3 py-1.5 font-semibold text-muted-foreground">Par</td>
                {par.slice(0, 9).map((p, i) => <td key={i} className={`${cellBase} text-muted-foreground`}>{p}</td>)}
                <td className={`${cellBase} text-muted-foreground border-l border-border font-bold`}>{front9Par}</td>
                {par.slice(9, 18).map((p, i) => <td key={i + 9} className={`${cellBase} text-muted-foreground border-l border-border/30`}>{p}</td>)}
                <td className={`${cellBase} text-muted-foreground border-l border-border font-bold`}>{back9Par}</td>
                <td className={`${cellBase} text-muted-foreground border-l border-border font-bold`}>{totalPar}</td>
              </tr>
            </thead>

            <tbody key={editKey}>
              {players.map((player, pi) => {
                // Always use committedScores for display — never overwritten by external props
                const committed = committedScores?.[player.player_id] || [];
                const scores = [...committed, ...new Array(18).fill(0)].slice(0, 18);
                const f9 = sumNine(scores.slice(0, 9));
                const b9 = sumNine(scores.slice(9, 18));
                const total = (f9 === null || b9 === null) ? null : f9 + b9;
                const ch = player.course_handicap ?? (player.is_plus_handicap ? -(player.handicap ?? 0) : (player.handicap ?? 0));
                const netTotal = total != null ? total - ch : null;

                return (
                  <tr key={player.player_id} className={`border-b border-border/50 ${pi % 2 === 0 ? 'bg-card' : 'bg-muted/20'}`}>
                    <td className="px-3 py-2">
                      {editMode ? (
                        <button
                          type="button"
                          onClick={() => handleEditPlayer(player)}
                          className="text-left w-full hover:bg-primary/10 rounded px-2 py-1 -ml-2 transition-colors"
                        >
                          <p className="font-semibold text-primary leading-tight">{player.name}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {player.course_handicap != null
                              ? `CH ${player.course_handicap < 0 ? `+${Math.abs(player.course_handicap)}` : player.course_handicap}`
                              : `HI ${player.is_plus_handicap ? `+${player.handicap}` : player.handicap}`}
                          </p>
                        </button>
                      ) : (
                        <div>
                          <p className="font-semibold text-foreground leading-tight">{player.name}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {player.course_handicap != null
                              ? `CH ${player.course_handicap < 0 ? `+${Math.abs(player.course_handicap)}` : player.course_handicap}`
                              : `HI ${player.is_plus_handicap ? `+${player.handicap}` : player.handicap}`}
                          </p>
                        </div>
                      )}
                    </td>

                    {/* Front 9 - Read Only */}
                    {scores.slice(0, 9).map((score, i) => {
                      const { color, shape } = getScoreStyle(score, par[i]);
                      const strokes = strokesOnHole(player, i);
                      return (
                        <td key={i} className={`${cellBase} ${color}`}>
                          <div className="flex flex-col items-center gap-0">
                            <span className={`inline-flex items-center justify-center w-6 h-6 ${shape}`}>
                              {score === '' || score === null || score === undefined || score === 0 ? '' : score}
                            </span>
                            <div className="flex gap-0.5 h-2 items-center justify-center">
                              {strokes > 0 && <span className="w-1 h-1 rounded-full bg-primary inline-block" />}
                              {strokes > 1 && <span className="w-1 h-1 rounded-full bg-primary inline-block" />}
                              {strokes > 2 && <span className="w-1 h-1 rounded-full bg-primary inline-block" />}
                              {strokes < 0 && <span className="w-1 h-1 rounded-full bg-red-500 inline-block" />}
                            </div>
                          </div>
                        </td>
                      );
                    })}

                    <td className={`${cellBase} border-l border-border text-foreground font-bold`}>{f9 != null ? f9 : '—'}</td>

                    {/* Back 9 - Read Only */}
                    {scores.slice(9, 18).map((score, i) => {
                      const { color, shape } = getScoreStyle(score, par[i + 9]);
                      const strokes = strokesOnHole(player, i + 9);
                      return (
                        <td key={i + 9} className={`${cellBase} ${color} border-l border-border/30`}>
                          <div className="flex flex-col items-center gap-0">
                            <span className={`inline-flex items-center justify-center w-6 h-6 ${shape}`}>
                              {score === '' || score === null || score === undefined || score === 0 ? '' : score}
                            </span>
                            <div className="flex gap-0.5 h-2 items-center justify-center">
                              {strokes > 0 && <span className="w-1 h-1 rounded-full bg-primary inline-block" />}
                              {strokes > 1 && <span className="w-1 h-1 rounded-full bg-primary inline-block" />}
                              {strokes > 2 && <span className="w-1 h-1 rounded-full bg-primary inline-block" />}
                              {strokes < 0 && <span className="w-1 h-1 rounded-full bg-red-500 inline-block" />}
                            </div>
                          </div>
                        </td>
                      );
                    })}

                    <td className={`${cellBase} border-l border-border text-foreground font-bold`}>{b9 != null ? b9 : '—'}</td>
                    <td className={`${cellBase} border-l border-border text-primary font-bold`}>{total != null ? total : '—'}</td>
                    <td className={`${cellBase} border-l border-border text-green-600 font-bold`}>{netTotal != null ? netTotal : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex gap-4 px-3 py-2 border-t border-border/50 flex-wrap">
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <span className="inline-flex items-center justify-center w-4 h-4 ring-2 ring-yellow-500 rounded-full text-yellow-500 font-bold text-[8px]">4</span> Eagle+
          </span>
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <span className="inline-flex items-center justify-center w-4 h-4 ring-2 ring-red-500 rounded-full text-red-500 font-bold text-[8px]">4</span> Birdie
          </span>
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <span className="inline-flex items-center justify-center w-4 h-4 ring-1 ring-blue-400 rounded-sm text-blue-400 font-bold text-[8px]">5</span> Bogey
          </span>
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <span className="inline-flex items-center justify-center w-4 h-4 ring-1 ring-blue-300 rounded-sm text-blue-300 font-bold text-[8px]">6</span> Double+
          </span>
        </div>
      </CardContent>

      {/* Edit Modal */}
      {editingPlayer && (
        <ScoreEditModal
          isOpen={!!editingPlayer}
          onClose={() => setEditingPlayer(null)}
          player={editingPlayer}
          round={round}
          initialScores={getCurrentScores(editingPlayer)}
          onSave={handleSaveScores}
          isSaving={isSavingScore}
        />
      )}
    </Card>
  );
}
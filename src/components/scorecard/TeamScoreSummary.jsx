import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Pencil, ChevronDown, ChevronRight, Users } from "lucide-react";
import ScoreEditModal from "@/components/results/ScoreEditModal";
import { computeTeamHandicap } from "@/lib/teamHandicap";

const countValid = arr => arr ? arr.filter(s => s !== '' && s !== null && s !== undefined && s !== 0).length : 0;

/**
 * Group players into teams by tee_group tag, or auto-split by team_size.
 * Unlike teamScoreEngine.buildTeams, this does NOT filter out players with no scores —
 * we want to show everyone on the roster.
 */
function groupTeams(players, teamSize) {
  if (!players || players.length === 0) return [];
  const size = teamSize || 2;
  const hasGroupTags = players.some(p => (p.tee_group || "").trim());

  if (hasGroupTags) {
    const groups = {};
    for (const p of players) {
      const tag = (p.tee_group || "").trim() || "—";
      if (!groups[tag]) groups[tag] = [];
      groups[tag].push(p);
    }
    return Object.keys(groups).sort().map((tag, i) => ({
      team_id: tag,
      team_name: `Team ${tag}`,
      members: groups[tag],
    }));
  }

  const teams = [];
  for (let i = 0; i < players.length; i += size) {
    const label = String.fromCharCode(65 + Math.floor(i / size));
    teams.push({
      team_id: `auto_${label}`,
      team_name: `Team ${label}`,
      members: players.slice(i, i + size),
    });
  }
  return teams;
}

function holeStrokes(courseHandicap, holeHcpIndex) {
  if (courseHandicap == null || isNaN(Number(courseHandicap))) return 0;
  const ch = Number(courseHandicap);
  if (ch < 0) {
    const floored = Math.floor(Math.abs(ch));
    return holeHcpIndex > (18 - floored) ? -1 : 0;
  }
  // Standard USGA allocation: one stroke per hole for each full pass of 18,
  // then an extra stroke on the hardest N holes (HCP index ≤ remainder).
  // Handles any handicap (e.g. CH 55 → 3 strokes/hole + 4th on #1 index hole).
  const floored = Math.floor(ch);
  const fullPasses = Math.floor(floored / 18);
  const remainder = floored % 18;
  let strokes = fullPasses;
  if (remainder > 0 && holeHcpIndex <= remainder) strokes += 1;
  return strokes;
}

function bestBallGross(members, holeIdx, scoresMap) {
  const scores = [];
  for (const p of members) {
    const arr = scoresMap?.[p.player_id] || [];
    const raw = arr[holeIdx];
    const n = Number(raw);
    if (raw && !isNaN(n) && n > 0) scores.push(n);
  }
  return scores.length ? Math.min(...scores) : null;
}

function bestBallNet(members, holeIdx, hcpIndexes, scoresMap, formula) {
  const scores = [];
  for (const p of members) {
    const arr = scoresMap?.[p.player_id] || [];
    const raw = arr[holeIdx];
    const gross = Number(raw);
    if (!raw || isNaN(gross) || gross <= 0) continue;
    const ch = p.course_handicap != null ? Number(p.course_handicap) : null;
    let hcpVal = ch != null ? ch : (p.is_plus_handicap ? -Math.abs(p.handicap || 0) : Math.abs(p.handicap || 0));
    // Best ball with the 85% formula: each player plays off 85% of their OWN
    // Course Handicap (not a combined team handicap), per four-ball rules.
    if (formula === 'combined_85') {
      hcpVal = hcpVal < 0 ? -Math.round(Math.abs(hcpVal) * 0.85) : Math.round(hcpVal * 0.85);
    }
    const strokes = holeStrokes(hcpVal, hcpIndexes[holeIdx] || 0);
    scores.push(gross - strokes);
  }
  return scores.length ? Math.min(...scores) : null;
}

function aggregateGross(members, holeIdx, scoresMap) {
  let sum = 0;
  let has = false;
  for (const p of members) {
    const arr = scoresMap?.[p.player_id] || [];
    const raw = arr[holeIdx];
    const n = Number(raw);
    if (raw && !isNaN(n) && n > 0) { sum += n; has = true; }
  }
  return has ? sum : null;
}

function aggregateNet(members, holeIdx, hcpIndexes, scoresMap, formula) {
  let sum = 0;
  let has = false;
  for (const p of members) {
    const arr = scoresMap?.[p.player_id] || [];
    const raw = arr[holeIdx];
    const gross = Number(raw);
    if (!raw || isNaN(gross) || gross <= 0) continue;
    const ch = p.course_handicap != null ? Number(p.course_handicap) : null;
    let hcpVal = ch != null ? ch : (p.is_plus_handicap ? -Math.abs(p.handicap || 0) : Math.abs(p.handicap || 0));
    if (formula === 'combined_85') {
      hcpVal = hcpVal < 0 ? -Math.round(Math.abs(hcpVal) * 0.85) : Math.round(hcpVal * 0.85);
    }
    const strokes = holeStrokes(hcpVal, hcpIndexes[holeIdx] || 0);
    sum += gross - strokes;
    has = true;
  }
  return has ? sum : null;
}

export default function TeamScoreSummary({ round, liveScores, onScoresChange, onEditModeChange, roundId: roundIdProp }) {
  const players = round.players || [];
  const par = round.par || new Array(18).fill(4);
  const hcpIndexes = round.hole_handicap_indexes || [];
  const teamSize = round.team_size || 2;
  const isScramble = round.team_format === "scramble";
  const isChapman = round.game_type === "team_chapman";
  const is666 = round.game_type === "team_6_6_6";
  const isAggregate = round.game_type === "team_aggregate" || (round.team_mode === true && round.team_format === "aggregate");
  const isTeamRowFormat = isScramble || isChapman || is666;
  const roundId = roundIdProp || round?.id || new URLSearchParams(window.location.search).get("id");

  const [committedScores, setCommittedScores] = useState({});
  const [editMode, setEditMode] = useState(false);
  const [editKey, setEditKey] = useState(0);
  const [editingPlayer, setEditingPlayer] = useState(null);
  const [isSavingScore, setIsSavingScore] = useState(false);
  const [expandedTeams, setExpandedTeams] = useState({});

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

  React.useEffect(() => {
    onEditModeChange?.(editMode);
  }, [editMode]);

  if (!players.length) return null;

  const teams = groupTeams(players, teamSize);

  // Default: all teams expanded
  const isExpanded = (teamId) => expandedTeams[teamId] !== false;
  const toggleTeam = (teamId) => setExpandedTeams(prev => ({ ...prev, [teamId]: !(prev[teamId] !== false) }));

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
    setCommittedScores(prev => ({ ...(prev || {}), [editingPlayer.player_id]: normalized }));
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

  const sumHoles = (arr) => {
    const valid = arr.filter(v => v != null);
    return valid.length ? valid.reduce((a, b) => a + b, 0) : null;
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
    const fullPasses = Math.floor(flooredHcp / 18);
    const remainder = flooredHcp % 18;
    let strokes = fullPasses;
    if (remainder > 0 && holeHI <= remainder) strokes += 1;
    return strokes;
  };

  const renderPlayerRow = (player, pi) => {
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
            <button type="button" onClick={() => setEditingPlayer(player)} className="text-left w-full hover:bg-primary/10 rounded px-2 py-1 -ml-2 transition-colors">
              <p className="font-semibold text-primary leading-tight pl-2">{player.name}</p>
              <p className="text-[10px] text-muted-foreground pl-2">
                {player.course_handicap != null ? `CH ${player.course_handicap < 0 ? `+${Math.abs(player.course_handicap)}` : player.course_handicap}` : `HI ${player.is_plus_handicap ? `+${player.handicap}` : player.handicap}`}
              </p>
            </button>
          ) : (
            <div className="pl-2">
              <p className="font-semibold text-foreground leading-tight">{player.name}</p>
              <p className="text-[10px] text-muted-foreground">
                {player.course_handicap != null ? `CH ${player.course_handicap < 0 ? `+${Math.abs(player.course_handicap)}` : player.course_handicap}` : `HI ${player.is_plus_handicap ? `+${player.handicap}` : player.handicap}`}
              </p>
            </div>
          )}
        </td>
        {scores.slice(0, 9).map((score, i) => {
          const { color, shape } = getScoreStyle(score, par[i]);
          const strokes = strokesOnHole(player, i);
          const grossNum = Number(score);
          const hasGross = score !== '' && score != null && score !== 0 && !isNaN(grossNum);
          const netVal = hasGross ? grossNum - strokes : '';
          return (
            <td key={i} className={`${cellBase} ${color}`}>
              <div className="flex flex-col items-center gap-0">
                <span className={`inline-flex items-center justify-center w-6 h-6 ${shape}`}>{hasGross ? score : ''}</span>
                <div className="flex gap-0.5 h-2 items-center justify-center">
                  {strokes > 0 && <span className="w-1 h-1 rounded-full bg-primary inline-block" />}
                  {strokes > 1 && <span className="w-1 h-1 rounded-full bg-primary inline-block" />}
                  {strokes > 2 && <span className="w-1 h-1 rounded-full bg-primary inline-block" />}
                  {strokes > 3 && <span className="w-1 h-1 rounded-full bg-primary inline-block" />}
                  {strokes < 0 && <span className="w-1 h-1 rounded-full bg-red-500 inline-block" />}
                </div>
                {hasGross && <span className="text-[8px] leading-none text-muted-foreground/70">{netVal}</span>}
              </div>
            </td>
          );
        })}
        <td className={`${cellBase} border-l border-border text-foreground font-bold`}>{f9 != null ? f9 : '—'}</td>
        {scores.slice(9, 18).map((score, i) => {
          const { color, shape } = getScoreStyle(score, par[i + 9]);
          const strokes = strokesOnHole(player, i + 9);
          const grossNum = Number(score);
          const hasGross = score !== '' && score != null && score !== 0 && !isNaN(grossNum);
          const netVal = hasGross ? grossNum - strokes : '';
          return (
            <td key={i + 9} className={`${cellBase} ${color} border-l border-border/30`}>
              <div className="flex flex-col items-center gap-0">
                <span className={`inline-flex items-center justify-center w-6 h-6 ${shape}`}>{hasGross ? score : ''}</span>
                <div className="flex gap-0.5 h-2 items-center justify-center">
                  {strokes > 0 && <span className="w-1 h-1 rounded-full bg-primary inline-block" />}
                  {strokes > 1 && <span className="w-1 h-1 rounded-full bg-primary inline-block" />}
                  {strokes > 2 && <span className="w-1 h-1 rounded-full bg-primary inline-block" />}
                  {strokes > 3 && <span className="w-1 h-1 rounded-full bg-primary inline-block" />}
                  {strokes < 0 && <span className="w-1 h-1 rounded-full bg-red-500 inline-block" />}
                </div>
                {hasGross && <span className="text-[8px] leading-none text-muted-foreground/70">{netVal}</span>}
              </div>
            </td>
          );
        })}
        <td className={`${cellBase} border-l border-border text-foreground font-bold`}>{b9 != null ? b9 : '—'}</td>
        <td className={`${cellBase} border-l border-border text-primary font-bold`}>{total != null ? total : '—'}</td>
        <td className={`${cellBase} border-l border-border text-green-600 font-bold`}>{netTotal != null ? netTotal : '—'}</td>
      </tr>
    );
  };

  const renderTeamBestBallRows = (team) => {
    const grossArr = Array.from({ length: 18 }, (_, i) => isAggregate ? aggregateGross(team.members, i, committedScores) : bestBallGross(team.members, i, committedScores));

    // For single-team-score formats (scramble/chapman/6-6-6), compute the combined
    // team handicap and show dots on holes where the team receives strokes.
    const teamHcp = isTeamRowFormat ? computeTeamHandicap(team.members, round.hcp_formula || 'combined_85') : null;
    const teamStrokes = (isTeamRowFormat && teamHcp != null)
      ? Array.from({ length: 18 }, (_, i) => holeStrokes(teamHcp, hcpIndexes[i] || 0))
      : null;

    const netArr = isTeamRowFormat
      ? (teamStrokes ? grossArr.map((g, i) => (g != null ? g - teamStrokes[i] : null)) : [])
      : Array.from({ length: 18 }, (_, i) => isAggregate ? aggregateNet(team.members, i, hcpIndexes, committedScores, round.hcp_formula) : bestBallNet(team.members, i, hcpIndexes, committedScores, round.hcp_formula));
    const gOut = sumHoles(grossArr.slice(0, 9));
    const gIn = sumHoles(grossArr.slice(9, 18));
    const gTot = (gOut != null && gIn != null) ? gOut + gIn : (gOut != null ? gOut : (gIn != null ? gIn : null));
    const nOut = sumHoles(netArr.slice(0, 9));
    const nIn = sumHoles(netArr.slice(9, 18));
    const nTot = (nOut != null && nIn != null) ? nOut + nIn : (nOut != null ? nOut : (nIn != null ? nIn : null));

    const renderCells = (arr, out, inN, tot, bgColor, strokesArr, netTot) => {
      const cellStyle = { backgroundColor: bgColor, color: '#1a1d1a' };
      const renderCell = (v, i, borderClass) => (
        <td key={i} className={`${cellBase} ${borderClass}`} style={cellStyle}>
          {strokesArr ? (
            <div className="flex flex-col items-center gap-0">
              <span className="inline-flex items-center justify-center w-6 h-6">{v != null ? v : ''}</span>
              <div className="flex gap-0.5 h-2 items-center justify-center">
                {strokesArr[i] > 0 && <span className="w-1 h-1 rounded-full bg-green-700 inline-block" />}
                {strokesArr[i] > 1 && <span className="w-1 h-1 rounded-full bg-green-700 inline-block" />}
                {strokesArr[i] > 2 && <span className="w-1 h-1 rounded-full bg-green-700 inline-block" />}
                {strokesArr[i] < 0 && <span className="w-1 h-1 rounded-full bg-red-500 inline-block" />}
              </div>
            </div>
          ) : (v != null ? v : '')}
        </td>
      );
      return (
        <>
          {arr.slice(0, 9).map((v, i) => renderCell(v, i, 'border-l border-border/30'))}
          <td className={`${cellBase} border-l border-border font-bold`} style={cellStyle}>{out != null ? out : '—'}</td>
          {arr.slice(9, 18).map((v, i) => renderCell(v, i + 9, 'border-l border-border/30'))}
          <td className={`${cellBase} border-l border-border font-bold`} style={cellStyle}>{inN != null ? inN : '—'}</td>
          <td className={`${cellBase} border-l border-border font-bold`} style={cellStyle}>{tot != null ? tot : '—'}</td>
          <td className={`${cellBase} border-l border-border font-bold`} style={cellStyle}>{netTot != null ? netTot : ''}</td>
        </>
      );
    };

    return (
      <>
        {/* Team Gross best-ball row */}
        <tr className="border-b border-border">
          <td className="px-3 py-2 font-bold text-sm" style={{ backgroundColor: '#dcf4dc', color: '#1a3d1a' }}>
            <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" /> Gross</span>
          </td>
          {renderCells(grossArr, gOut, gIn, gTot, '#dcf4dc', teamStrokes, teamStrokes ? nTot : null)}
        </tr>
        {/* Team Net best-ball row */}
        {!isTeamRowFormat && (
          <tr className="border-b border-border">
            <td className="px-3 py-2 font-bold text-sm" style={{ backgroundColor: '#dcf0f6', color: '#16314a' }}>
              <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" /> Net</span>
            </td>
            {renderCells(netArr, nOut, nIn, nTot, '#dcf0f6')}
          </tr>
        )}
      </>
    );
  };

  return (
    <Card className="border-0 shadow-sm max-w-full overflow-hidden">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-lg">Team Score Summary</CardTitle>
        {onScoresChange && (
          <button type="button" onClick={() => setEditMode(!editMode)} className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-md border-2 ${editMode ? 'bg-primary text-primary-foreground border-primary' : 'bg-edit text-edit-foreground border-edit'} text-xs font-medium`}>
            <Pencil className="w-3.5 h-3.5" /> {editMode ? 'Done' : 'Edit'}
          </button>
        )}
      </CardHeader>
      {editMode && (
        <div className="mx-4 mb-3 flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-700 rounded-lg">
          <span className="text-amber-500 text-base leading-none mt-0.5">⚠️</span>
          <p className="text-xs text-amber-800 dark:text-amber-300 font-medium">Tap any player's name to edit their scores.</p>
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
              {teams.map((team, ti) => (
                <React.Fragment key={team.team_id}>
                  {/* Team header row — click to expand/collapse */}
                  <tr
                    className="border-b border-border cursor-pointer hover:bg-primary/5"
                    onClick={() => !editMode && toggleTeam(team.team_id)}
                  >
                    <td colSpan={23} className="px-3 py-2 bg-primary/10">
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-2 font-bold text-sm text-primary">
                          {isExpanded(team.team_id) ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          {team.team_name}
                        </span>
                        <span className="text-xs text-muted-foreground shrink-0 ml-2">
                          {team.members.length} {teamSize === team.members.length ? 'players' : `of ${teamSize}`}
                        </span>
                      </div>
                      <p className="text-xs text-foreground/80 mt-1 pl-6 font-medium">
                        {team.members.map(m => m.name).join(' · ')}
                      </p>
                    </td>
                  </tr>
                  {isExpanded(team.team_id) && (
                    <>
                      {!isTeamRowFormat && team.members.map((p, pi) => renderPlayerRow(p, pi))}
                      {renderTeamBestBallRows(team)}
                    </>
                  )}
                </React.Fragment>
              ))}
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
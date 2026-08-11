import React from "react";
import { computeTeamHandicap, handicapFormulaLabel } from "@/lib/teamHandicap";

const LOGO_URL = "https://media.base44.com/images/public/69bb019558d96a11fbfbddce/189d00ac3_IMG_6860.jpg";

/**
 * Compute handicap strokes a player receives on a hole.
 */
function holeStrokes(courseHandicap, holeHcpIndex) {
  if (courseHandicap == null || isNaN(Number(courseHandicap))) return 0;
  const ch = Number(courseHandicap);
  if (ch < 0) {
    const floored = Math.floor(Math.abs(ch));
    return holeHcpIndex > (18 - floored) ? -1 : 0;
  }
  const floored = Math.floor(ch);
  // Standard USGA allocation: one stroke per hole for each full pass of 18,
  // then an extra stroke on the hardest N holes (HCP index ≤ remainder).
  // e.g. CH 55 → 3 dots on every hole + a 4th dot on the #1 handicap hole.
  const fullPasses = Math.floor(floored / 18);
  const remainder = floored % 18;
  let strokes = fullPasses;
  if (remainder > 0 && holeHcpIndex <= remainder) strokes += 1;
  return strokes;
}

/**
 * Find the best (lowest) score among team members for a given hole.
 */
function bestBall(players, holeIndex, hcpIndexes, isNet) {
  const scores = [];
  for (const player of players) {
    if (!player) continue;
    const gross = Number(player.scores?.[holeIndex]);
    if (gross && gross > 0) {
      if (isNet) {
        const strokes = holeStrokes(player.course_handicap || 0, hcpIndexes[holeIndex] || 0);
        scores.push(gross - strokes);
      } else {
        scores.push(gross);
      }
    }
  }
  return scores.length ? Math.min(...scores) : null;
}

/**
 * Aggregate: sum of all members' valid scores on a hole (gross or net).
 */
function aggregateBall(players, holeIndex, hcpIndexes, isNet) {
  let sum = 0;
  let has = false;
  for (const player of players) {
    if (!player) continue;
    const gross = Number(player.scores?.[holeIndex]);
    if (gross && gross > 0) {
      if (isNet) {
        const strokes = holeStrokes(player.course_handicap || 0, hcpIndexes[holeIndex] || 0);
        sum += gross - strokes;
      } else {
        sum += gross;
      }
      has = true;
    }
  }
  return has ? sum : null;
}

/**
 * Compute best-ball arrays and totals for a single team.
 */
function computeTeamData(teamPlayers, hcpIndexes, useAggregate) {
  const fn = useAggregate ? aggregateBall : bestBall;
  const gross = Array.from({ length: 18 }, (_, i) => fn(teamPlayers, i, hcpIndexes, false));
  const net = Array.from({ length: 18 }, (_, i) => fn(teamPlayers, i, hcpIndexes, true));

  const grossOut = gross.slice(0, 9).filter(f).reduce(fsum, 0);
  const grossIn = gross.slice(9, 18).filter(f).reduce(fsum, 0);
  const netOut = net.slice(0, 9).filter(f).reduce(fsum, 0);
  const netIn = net.slice(9, 18).filter(f).reduce(fsum, 0);

  return {
    gross, net,
    grossOut, grossIn, grossTot: grossOut + grossIn,
    netOut, netIn, netTot: netOut + netIn,
    grossHasFront: gross.slice(0, 9).some(f), grossHasBack: gross.slice(9, 18).some(f),
    netHasFront: net.slice(0, 9).some(f), netHasBack: net.slice(9, 18).some(f),
    lastNames: teamPlayers.filter(p => p?.name).map(p => p.name.trim().split(/\s+/).pop()),
  };
}

function teamHcpDisplay(teamPlayers, formula) {
  const val = computeTeamHandicap(teamPlayers, formula);
  return val != null ? String(val) : "";
}
const f = (v) => v != null;
const fsum = (a, b) => a + b;

export default function ScorecardHtmlPreview({ round, group }) {
  const par = round.par || [];
  const hcpIndexes = round.hole_handicap_indexes || [];
  const players = group || [];

  const isTeamMode = round.team_mode === true || ['team_scramble', 'team_best_ball', 'team_6_6_6', 'team_chapman', 'team_aggregate'].includes(round.game_type);
  const teamSize = isTeamMode ? round.team_size || 2 : 0;
  const isScramble = isTeamMode && round.team_format === "scramble";
  const is666 = isTeamMode && round.game_type === "team_6_6_6";
  const isChapman = isTeamMode && round.game_type === "team_chapman";
  const isAggregate = isTeamMode && (round.game_type === "team_aggregate" || round.team_format === "aggregate");

  const FORMAT_LABELS_666 = { chapman: 'Chapman', best_ball: 'Best Ball', scramble: 'Scramble', alternate_shot: 'Alt Shot', aggregate: 'Aggregate' };
  const seg666Source = (is666 && Array.isArray(round.segments_666) && round.segments_666.length === 3)
    ? round.segments_666
    : [{ holes: 'Holes 1–6', format: 'chapman' }, { holes: 'Holes 7–12', format: 'best_ball' }, { holes: 'Holes 13–18', format: 'scramble' }];
  const segmentsLegend = is666 ? seg666Source.map(s => ({ holes: s.holes, formatLabel: FORMAT_LABELS_666[s.format] || s.format })) : [];

  // Sub-group players by tee_group when in team mode (multiple teams per tee time)
  const subTeams = isTeamMode ? (() => {
    const groups = {};
    const hasGroupTags = players.some(p => p && (p.tee_group || "").trim());
    for (const p of players) {
      if (!p) continue;
      const tag = (p.tee_group || "").trim() || "—";
      if (!groups[tag]) groups[tag] = [];
      groups[tag].push(p);
    }
    let result = Object.keys(groups).sort().map(t => groups[t]);
    // When no group tags are used, auto-split into teams of teamSize
    if (!hasGroupTags && teamSize > 0) {
      const split = [];
      for (const group of result) {
        for (let i = 0; i < group.length; i += teamSize) {
          split.push(group.slice(i, i + teamSize));
        }
      }
      result = split.length > 0 ? split : result;
    }
    return result.length > 0 ? result : [[]];
  })() : [players];

  const totalPar = par.length === 18 ? par.reduce((a, b) => a + b, 0) : 0;
  const frontPar = par.slice(0, 9).reduce((a, b) => a + b, 0);
  const backPar = par.slice(9, 18).reduce((a, b) => a + b, 0);

  const dateStr = round.date
    ? new Date(round.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "";

  const headerText = round.event_name || "Golf Round";
  const frontHoles = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  const backHoles = [10, 11, 12, 13, 14, 15, 16, 17, 18];

  // For non-team mode, pad to group_size; for team mode, each scorecard is one team (players + Gross + Net)
  const fixedRows = isTeamMode ? ((isScramble || isChapman) ? 2 : (is666 ? 1 : (teamSize + 2))) : (round.tee_sheet_config?.group_size || 4);

  const renderTeamRows = (teamPlayers, teamIdx) => {
    const padded = [...teamPlayers];
    while (padded.length < (isTeamMode ? teamSize : fixedRows)) padded.push(null);
    const data = computeTeamData(teamPlayers, hcpIndexes, isAggregate);
    const teamHcp = isTeamMode ? teamHcpDisplay(teamPlayers, round.hcp_formula) : "";

    return (
      <React.Fragment key={teamIdx}>
        {/* Player rows */}
        {!isScramble && !isChapman && !is666 && padded.map((player, idx) => {
          const playerName = player ? (player.name || "") : "";
          const ch = player?.course_handicap;
          const hcpVal = ch != null ? Number(ch) : (player?.is_plus_handicap ? -Math.abs(player?.handicap || 0) : Math.abs(player?.handicap || 0));
          const hcpDisplay = ch != null ? (ch < 0 ? `+${Math.abs(ch)}` : String(ch)) : "";
          const initials = playerName ? playerName.trim().split(/\s+/).map(n => n[0]).join("").toUpperCase().substring(0, 2) : "";

          const renderDots = (holeIdx) => {
            if (!player) return null;
            const strokes = holeStrokes(hcpVal, hcpIndexes[holeIdx] || 0);
            if (strokes === 0) return null;
            const isPlus = strokes < 0;
            const count = Math.abs(strokes);
            return (
              <div className="absolute top-0 left-0 right-0 flex flex-nowrap items-center justify-center overflow-hidden gap-[1px] px-0.5" style={{ color: isPlus ? "#f87171" : "#3b82f6" }}>
                {Array.from({ length: count }).map((_, i) => (
                  <span key={i} style={{ width: "4px", height: "4px", borderRadius: "50%", backgroundColor: isPlus ? "#f87171" : "#1d4ed8", display: "inline-block", WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" }} />
                ))}
              </div>
            );
          };

          return (
            <tr key={`p${teamIdx}-${idx}`} className="print-write-row" style={{ height: "28px" }}>
              <td className="border border-black bg-white px-1 py-0.5 font-bold text-left whitespace-nowrap">{playerName}</td>
              {frontHoles.map(h => (
                <td key={`fs${h}`} className="border border-black bg-white px-0.5 py-0.5 text-center align-top">
                  <div className="relative h-[10px]">{renderDots(h - 1)}</div>
                </td>
              ))}
              <td className="border border-black bg-gray-100 px-0.5 py-0.5 text-center"></td>
              <td className="border border-black bg-gray-100 px-0.5 py-0.5 text-center font-bold">{initials}</td>
              {backHoles.map(h => (
                <td key={`bs${h}`} className="border border-black bg-white px-0.5 py-0.5 text-center align-top">
                  <div className="relative h-[10px]">{renderDots(h - 1)}</div>
                </td>
              ))}
              <td className="border border-black bg-gray-100 px-0.5 py-0.5 text-center"></td>
              <td className="border border-black bg-white px-0.5 py-0.5 text-center"></td>
              <td className="border border-black bg-white px-0.5 py-0.5 text-center font-bold">{hcpDisplay}</td>
              <td className="border border-black bg-white px-0.5 py-0.5 text-center"></td>
            </tr>
          );
        })}

        {/* Team Gross best-ball row (team mode only, not scramble, not chapman, not 6-6-6) */}
        {isTeamMode && !isScramble && !isChapman && !is666 && (
          <tr className="print-write-row" style={{ height: "28px" }}>
            <td className="border border-black px-1 py-0.5 font-bold text-left" style={{ backgroundColor: "#dcf4dc" }}>Gross</td>
            {frontHoles.map(h => (
              <td key={`gh${h}`} className="border border-black px-0.5 py-0.5 text-center font-bold" style={{ backgroundColor: "#dcf4dc" }}>{data.gross[h - 1] != null ? data.gross[h - 1] : ""}</td>
            ))}
            <td className="border border-black px-0.5 py-0.5 text-center font-bold" style={{ backgroundColor: "#dcf4dc" }}>{data.grossHasFront ? data.grossOut : ""}</td>
            <td className="border border-black px-0.5 py-0.5 text-center" style={{ backgroundColor: "#dcf4dc" }}></td>
            {backHoles.map(h => (
              <td key={`ghb${h}`} className="border border-black px-0.5 py-0.5 text-center font-bold" style={{ backgroundColor: "#dcf4dc" }}>{data.gross[h - 1] != null ? data.gross[h - 1] : ""}</td>
            ))}
            <td className="border border-black px-0.5 py-0.5 text-center font-bold" style={{ backgroundColor: "#dcf4dc" }}>{data.grossHasBack ? data.grossIn : ""}</td>
            <td className="border border-black px-0.5 py-0.5 text-center font-bold" style={{ backgroundColor: "#dcf4dc" }}>{data.grossHasFront || data.grossHasBack ? data.grossTot : ""}</td>
            <td className="border border-black px-0.5 py-0.5 text-center" style={{ backgroundColor: "#dcf4dc" }}></td>
            <td className="border border-black px-0.5 py-0.5 text-center" style={{ backgroundColor: "#dcf4dc" }}></td>
          </tr>
        )}

        {/* Team Net best-ball row (team mode only, not scramble, not chapman, not 6-6-6) */}
        {isTeamMode && !isScramble && !isChapman && !is666 && (
          <tr className="print-write-row" style={{ height: "28px" }}>
            <td className="border border-black px-1 py-0.5 font-bold text-left" style={{ backgroundColor: "#dcf0f6" }}>Net</td>
            {frontHoles.map(h => (
              <td key={`nh${h}`} className="border border-black px-0.5 py-0.5 text-center font-bold" style={{ backgroundColor: "#dcf0f6" }}>{data.net[h - 1] != null ? data.net[h - 1] : ""}</td>
            ))}
            <td className="border border-black px-0.5 py-0.5 text-center font-bold" style={{ backgroundColor: "#dcf0f6" }}>{data.netHasFront ? data.netOut : ""}</td>
            <td className="border border-black px-0.5 py-0.5 text-center" style={{ backgroundColor: "#dcf0f6" }}></td>
            {backHoles.map(h => (
              <td key={`nhb${h}`} className="border border-black px-0.5 py-0.5 text-center font-bold" style={{ backgroundColor: "#dcf0f6" }}>{data.net[h - 1] != null ? data.net[h - 1] : ""}</td>
            ))}
            <td className="border border-black px-0.5 py-0.5 text-center font-bold" style={{ backgroundColor: "#dcf0f6" }}>{data.netHasBack ? data.netIn : ""}</td>
            <td className="border border-black px-0.5 py-0.5 text-center font-bold" style={{ backgroundColor: "#dcf0f6" }}>{data.netHasFront || data.netHasBack ? data.netTot : ""}</td>
            <td className="border border-black px-0.5 py-0.5 text-center font-bold" style={{ backgroundColor: "#dcf0f6" }}>{teamHcp}</td>
            <td className="border border-black px-0.5 py-0.5 text-center" style={{ backgroundColor: "#dcf0f6" }}></td>
          </tr>
        )}

        {/* 6-6-6: single team row showing both player names, blank hole cells for gross entry */}
        {is666 && (
          <tr className="print-write-row" style={{ height: "28px" }}>
            <td className="border border-black px-1 py-0.5 font-bold text-left team-name-cell" style={{ backgroundColor: "#dcf4dc", fontSize: "10px" }}>
              {data.lastNames.join(" / ")}
            </td>
            {frontHoles.map(h => (
              <td key={`666g${h}`} className="border border-black px-0.5 py-0.5 text-center" style={{ backgroundColor: "#dcf4dc" }}></td>
            ))}
            <td className="border border-black px-0.5 py-0.5 text-center" style={{ backgroundColor: "#dcf4dc" }}></td>
            <td className="border border-black px-0.5 py-0.5 text-center" style={{ backgroundColor: "#dcf4dc" }}></td>
            {backHoles.map(h => (
              <td key={`666gb${h}`} className="border border-black px-0.5 py-0.5 text-center" style={{ backgroundColor: "#dcf4dc" }}></td>
            ))}
            <td className="border border-black px-0.5 py-0.5 text-center" style={{ backgroundColor: "#dcf4dc" }}></td>
            <td className="border border-black px-0.5 py-0.5 text-center font-bold" style={{ backgroundColor: "#dcf4dc" }}></td>
            <td className="border border-black px-0.5 py-0.5 text-center font-bold" style={{ backgroundColor: "#dcf4dc" }}>{teamHcp}</td>
            <td className="border border-black px-0.5 py-0.5 text-center font-bold" style={{ backgroundColor: "#dcf0f6" }}></td>
          </tr>
        )}

        {/* Scramble / Chapman: team score row with names */}
        {(isScramble || isChapman) && (
          <tr className="print-write-row" style={{ height: "28px" }}>
            <td className="border border-black px-1 py-0.5 font-bold text-left team-name-cell" style={{ backgroundColor: "#dcf4dc", fontSize: "10px" }}>
              {data.lastNames.join(" / ")}
            </td>
            {frontHoles.map(h => (
              <td key={`sgh${h}`} className="border border-black px-0.5 py-0.5 text-center font-bold" style={{ backgroundColor: "#dcf4dc" }}>{data.gross[h - 1] != null ? data.gross[h - 1] : ""}</td>
            ))}
            <td className="border border-black px-0.5 py-0.5 text-center font-bold" style={{ backgroundColor: "#dcf4dc" }}>{data.grossHasFront ? data.grossOut : ""}</td>
            <td className="border border-black px-0.5 py-0.5 text-center" style={{ backgroundColor: "#dcf4dc" }}></td>
            {backHoles.map(h => (
              <td key={`sghb${h}`} className="border border-black px-0.5 py-0.5 text-center font-bold" style={{ backgroundColor: "#dcf4dc" }}>{data.gross[h - 1] != null ? data.gross[h - 1] : ""}</td>
            ))}
            <td className="border border-black px-0.5 py-0.5 text-center font-bold" style={{ backgroundColor: "#dcf4dc" }}>{data.grossHasBack ? data.grossIn : ""}</td>
            <td className="border border-black px-0.5 py-0.5 text-center font-bold" style={{ backgroundColor: "#dcf4dc" }}>{data.grossHasFront || data.grossHasBack ? data.grossTot : ""}</td>
            <td className="border border-black px-0.5 py-0.5 text-center font-bold" style={{ backgroundColor: "#dcf4dc" }}>{teamHcp}</td>
            <td className="border border-black px-0.5 py-0.5 text-center" style={{ backgroundColor: "#dcf4dc" }}></td>
          </tr>
        )}

        {/* Scramble / Chapman / 6-6-6: individual score row (blank, for personal scorekeeping) */}
        {(isScramble || isChapman || is666) && (
          <tr className="print-write-row" style={{ height: "20px" }}>
            <td className="border border-black px-1 py-0.5 text-left" style={{ backgroundColor: "#f5f5f5", fontSize: "8px", color: "#999" }}>Marker's Score</td>
            {frontHoles.map(h => (<td key={`sish${h}`} className="border border-black px-0.5 py-0.5 text-center" style={{ backgroundColor: "#f5f5f5" }}></td>))}
            <td className="border border-black px-0.5 py-0.5 text-center" style={{ backgroundColor: "#f5f5f5" }}></td>
            <td className="border border-black px-0.5 py-0.5 text-center" style={{ backgroundColor: "#f5f5f5" }}></td>
            {backHoles.map(h => (<td key={`sisb${h}`} className="border border-black px-0.5 py-0.5 text-center" style={{ backgroundColor: "#f5f5f5" }}></td>))}
            <td className="border border-black px-0.5 py-0.5 text-center" style={{ backgroundColor: "#f5f5f5" }}></td>
            <td className="border border-black px-0.5 py-0.5 text-center" style={{ backgroundColor: "#f5f5f5" }}></td>
            <td className="border border-black px-0.5 py-0.5 text-center" style={{ backgroundColor: "#f5f5f5" }}></td>
            <td className="border border-black px-0.5 py-0.5 text-center" style={{ backgroundColor: "#f5f5f5" }}></td>
          </tr>
        )}
      </React.Fragment>
    );
  };

  const renderHoleHeaderRows = () => (
    <>
      <tr>
        <th className="border border-black bg-white px-1 py-0.5 text-left font-bold whitespace-nowrap" style={{ width: "110px" }}>Hole</th>
        {frontHoles.map(h => (<th key={`fh${h}`} className="border border-black bg-white px-0.5 py-0.5 text-center font-normal" style={{ width: "26px" }}>{h}</th>))}
        <th className="border border-black bg-gray-100 px-0.5 py-0.5 text-center font-bold" style={{ width: "30px" }}>OUT</th>
        <th className="border border-black bg-gray-100 px-0.5 py-0.5 text-center font-bold" style={{ width: "28px" }}>INIT</th>
        {backHoles.map(h => (<th key={`bh${h}`} className="border border-black bg-white px-0.5 py-0.5 text-center font-normal" style={{ width: "26px" }}>{h}</th>))}
        <th className="border border-black bg-gray-100 px-0.5 py-0.5 text-center font-bold" style={{ width: "26px" }}>IN</th>
        <th className="border border-black bg-white px-0.5 py-0.5 text-center font-bold" style={{ width: "26px" }}>TOT</th>
        <th className="border border-black bg-white px-0.5 py-0.5 text-center font-bold" style={{ width: "26px" }}>NET</th>
      </tr>
      <tr>
        <td className="border border-black bg-white px-1 py-0.5 font-bold text-left">Par</td>
        {par.slice(0, 9).map((p, i) => (<td key={`p${i}`} className="border border-black bg-white px-0.5 py-0.5 text-center">{p ?? ""}</td>))}
        <td className="border border-black bg-gray-100 px-0.5 py-0.5 text-center font-bold">{frontPar || ""}</td>
        <td className="border border-black bg-gray-100 px-0.5 py-0.5 text-center"></td>
        {par.slice(9, 18).map((p, i) => (<td key={`bp${i}`} className="border border-black bg-white px-0.5 py-0.5 text-center">{p ?? ""}</td>))}
        <td className="border border-black bg-gray-100 px-0.5 py-0.5 text-center font-bold">{backPar || ""}</td>
        <td className="border border-black bg-white px-0.5 py-0.5 text-center font-bold">{totalPar || ""}</td>
        <td className="border border-black bg-white px-0.5 py-0.5 text-center"></td>
      </tr>
      <tr>
        <td className="border border-black bg-white px-1 py-0.5 font-bold text-left">HCP</td>
        {hcpIndexes.slice(0, 9).map((h, i) => (<td key={`hi${i}`} className="border border-black bg-white px-0.5 py-0.5 text-center">{h ?? ""}</td>))}
        <td className="border border-black bg-gray-100 px-0.5 py-0.5 text-center"></td>
        <td className="border border-black bg-gray-100 px-0.5 py-0.5 text-center"></td>
        {hcpIndexes.slice(9, 18).map((h, i) => (<td key={`bhi${i}`} className="border border-black bg-white px-0.5 py-0.5 text-center">{h ?? ""}</td>))}
        <td className="border border-black bg-gray-100 px-0.5 py-0.5 text-center"></td>
        <td className="border border-black bg-white px-0.5 py-0.5 text-center"></td>
        <td className="border border-black bg-white px-0.5 py-0.5 text-center"></td>
      </tr>
    </>
  );

  return (
    <div className="border border-black rounded-md overflow-hidden bg-white text-black shadow-sm">
      {/* Header bar */}
      <div className="flex items-center justify-between px-3 py-1 bg-primary text-primary-foreground">
        <span className="text-sm font-bold truncate">{headerText}</span>
        <span className="flex items-center gap-2 shrink-0">
          {dateStr && <span className="text-xs opacity-90">{dateStr}</span>}
          <img src={LOGO_URL} alt="Logo" className="h-7 w-7 object-cover rounded-sm" />
        </span>
      </div>

      {/* Scorecard table */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[10px] sm:text-xs" style={{ minWidth: "640px" }}>
          <tbody>
            {/* Row 1: Hole numbers */}
            <tr>
              <th className="border border-black bg-white px-1 py-0.5 text-left font-bold whitespace-nowrap" style={{ width: "110px" }}>Hole</th>
              {frontHoles.map(h => (<th key={`fh${h}`} className="border border-black bg-white px-0.5 py-0.5 text-center font-normal" style={{ width: "26px" }}>{h}</th>))}
              <th className="border border-black bg-gray-100 px-0.5 py-0.5 text-center font-bold" style={{ width: "30px" }}>OUT</th>
              <th className="border border-black bg-gray-100 px-0.5 py-0.5 text-center font-bold" style={{ width: "28px" }}>INIT</th>
              {backHoles.map(h => (<th key={`bh${h}`} className="border border-black bg-white px-0.5 py-0.5 text-center font-normal" style={{ width: "26px" }}>{h}</th>))}
              <th className="border border-black bg-gray-100 px-0.5 py-0.5 text-center font-bold" style={{ width: "26px" }}>IN</th>
              <th className="border border-black bg-white px-0.5 py-0.5 text-center font-bold" style={{ width: "26px" }}>TOT</th>
              <th className="border border-black bg-white px-0.5 py-0.5 text-center font-bold" style={{ width: "30px" }}>HCP</th>
              <th className="border border-black bg-white px-0.5 py-0.5 text-center font-bold" style={{ width: "26px" }}>NET</th>
            </tr>
            {/* Row 2: Par */}
            <tr>
              <td className="border border-black bg-white px-1 py-0.5 font-bold text-left">Par</td>
              {par.slice(0, 9).map((p, i) => (<td key={`p${i}`} className="border border-black bg-white px-0.5 py-0.5 text-center">{p ?? ""}</td>))}
              <td className="border border-black bg-gray-100 px-0.5 py-0.5 text-center font-bold">{frontPar || ""}</td>
              <td className="border border-black bg-gray-100 px-0.5 py-0.5 text-center"></td>
              {par.slice(9, 18).map((p, i) => (<td key={`bp${i}`} className="border border-black bg-white px-0.5 py-0.5 text-center">{p ?? ""}</td>))}
              <td className="border border-black bg-gray-100 px-0.5 py-0.5 text-center font-bold">{backPar || ""}</td>
              <td className="border border-black bg-white px-0.5 py-0.5 text-center font-bold">{totalPar || ""}</td>
              <td className="border border-black bg-white px-0.5 py-0.5 text-center"></td>
              <td className="border border-black bg-white px-0.5 py-0.5 text-center"></td>
            </tr>
            {/* Row 3: HCP Index */}
            <tr>
              <td className="border border-black bg-white px-1 py-0.5 font-bold text-left">HCP</td>
              {hcpIndexes.slice(0, 9).map((h, i) => (<td key={`hi${i}`} className="border border-black bg-white px-0.5 py-0.5 text-center">{h ?? ""}</td>))}
              <td className="border border-black bg-gray-100 px-0.5 py-0.5 text-center"></td>
              <td className="border border-black bg-gray-100 px-0.5 py-0.5 text-center"></td>
              {hcpIndexes.slice(9, 18).map((h, i) => (<td key={`bhi${i}`} className="border border-black bg-white px-0.5 py-0.5 text-center">{h ?? ""}</td>))}
              <td className="border border-black bg-gray-100 px-0.5 py-0.5 text-center"></td>
              <td className="border border-black bg-white px-0.5 py-0.5 text-center"></td>
              <td className="border border-black bg-white px-0.5 py-0.5 text-center"></td>
              <td className="border border-black bg-white px-0.5 py-0.5 text-center"></td>
            </tr>
            {/* Per-team sections (team mode) or single section (non-team mode) */}
            {isTeamMode
              ? subTeams.map((teamPlayers, teamIdx) => renderTeamRows(teamPlayers, teamIdx))
              : renderTeamRows(players, 0)}
          </tbody>
        </table>
      </div>

      {is666 && segmentsLegend.length > 0 && (
        <div className="px-2 py-1 bg-muted/40 border-t border-black text-[10px] text-foreground flex flex-wrap gap-x-3 gap-y-0.5">
          {segmentsLegend.map((s, i) => (
            <span key={i} className="font-semibold">{s.holes}: {s.formatLabel}</span>
          ))}
        </div>
      )}
    </div>
  );
}
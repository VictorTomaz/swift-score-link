// LEGACY/DISABLED - DO NOT USE
// This file has been renamed to prevent accidental usage.
// The active PDF generator is: base44/functions/generateScorecardPdf/entry.ts

import React from "react";

/**
 * Printable golf scorecard — front 9 & back 9 side-by-side.
 * Two cards per landscape Letter page with a dashed cut line between them.
 * Black-on-white, thin grid lines, OCR alignment dots in score cells.
 * Dynamic title (event name), auto-populated date/tees/par/SI/players.
 */
export default function PrintScorecard({ round, playersOverride, hideTitle = false }) {
  if (!round) return null;

  const par = round.par || [];
  const hcpIndexes = round.hole_handicap_indexes || [];
  const players = (playersOverride || round.players || []).slice(0, 4);
  const teeSets = (round.course_tee_sets || []).slice(0, 2);

  const front9 = Array.from({ length: 9 }, (_, i) => i);
  const back9 = Array.from({ length: 9 }, (_, i) => i + 9);

  const getInitials = (name) => {
    if (!name) return '';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const sum = (arr, slice) => slice.reduce((s, i) => s + (Number(arr[i]) || 0), 0);
  const totalPar = par.length === 18 ? par.reduce((a, b) => a + b, 0) : 0;
  const frontPar = sum(par, front9);
  const backPar = sum(par, back9);

  const dateStr = round.date
    ? new Date(round.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "";

  const baseCellStyle = { border: "1px solid #000", padding: 0, position: "relative" };
  const centerStyle = { textAlign: "center" };

  // Score cell with OCR alignment dot in upper-right corner
  const scoreCell = (key) => (
    <td key={key} style={{ ...baseCellStyle, ...centerStyle }}>
      <div style={{ position: "absolute", top: 2, right: 3, width: 3, height: 3, borderRadius: "50%", background: "#ccc" }} />
    </td>
  );

  const renderHalf = (holes, prefix, isBack) => (
    <table style={{ tableLayout: "fixed", height: "100%", width: "100%", borderCollapse: "collapse" }}>
      <colgroup>
        <col style={{ width: "1.1in" }} />
        {holes.map(i => <col key={i} style={{ width: "0.33in" }} />)}
        {isBack ? (
          <>
            <col style={{ width: "0.33in" }} />
            <col style={{ width: "0.33in" }} />
            <col style={{ width: "0.3in" }} />
            <col style={{ width: "0.33in" }} />
          </>
        ) : (
          <>
            <col style={{ width: "0.35in" }} />
            <col style={{ width: "0.3in" }} />
          </>
        )}
      </colgroup>
      <tbody>
        {/* Hole row */}
        <tr style={{ height: "0.22in" }}>
          <td style={{ ...baseCellStyle, textAlign: "center", fontWeight: "bold", fontSize: 11, backgroundColor: "#e5e5e5" }}>Hole</td>
          {holes.map(i => (
            <td key={`${prefix}h${i}`} style={{ ...baseCellStyle, textAlign: "center", fontWeight: "bold", fontSize: 11, backgroundColor: "#e5e5e5" }}>{i + 1}</td>
          ))}
          {isBack ? (
            <>
              <td style={{ ...baseCellStyle, textAlign: "center", fontWeight: "bold", fontSize: 9, backgroundColor: "#e5e5e5" }}>IN</td>
              <td style={{ ...baseCellStyle, textAlign: "center", fontWeight: "bold", fontSize: 9, backgroundColor: "#e5e5e5" }}>TOT</td>
              <td style={{ ...baseCellStyle, textAlign: "center", fontWeight: "bold", fontSize: 9, backgroundColor: "#e5e5e5" }}>PH</td>
              <td style={{ ...baseCellStyle, textAlign: "center", fontWeight: "bold", fontSize: 9, backgroundColor: "#e5e5e5" }}>NET</td>
            </>
          ) : (
            <>
              <td style={{ ...baseCellStyle, textAlign: "center", fontWeight: "bold", fontSize: 9, backgroundColor: "#e5e5e5" }}>OUT</td>
              <td style={{ ...baseCellStyle, textAlign: "center", fontWeight: "bold", fontSize: 9, backgroundColor: "#e5e5e5" }}>INIT</td>
            </>
          )}
        </tr>
        {/* Tee yardage rows (tee name shown; yardage cells blank — no yardage data in data model) */}
        {teeSets.map((tee, ti) => (
          <tr key={`${prefix}tee${ti}`} style={{ height: "0.2in" }}>
            <td style={{ border: "1px solid #000", padding: 0, fontSize: 9, fontWeight: 500, backgroundColor: "#f3f3f3", whiteSpace: "nowrap", overflow: "hidden", textAlign: "center" }}>
              {tee.name || `Tee ${ti + 1}`}
            </td>
            {holes.map(i => (
              <td key={`${prefix}ty${ti}-${i}`} style={{ border: "1px solid #000", padding: 0, fontSize: 9 }}></td>
            ))}
            <td style={{ border: "1px solid #000", padding: 0 }} colSpan={isBack ? 4 : 2}></td>
          </tr>
        ))}
        {/* Par row */}
        <tr style={{ height: "0.22in" }}>
          <td style={{ border: "1px solid #000", padding: 0, textAlign: "center", fontWeight: "bold", fontSize: 11, backgroundColor: "#f3f3f3" }}>Par</td>
          {holes.map(i => (
            <td key={`${prefix}p${i}`} style={{ border: "1px solid #000", padding: 0, textAlign: "center", fontWeight: "bold", fontSize: 11 }}>{par[i] ?? ""}</td>
          ))}
          {isBack ? (
            <>
              <td style={{ border: "1px solid #000", padding: 0, textAlign: "center", fontWeight: "bold", fontSize: 11 }}>{backPar || ""}</td>
              <td style={{ border: "1px solid #000", padding: 0, textAlign: "center", fontWeight: "bold", fontSize: 11 }}>{totalPar || ""}</td>
              <td style={{ border: "1px solid #000", padding: 0 }}></td>
              <td style={{ border: "1px solid #000", padding: 0 }}></td>
            </>
          ) : (
            <>
              <td style={{ border: "1px solid #000", padding: 0, textAlign: "center", fontWeight: "bold", fontSize: 11 }}>{frontPar || ""}</td>
              <td style={{ border: "1px solid #000", padding: 0 }}></td>
            </>
          )}
        </tr>
        {/* Stroke Index row */}
        <tr style={{ height: "0.22in" }}>
          <td style={{ border: "1px solid #000", padding: 0, textAlign: "center", fontWeight: "bold", fontSize: 11, backgroundColor: "#f3f3f3" }}>SI</td>
          {holes.map(i => (
            <td key={`${prefix}si${i}`} style={{ border: "1px solid #000", padding: 0, textAlign: "center", fontSize: 11 }}>{hcpIndexes[i] ?? ""}</td>
          ))}
          <td style={{ border: "1px solid #000", padding: 0 }} colSpan={isBack ? 4 : 1}></td>
        </tr>
        {/* Player rows */}
        {players.map((player, pi) => {
          const ch = player.course_handicap;
          const hcpDisplay = player.is_plus_handicap && ch != null ? `+${ch}` : (ch != null ? ch : "");
          return (
            <tr key={`${prefix}pl${pi}`} style={{ height: "0.42in" }}>
              <td style={{ border: "1px solid #000", padding: "0 2px", fontSize: 10, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 0, textAlign: "left" }}>
                {player.name || `Player ${pi + 1}`}
              </td>
              {holes.map(i => scoreCell(`${prefix}ps${pi}-${i}`))}
              {isBack ? (
                <>
                  {scoreCell(`${prefix}po1-${pi}`)}
                  {scoreCell(`${prefix}po2-${pi}`)}
                  <td style={{ border: "1px solid #000", padding: 0, textAlign: "center", fontSize: 10, backgroundColor: "#f5f5f5" }}>{hcpDisplay}</td>
                  {scoreCell(`${prefix}po3-${pi}`)}
                </>
              ) : (
                <>
                  {scoreCell(`${prefix}po-${pi}`)}
                  <td style={{ border: "1px solid #000", padding: 0, textAlign: "center", fontWeight: "bold", fontSize: 9, backgroundColor: "#f5f5f5" }}>{getInitials(player.name)}</td>
                </>
              )}
            </tr>
          );
        })}
        {/* Pad empty player rows to fill 4 slots */}
        {Array.from({ length: Math.max(0, 4 - players.length) }).map((_, pi) => (
          <tr key={`${prefix}empty${pi}`} style={{ height: "0.42in" }}>
            <td style={{ border: "1px solid #000", padding: 0 }}>&nbsp;</td>
            {holes.map(i => scoreCell(`${prefix}es${pi}-${i}`))}
            {isBack ? (
              <>
                {scoreCell(`${prefix}eo1-${pi}`)}
                {scoreCell(`${prefix}eo2-${pi}`)}
                <td style={{ border: "1px solid #000", padding: 0, backgroundColor: "#f5f5f5" }}></td>
                {scoreCell(`${prefix}eo3-${pi}`)}
              </>
            ) : (
              <>
                {scoreCell(`${prefix}eo-${pi}`)}
                <td style={{ border: "1px solid #000", padding: 0, backgroundColor: "#f5f5f5" }}></td>
              </>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <div style={{ color: "#000", background: "white", width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
      {!hideTitle && (
        <div style={{ textAlign: "center", paddingBottom: 6 }}>
          <span style={{ fontSize: 17, fontWeight: "bold", lineHeight: 1.2, display: "block" }}>
            {round.event_name || "Golf Round"}
          </span>
        </div>
      )}

      {/* Two halves side-by-side — front 9 | back 9 */}
      <div className="flex gap-1 scorecard-table-wrapper" style={{ width: "100%" }}>
        {renderHalf(front9, "f-", false)}
        {renderHalf(back9, "b-", true)}
      </div>
    </div>
  );
}
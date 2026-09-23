import React from "react";

/** One champion line: flight / division label, name, score, and purse. */
export default function ChampionRow({ row, showFlightLabel }) {
  const eyebrow = [showFlightLabel ? row.label : null, row.divisionLabel].filter(Boolean).join(" · ");
  return (
    <div className="rounded-lg bg-card px-4 py-3 shadow-sm">
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          {eyebrow && (
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{eyebrow}</p>
          )}
          <p className="text-xl sm:text-2xl font-extrabold text-foreground truncate leading-tight">{row.name}</p>
        </div>
        <div className="text-right shrink-0">
          {row.score != null && (
            <p className="text-xl sm:text-2xl font-extrabold text-primary leading-tight">{row.score}</p>
          )}
          {row.via_playoff && <p className="text-xs font-medium text-muted-foreground">won playoff</p>}
        </div>
      </div>
      {row.purse > 0 && (
        <div className="mt-2 pt-2 border-t border-border flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Champion Purse</span>
          <span className="font-semibold text-accent-foreground bg-accent/30 rounded-md px-2 py-0.5">
            ${Math.round(row.purse)}{row.purse_pending ? " · awaiting playoff" : ""}
          </span>
        </div>
      )}
    </div>
  );
}
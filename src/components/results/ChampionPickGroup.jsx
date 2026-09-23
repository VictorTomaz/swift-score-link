import React from "react";

/** Tied leaders for one flight/division — tap to pick the playoff winner. */
export default function ChampionPickGroup({ title, candidates, selected, disabled, onSelect }) {
  return (
    <div className="space-y-1.5">
      {title && (
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      )}
      <div className="flex flex-wrap gap-2">
        {candidates.map((c) => {
          const active = selected === c.player_id;
          return (
            <button
              key={c.player_id}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(c.player_id)}
              className={`px-3 py-2 rounded-lg border-2 text-sm font-medium transition-colors ${
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-foreground hover:bg-muted"
              }`}
            >
              {c.name}
              <span className={`ml-2 text-xs ${active ? "opacity-80" : "text-muted-foreground"}`}>{c.score}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
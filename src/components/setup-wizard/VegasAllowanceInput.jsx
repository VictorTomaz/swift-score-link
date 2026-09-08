import React from "react";
import { vegasHcpPercent } from "@/lib/vegasFormat";

const PRESETS = [
  { pct: 100, label: "100%" },
  { pct: 85, label: "85%" },
  { pct: 70, label: "70%" },
  { pct: 0, label: "0%" },
];

/**
 * Las Vegas handicap allowance — the single percentage applied to every
 * player's course handicap for the whole round (scorecard dots, team Gross/Net
 * rows, and individual net side games). The host may pick any percentage, even
 * a non-standard one.
 */
export default function VegasAllowanceInput({ round, value, onChange, disabled }) {
  const effective = vegasHcpPercent({ ...(round || {}), game_type: "team_las_vegas", vegas_hcp_percent: value });
  const isCustom = value !== null && value !== undefined && value !== "";

  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">Handicap Allowance (Las Vegas)</label>
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((p) => (
          <button
            key={p.pct}
            type="button"
            disabled={disabled}
            onClick={() => onChange(p.pct)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              isCustom && Number(value) === p.pct
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-foreground hover:bg-muted/80"
            } ${disabled ? "opacity-60 cursor-not-allowed" : ""}`}
          >
            {p.label}
          </button>
        ))}
        <div className="flex items-center gap-1">
          <input
            type="number"
            min="0"
            max="200"
            inputMode="numeric"
            placeholder="Any %"
            disabled={disabled}
            value={isCustom ? value : ""}
            onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
            className="w-20 h-9 rounded-md border border-input bg-background px-2 text-sm text-center"
          />
          <span className="text-sm text-muted-foreground">%</span>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Using <span className="font-semibold text-foreground">{effective}%</span> of each player's course handicap.
        Applies to scorecard dots, the team Gross/Net rows,
        and net side games. 85% is the recommended allowance — any other value is allowed.
      </p>
    </div>
  );
}
import React from "react";

const OPTIONS = [
  { label: "Gross only", value: ["gross"] },
  { label: "Net only", value: ["net"] },
  { label: "Both", value: ["gross", "net"] },
];

/** Which divisions crown a champion this tournament. */
export default function ChampionDivisionPicker({ value, onChange }) {
  const current = [...(value || ["gross"])].sort().join(",");
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">Crown a champion for</p>
      <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
        {OPTIONS.map((o) => {
          const active = [...o.value].sort().join(",") === current;
          return (
            <button
              key={o.label}
              type="button"
              onClick={() => onChange(o.value)}
              className={`rounded-md py-2 text-sm font-medium transition-all ${
                active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      <p className="text-[11px] text-muted-foreground">Payout rule: Title Only — a playoff decides the title, tied players still share the place money.</p>
    </div>
  );
}
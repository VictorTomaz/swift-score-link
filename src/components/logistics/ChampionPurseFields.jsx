import React from "react";
import { Input } from "@/components/ui/input";

/**
 * Per-flight Champion Purse — separate club/sponsor money paid to each
 * division champion on top of the place payouts. Shape: { "1": { gross, net } }
 */
export default function ChampionPurseFields({ flights, divisions, value, onChange }) {
  const setAmount = (fn, division, raw) => {
    const key = String(fn);
    const amount = raw === "" ? 0 : Math.max(0, Number(raw) || 0);
    onChange({ ...(value || {}), [key]: { ...((value || {})[key] || {}), [division]: amount } });
  };

  return (
    <div className="space-y-2">
      <div>
        <p className="text-xs font-medium text-muted-foreground">Champion Purse (optional)</p>
        <p className="text-[11px] text-muted-foreground">Extra money paid to the champion on top of place payouts — never taken from the pot. Goes to the outright winner, or the playoff winner on a tie.</p>
      </div>
      {flights.map((f) => (
        <div key={f.flightNumber} className="rounded-lg border border-border p-3 space-y-2">
          {flights.length > 1 && (
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{f.label}</p>
          )}
          <div className={`grid gap-2 ${divisions.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
            {divisions.map((d) => (
              <label key={d} className="space-y-1">
                <span className="text-xs text-foreground">{d === "net" ? "Net Champion" : "Gross Champion"} $</span>
                <Input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  placeholder="0"
                  value={value?.[String(f.flightNumber)]?.[d] || ""}
                  onChange={(e) => setAmount(f.flightNumber, d, e.target.value)}
                />
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
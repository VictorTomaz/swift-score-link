import React from "react";
import { useNavigate } from "react-router-dom";
import { CalendarPlus } from "lucide-react";
import { useSeriesRounds } from "@/hooks/useSeriesRounds";
import { flightLabel } from "@/lib/flightSwitcher";

/**
 * Shown on a COMPLETED round's scorecard when this flight is missing a day
 * that other flights in the tournament are playing (e.g. Flight 3 has a Day 2
 * round but this flight's Day 2 hasn't been created yet). Without this, the
 * flight shows an "in progress" gold ring but tapping it dead-ends on the
 * completed Day 1 scorecard with no way to proceed.
 */
export default function MissingDayBanner({ round }) {
  const navigate = useNavigate();
  const { data: seriesRounds } = useSeriesRounds(round);

  if (!round?.is_multi_flight || !round?.is_multi_day) return null;
  const all = (seriesRounds || []).filter(Boolean);
  if (all.length === 0) return null;

  const fn = round.flight_number || 1;
  const flightRounds = all.filter(r => (r.flight_number || 1) === fn);
  const flightDates = new Set(flightRounds.map(r => r.date || ""));
  const missingDates = [...new Set(all.map(r => r.date || "").filter(Boolean))]
    .filter(d => !flightDates.has(d))
    .sort();
  if (missingDates.length === 0) return null;

  // Anchor the new day to this flight's latest round (SetupWizard addDay flow)
  const latest = [...flightRounds].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))[0] || round;
  const dateLabel = new Date(missingDates[0].replace(/-/g, "/"))
    .toLocaleDateString("en-US", { month: "short", day: "numeric" });

  return (
    <div className="rounded-xl border border-accent/40 bg-accent/10 p-4 space-y-3">
      <p className="text-sm text-foreground">
        <strong>{flightLabel(round)}</strong> doesn't have a round for <strong>{dateLabel}</strong> yet.
        Other flights are playing that day — add this flight's round to keep the tournament in sync.
      </p>
      <button
        type="button"
        onClick={() => navigate(`/SetupWizard?addDay=${latest.id}`)}
        className="w-full flex items-center justify-center gap-2 rounded-lg bg-accent text-accent-foreground px-3 py-2.5 text-sm font-semibold hover:bg-accent/90 transition-colors"
      >
        <CalendarPlus className="w-4 h-4" />
        Add {dateLabel} Round for {flightLabel(round)}
      </button>
    </div>
  );
}
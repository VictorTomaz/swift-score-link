import React from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, Circle, CircleDot, Trophy } from "lucide-react";
import { useSeriesRounds } from "@/hooks/useSeriesRounds";
import { flightLabel, flightAggregateStatus, sameDayFlights } from "@/lib/flightSwitcher";

/**
 * Sticky flight switcher for multi-flight tournaments — lets the organizer jump
 * between the flights being played on the same day without going back to the
 * Dashboard. Renders nothing for single-flight rounds.
 */
export default function FlightSwitcher({ round, onBeforeSwitch }) {
  const navigate = useNavigate();
  const { data: seriesRounds } = useSeriesRounds(round);

  const flights = sameDayFlights(round, seriesRounds);
  if (flights.length < 2) return null;

  // Status covers the whole flight (all of its days), not just the day you'd jump to
  const statuses = flights.map(f => ({
    round: f,
    status: flightAggregateStatus(f.flight_number || 1, seriesRounds, round),
  }));
  // Only announce "All flights complete" once the tournament has actually been
  // finalized — i.e. the combined results exist. Before finalization, a multi-day
  // tournament may simply not have its later days created/played yet, so claiming
  // completion is misleading.
  const allComplete =
    statuses.every(s => s.status === "complete") &&
    (seriesRounds || []).some(r => r.results?.is_series_cumulative || r.is_series_final === true);

  const go = async (target) => {
    if (target.id === round.id) return;
    if (onBeforeSwitch) await onBeforeSwitch();
    // Full navigation so all per-round scoring state re-initializes cleanly
    window.location.href = `/Scorecard?id=${target.id}`;
  };

  return (
    <div className="sticky top-0 z-20 -mx-4 px-4 pt-2 pb-2 bg-background space-y-2">
      {allComplete && (
        <button
          type="button"
          onClick={() => navigate("/TournamentResults")}
          className="w-full flex items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-sm font-semibold text-primary"
        >
          <Trophy className="w-4 h-4" />
          All flights complete — View Tournament Results
        </button>
      )}
      <div className="flex gap-2 overflow-x-auto pb-0.5">
        {statuses.map(({ round: f, status }) => {
          const isActive = f.id === round.id;
          const Icon = status === "complete" ? CheckCircle2 : status === "in_progress" ? CircleDot : Circle;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => go(f)}
              className={`shrink-0 flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-semibold transition-colors ${
                isActive
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-foreground"
              } ${!isActive && status !== "complete" ? "ring-2 ring-accent" : ""}`}
            >
              <Icon
                className={`w-3.5 h-3.5 ${
                  isActive
                    ? ""
                    : status === "complete"
                    ? "text-green-600"
                    : status === "in_progress"
                    ? "text-accent"
                    : "text-muted-foreground"
                }`}
              />
              {flightLabel(f)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
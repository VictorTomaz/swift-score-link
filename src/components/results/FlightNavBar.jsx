import React from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { flightLabel, flightAggregateStatus, sameDayFlights } from "@/lib/flightSwitcher";

/**
 * Multi-flight Results page helper: shows which other flights still need
 * scoring and jumps straight to their scorecard — no need to add a day or flight.
 */
export default function FlightNavBar({ round, seriesRounds }) {
  const navigate = useNavigate();
  const flights = sameDayFlights(round, seriesRounds);
  if (flights.length < 2) return null;

  const others = flights
    .filter(f => f.id !== round.id)
    .map(f => ({ round: f, status: flightAggregateStatus(f.flight_number || 1, seriesRounds, round) }));
  const unfinished = others.filter(o => o.status !== "complete");
  if (unfinished.length === 0) return null;

  return (
    <div className="mb-4 rounded-lg border border-primary/30 bg-primary/10 p-3">
      <p className="text-sm font-semibold text-foreground mb-2">Still to score</p>
      <div className="flex flex-wrap gap-2">
        {unfinished.map(({ round: f, status }) => (
          <button
            key={f.id}
            type="button"
            onClick={() => navigate(`/Scorecard?id=${f.id}`)}
            className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-sm font-semibold text-foreground"
          >
            {flightLabel(f)}
            <span className="text-xs font-normal text-muted-foreground">
              {status === "in_progress" ? "in progress" : "Awaiting scores"}
            </span>
            <ArrowRight className="w-3.5 h-3.5 text-primary" />
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground mt-2">
        <CheckCircle2 className="w-3 h-3 inline mr-1 text-green-600" />
        Tap a flight to enter its scores — you don't need to add a day or flight.
      </p>
    </div>
  );
}
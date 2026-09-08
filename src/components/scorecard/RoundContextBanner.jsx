import React from "react";
import { useNavigate } from "react-router-dom";
import { Layers, ChevronLeft } from "lucide-react";
import { format } from "date-fns";
import { useTournamentSeries, buildFlightStructure } from "@/hooks/useTournamentSeries";

/**
 * Persistent context banner for multi-flight / multi-day rounds — makes it
 * impossible to lose track of WHICH flight and day you're scoring. Display
 * only: it never touches scores or round data.
 */
export default function RoundContextBanner({ round }) {
  const navigate = useNavigate();
  const isSeries = !!(round?.is_multi_day || round?.is_multi_flight);
  const anchorId = round?.parent_round_id || round?.id;
  const { data: seriesRounds = [] } = useTournamentSeries(isSeries ? anchorId : null);

  if (!isSeries) return null;

  const flights = buildFlightStructure(seriesRounds);
  const flight = flights.find(f => f.days.some(d => d.round.id === round.id));
  const day = flight?.days.find(d => d.round.id === round.id);

  const parts = [];
  if (flights.length > 1) parts.push(flight?.label || `Flight ${round.flight_number || 1}`);
  if (flight && flight.days.length > 1 && day) parts.push(`Day ${day.dayNumber}`);
  if (round.date) parts.push(format(new Date(round.date.replace(/-/g, '/')), "MMM d"));

  if (parts.length === 0) return null;

  return (
    <div className="sticky top-0 z-20 -mx-4 px-4 py-2 bg-primary text-primary-foreground flex items-center justify-between gap-2">
      <div className="flex items-center gap-2 min-w-0">
        <Layers className="w-4 h-4 shrink-0" />
        <p className="text-sm font-bold truncate">
          {parts.join(" · ")}
          <span className="font-normal opacity-80 ml-2">Entering scores here</span>
        </p>
      </div>
      <button
        type="button"
        onClick={() => navigate(`/TournamentHub?id=${anchorId}`)}
        className="flex items-center gap-1 text-xs font-semibold shrink-0 underline"
      >
        <ChevronLeft className="w-3.5 h-3.5" />
        Hub
      </button>
    </div>
  );
}
import React, { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronLeft, Trophy, Calendar, Layers, CalendarDays, PlusCircle } from "lucide-react";
import { format } from "date-fns";
import PageDescription from "@/components/PageDescription";
import FlightDayCard from "@/components/tournament/FlightDayCard";
import FinalizeTournamentCard from "@/components/tournament/FinalizeTournamentCard";
import { useTournamentSeries, buildFlightStructure, findFinalRound } from "@/hooks/useTournamentSeries";

/**
 * Tournament Hub — one screen for an entire multi-flight / multi-day
 * tournament. Shows every flight and day with its scoring progress, opens the
 * exact round you tap, finalizes the whole tournament in one action, and links
 * to the combined results. Display + navigation only: all payout computation
 * still runs through the existing engines.
 */
export default function TournamentHub() {
  const urlParams = new URLSearchParams(window.location.search);
  const anchorId = urlParams.get("id");
  const navigate = useNavigate();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, []);

  const { data: seriesRounds = [], isLoading } = useTournamentSeries(anchorId);

  const parentRound = useMemo(
    () => seriesRounds.find(r => !r.parent_round_id) || seriesRounds[0] || null,
    [seriesRounds]
  );
  const flights = useMemo(() => buildFlightStructure(seriesRounds), [seriesRounds]);
  const finalRound = useMemo(() => findFinalRound(seriesRounds), [seriesRounds]);
  const isFinalized = useMemo(
    () => seriesRounds.some(r => r.results?.is_series_cumulative),
    [seriesRounds]
  );

  const dateRange = useMemo(() => {
    const dates = seriesRounds.map(r => r.date).filter(Boolean).sort();
    if (dates.length === 0) return "";
    const first = format(new Date(dates[0].replace(/-/g, '/')), "MMM d");
    const last = format(new Date(dates[dates.length - 1].replace(/-/g, '/')), "MMM d, yyyy");
    return dates[0] === dates[dates.length - 1] ? last : `${first} – ${last}`;
  }, [seriesRounds]);

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto space-y-4 pb-20 pt-20">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }

  if (!parentRound) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">Tournament not found.</p>
        <Button variant="edit" size="sm" onClick={() => navigate("/Dashboard")} className="mt-4 gap-2">
          <ChevronLeft className="w-4 h-4" />
          Dashboard
        </Button>
      </div>
    );
  }

  const isMultiFlight = flights.length > 1 || !!parentRound.is_multi_flight;
  const isMultiDay = !!parentRound.is_multi_day;
  const totalPlayers = flights.reduce(
    (s, f) => s + Math.max(...f.days.map(d => d.total), 0), 0
  );

  return (
    <div className="max-w-3xl mx-auto space-y-4 pb-20 sm:pb-0">
      <PageDescription
        title="Tournament Hub"
        description="Every flight and day of this tournament in one place. Tap any day to enter scores, then finalize once to pay out the combined results."
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="edit" size="sm" onClick={() => navigate("/Dashboard")} className="gap-2">
          <ChevronLeft className="w-4 h-4" />
          Dashboard
        </Button>
        <Button
          variant="default"
          size="sm"
          onClick={() => navigate(`/TournamentResults?id=${parentRound.id}`)}
          className="gap-2"
        >
          <Trophy className="w-4 h-4" />
          Combined Results
        </Button>
      </div>

      {/* Tournament header */}
      <Card className="border-0 shadow-sm bg-primary/5">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
              <Layers className="w-5 h-5 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="font-bold text-foreground truncate">{parentRound.event_name}</p>
              {dateRange && (
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                  <Calendar className="w-3 h-3" />
                  {dateRange}
                </p>
              )}
              <p className="text-xs text-muted-foreground mt-0.5">
                {flights.length > 1 && `${flights.length} Flights · `}
                {seriesRounds.length} Round{seriesRounds.length > 1 ? "s" : ""} · {totalPlayers} players
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Flights & days */}
      <div className="space-y-3">
        {flights.map(f => (
          <FlightDayCard
            key={f.flightNumber}
            flight={f}
            showFlightLabel={flights.length > 1}
            isFinalFlight={isMultiFlight && f.flightNumber === (finalRound?.flight_number || 1)}
          />
        ))}
      </div>

      {/* Add day / add flight */}
      <div className="flex flex-wrap gap-2">
        {isMultiDay && flights.map(f => (
          <Button
            key={`addday-${f.flightNumber}`}
            variant="secondary"
            size="sm"
            onClick={() => navigate(`/SetupWizard?addDay=${f.days[f.days.length - 1].round.id}`)}
            className="gap-2 bg-logistics text-logistics-foreground hover:bg-logistics/90"
          >
            <CalendarDays className="w-4 h-4" />
            {flights.length > 1 ? `Add Day → ${f.label}` : "Add Day"}
          </Button>
        ))}
        {isMultiFlight && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => navigate(`/SetupWizard?addFlight=${parentRound.id}`)}
            className="gap-2 bg-logistics text-logistics-foreground hover:bg-logistics/90"
          >
            <PlusCircle className="w-4 h-4" />
            Add Flight {flights.length + 1}
          </Button>
        )}
      </div>

      {/* Finalize */}
      <FinalizeTournamentCard
        seriesRounds={seriesRounds}
        finalRound={finalRound}
        anchorId={anchorId}
        isFinalized={isFinalized}
      />
    </div>
  );
}
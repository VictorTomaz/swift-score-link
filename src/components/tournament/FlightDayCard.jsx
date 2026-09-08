import React from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronRight, CheckCircle2, CircleDashed, Flag } from "lucide-react";
import { format } from "date-fns";

/**
 * One flight in the Tournament Hub — its name, each day's scoring progress, and
 * a tap target per day that opens that exact round's scorecard or results.
 */
export default function FlightDayCard({ flight, isFinalFlight, showFlightLabel }) {
  const navigate = useNavigate();

  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-0">
        {showFlightLabel && (
          <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 border-b border-border">
            <p className="font-semibold text-sm text-foreground truncate">{flight.label}</p>
            <div className="flex items-center gap-1.5 shrink-0">
              {isFinalFlight && (
                <Badge variant="secondary" className="text-xs bg-accent/20 text-accent-foreground gap-1">
                  <Flag className="w-3 h-3" />
                  Final Flight
                </Badge>
              )}
              {flight.allComplete && (
                <Badge variant="secondary" className="text-xs bg-primary/15 text-primary">Complete</Badge>
              )}
            </div>
          </div>
        )}

        <div className="px-3.5 py-1.5">
          {flight.days.map((day) => {
            const r = day.round;
            const target = r.status === "completed" ? `/Results?id=${r.id}` : `/Scorecard?id=${r.id}`;
            return (
              <button
                key={r.id}
                onClick={() => navigate(target)}
                className="w-full flex items-center justify-between gap-2 py-2.5 text-left hover:bg-muted/50 rounded-md px-2 -mx-2 transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {day.complete
                    ? <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
                    : <CircleDashed className="w-4 h-4 text-muted-foreground shrink-0" />}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      Day {day.dayNumber}
                      {r.date && (
                        <span className="text-xs text-muted-foreground font-normal ml-1.5">
                          {format(new Date(r.date.replace(/-/g, '/')), "MMM d")}
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {day.scored} of {day.total} players scored
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Badge variant="secondary" className="capitalize text-xs">{r.status}</Badge>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </div>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
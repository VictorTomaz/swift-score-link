import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';

export default function LogisticsRoundSelector({ rounds, isLoading, selectedRound, onSelect, dayNumberByRoundId }) {
  return <Card className="border-0 shadow-sm"><CardContent className="p-4 space-y-3">
    <h2 className="text-sm font-semibold text-foreground">Select a Round</h2>
    {isLoading ? <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}</div>
      : rounds.length === 0 ? <p className="text-sm text-muted-foreground text-center py-6">No rounds found. Create a round first.</p>
      : <div className="space-y-2 max-h-72 overflow-y-auto">{rounds.map(round => (
        <button key={round.id} onClick={() => onSelect(round)} className={`w-full flex items-center justify-between p-3 rounded-lg border transition-colors text-left ${selectedRound?.id === round.id ? 'border-primary bg-primary/5' : 'border-border bg-muted/50 hover:bg-muted'}`}>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className="font-medium text-sm text-foreground truncate">{round.event_name}</p>
              {round.is_multi_flight && <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-logistics/15 text-logistics whitespace-nowrap">{round.flight_name || `Flight ${round.flight_number || 1}`}</span>}
              {round.is_multi_day && !round.is_multi_flight && <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-primary/15 text-primary whitespace-nowrap">Day {dayNumberByRoundId[round.id] || 1}</span>}
            </div>
            <p className="text-xs text-muted-foreground truncate">{(round.is_multi_flight || (round.flight_number || 1) > 1) ? `${round.flight_name || `Flight ${round.flight_number || 1}`} · ` : ''}{round.course_name || 'No course'} · {round.player_count} players</p>
          </div>
          <div className="text-xs text-muted-foreground shrink-0 ml-2">{round.date ? format(new Date(round.date.replace(/-/g, '/')), 'MMM d, yyyy') : ''}</div>
        </button>
      ))}</div>}
  </CardContent></Card>;
}
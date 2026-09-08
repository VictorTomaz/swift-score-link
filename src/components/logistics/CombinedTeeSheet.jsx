import React, { useMemo } from 'react';
import { useTournamentSeries } from '@/hooks/useTournamentSeries';
import { buildCombinedSheet } from '@/components/logistics/combinedTeeSheetHelpers';
import CombinedTeeSheetRows from '@/components/logistics/CombinedTeeSheetRows';
import CombinedTeeSheetActions from '@/components/logistics/CombinedTeeSheetActions';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw, CalendarClock } from 'lucide-react';

export default function CombinedTeeSheet({ round, players, email, beforeExport, hasChanges }) {
  const anchor = round.parent_round_id || round.id;
  const { data = [], isLoading, isFetching, isError, refetch } = useTournamentSeries(anchor);
  const rounds = useMemo(() => {
    const series = data.filter(r => (r.parent_round_id || r.id) === anchor);
    return [...series.filter(r => r.id !== round.id), { ...round, players }].sort((a,b) => (a.date || '').localeCompare(b.date || '') || (a.flight_number || 1) - (b.flight_number || 1));
  }, [data, anchor, round, players]);
  const sheet = useMemo(() => buildCombinedSheet(rounds), [rounds]);
  if (isLoading) return <div className="flex justify-center gap-2 p-8 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" />Loading all flights…</div>;
  if (isError || !data.length) return <div className="rounded-lg border p-4 space-y-2"><p>Unable to load tournament flights.</p><Button onClick={() => refetch()}>Retry</Button></div>;
  return <section className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold"><CalendarClock className="h-4 w-4" />Combined Tee Sheet</h2>
      <div className="flex flex-wrap gap-2">
        <Button size="icon" onClick={() => refetch()} disabled={isFetching} aria-label="Refresh combined tee sheet"><RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} /></Button>
        <CombinedTeeSheetActions rounds={rounds} sheet={sheet} email={email} beforeExport={beforeExport} disabled={isFetching} />
      </div>
    </div>
    <p className="text-xs text-muted-foreground">All flights, ordered by date and tee time. Switch to Per-flight to change assignments.{hasChanges ? ' Current-flight edits are included below and saved before printing.' : ''} Email Players selects recipients across all flights and opens a draft with their addresses in BCC.</p>
    <CombinedTeeSheetRows sheet={sheet} />
  </section>;
}
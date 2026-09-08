import React, { useMemo } from 'react';
import { useTournamentSeries } from '@/hooks/useTournamentSeries';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import TeeSheetEmailDialog from '@/components/logistics/TeeSheetEmailDialog';
import { buildCombinedSheet } from '@/components/logistics/combinedTeeSheetHelpers';
import teeSheetEmailBody from '@/components/logistics/teeSheetEmailBody';

export default function SendTeeSheetModal({ isOpen, onClose, round, players, assignments }) {
  const allFlights = round?.is_multi_flight || round?.series_type === 'multi_flight';
  const series = useTournamentSeries(isOpen && allFlights ? (round?.parent_round_id || round?.id) : null);
  const rounds = useMemo(() => {
    if (!round) return [];
    const current = { ...round, players: (players || []).map(p => ({ ...p, tee_time: assignments[p.player_id] || null })) };
    const anchor = round.parent_round_id || round.id;
    return [...(allFlights ? (series.data || []).filter(r => r.id !== round.id && (r.parent_round_id || r.id) === anchor) : []), current];
  }, [round, players, assignments, allFlights, series.data]);
  if (!isOpen || !round) return null;
  if (allFlights && (series.isFetching || series.isError || !series.data?.length)) return (
    <Dialog open={isOpen} onOpenChange={value => { if (!value) onClose(); }}>
      <DialogContent><DialogHeader><DialogTitle>Email tournament tee sheet</DialogTitle></DialogHeader>
        {series.isFetching ? <p role="status">Loading players from all flights…</p> : <div role="alert"><p>Unable to load all tournament flights.</p><Button onClick={() => series.refetch()}>Retry</Button></div>}
      </DialogContent>
    </Dialog>
  );
  const sheet = buildCombinedSheet(rounds);
  const title = `${allFlights ? 'Combined Tee Sheet' : 'Tee Sheet'} - ${round.event_name}`;
  return <TeeSheetEmailDialog open={isOpen} onOpenChange={value => { if (!value) onClose(); }} rounds={rounds} title={title} body={teeSheetEmailBody(rounds, sheet, title)} />;
}
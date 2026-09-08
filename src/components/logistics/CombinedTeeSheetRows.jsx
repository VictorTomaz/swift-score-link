import React from 'react';
import { flightStyles, sheetDate } from '@/components/logistics/combinedTeeSheetHelpers';

export default function CombinedTeeSheetRows({ sheet }) {
  return <div className="space-y-3">
    <div className="flex flex-wrap gap-2">{sheet.flights.map(f => <span key={f.number} className={`rounded-md border px-2 py-1 text-xs font-semibold ${flightStyles[f.color]}`}>{f.label}</span>)}</div>
    {sheet.rows.length === 0 && <p className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">No tee times assigned across these flights yet. Switch to Per-flight to assign them.</p>}
    {sheet.rows.map((row, i) => <React.Fragment key={row.key}>
      {(i === 0 || row.date !== sheet.rows[i-1].date) && <h3 className="pt-3 text-sm font-semibold">{sheetDate(row.date)}</h3>}
      <div className="flex gap-3 rounded-lg border bg-card p-3">
        <div className="w-16 shrink-0"><p className="font-bold tabular-nums">{row.time}</p><p className="text-xs text-muted-foreground">{row.players.length} players</p></div>
        <div className="min-w-0 flex-1 space-y-2">
          <span className={`inline-block max-w-full rounded-md border px-2 py-1 text-xs font-semibold break-words ${flightStyles[row.color]}`}>{row.label}</span>
          {row.course && <p className="text-xs text-muted-foreground">{row.course}</p>}
          <div className="flex flex-wrap gap-1.5">{row.players.map((p, pi) => <span key={`${p.player_id}-${pi}`} className="rounded-md bg-muted px-2.5 py-1.5 text-sm font-medium">{p.name}</span>)}</div>
        </div>
      </div>
    </React.Fragment>)}
    {sheet.unassigned > 0 && <p className="text-sm text-muted-foreground">{sheet.unassigned} player entries still need tee times and are not listed above.</p>}
  </div>;
}
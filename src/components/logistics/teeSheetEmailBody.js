import { sheetDate } from '@/components/logistics/combinedTeeSheetHelpers';

export default function teeSheetEmailBody(rounds, sheet, title) {
  const showFlights = sheet.flights.length > 1;
  const lines = sheet.rows.map(row => `${sheetDate(row.date)} | ${row.time}${showFlights ? ` | ${row.label}` : ''}${row.course ? ` | ${row.course}` : ''}\n${row.players.map(p => p.name).join(' / ')}`);
  for (const round of rounds) {
    const unassigned = (round.players || []).filter(p => !p.tee_time?.trim());
    if (!unassigned.length) continue;
    const flight = sheet.flights.find(f => f.number === (round.flight_number || 1));
    lines.push(`${sheetDate(round.date)}${showFlights ? ` | ${flight?.label || 'Flight'}` : ''} | Tee time not assigned\n${unassigned.map(p => p.name).join(' / ')}`);
  }
  return [title, ...lines].join('\r\n\r\n');
}
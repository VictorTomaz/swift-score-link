export const flightStyles = [
  'bg-chart-1/10 text-chart-1 border-chart-1/25',
  'bg-chart-3/10 text-chart-3 border-chart-3/25',
  'bg-chart-5/10 text-chart-5 border-chart-5/25',
  'bg-chart-2/10 text-chart-2 border-chart-2/25',
  'bg-chart-4/10 text-chart-4 border-chart-4/25',
];
export function buildCombinedSheet(rounds) {
  const flights = [...new Set(rounds.map(r => r.flight_number || 1))].sort((a, b) => a - b);
  const labels = Object.fromEntries(flights.map(n => [n, rounds.find(r => (r.flight_number || 1) === n && r.flight_name)?.flight_name || `Flight ${n}`]));
  const rows = rounds.flatMap(round => {
    const groups = new Map();
    (round.players || []).forEach(p => {
      const time = (p.tee_time || '').trim();
      if (!time) return;
      if (!groups.has(time)) groups.set(time, []);
      groups.get(time).push(p);
    });
    const flight = round.flight_number || 1;
    return [...groups].map(([time, players]) => ({ key: `${round.id}-${time}`, roundId: round.id, date: round.date || '', course: round.course_name || '', time, players, flight, label: labels[flight], color: flights.indexOf(flight) % flightStyles.length }));
  }).sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time) || a.flight - b.flight || a.roundId.localeCompare(b.roundId));
  return { rows, flights: flights.map(n => ({ number: n, label: labels[n], color: flights.indexOf(n) % flightStyles.length })), unassigned: rounds.reduce((sum, r) => sum + (r.players || []).filter(p => !p.tee_time?.trim()).length, 0) };
}
export const sheetDate = date => date ? new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : 'Date not set';
export function drawCombinedSheet(pdf, rounds) {
  const colors = [[39,104,69], [46,138,184], [128,64,191], [231,176,35], [215,66,116]];
  const flights = [...new Set(rounds.map(r => r.flight_number || 1))].sort((a,b) => a-b);
  const labels = Object.fromEntries(flights.map(n => [n, rounds.find(r => (r.flight_number || 1) === n && r.flight_name)?.flight_name || `Flight ${n}`]));
  const rows = rounds.flatMap(round => {
    const groups = new Map();
    (round.players || []).forEach(p => {
      const time = (p.tee_time || '').trim();
      if (!time) return;
      if (!groups.has(time)) groups.set(time, []);
      groups.get(time).push(p.name || 'Unnamed player');
    });
    return [...groups].map(([time, names]) => ({ date: round.date || '', course: round.course_name || '', time, names, flight: round.flight_number || 1, roundId: round.id }));
  }).sort((a,b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time) || a.flight-b.flight || a.roundId.localeCompare(b.roundId));
  let y = 0;
  const header = () => {
    pdf.setFillColor(20,83,45); pdf.rect(0,0,8.5,0.85,'F');
    pdf.setTextColor(255,255,255); pdf.setFont('helvetica','bold'); pdf.setFontSize(20);
    pdf.text('Combined Tee Sheet',0.5,0.48);
    pdf.setFontSize(11); pdf.setTextColor(50,50,50);
    const title = pdf.splitTextToSize(rounds[0].event_name || 'Tournament', 7.5);
    pdf.text(title,0.5,1.12); y = 1.2 + title.length * 0.16;
  };
  const dateHeader = date => {
    pdf.setFont('helvetica','bold'); pdf.setFontSize(11); pdf.setTextColor(50,50,50);
    const label = date ? new Date(`${date}T12:00:00`).toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'}) : 'Date not set';
    pdf.text(label,0.5,y+0.18); y += 0.34;
  };
  header();
  let currentDate = null;
  rows.forEach(row => {
    const color = colors[flights.indexOf(row.flight) % colors.length];
    pdf.setFontSize(10); pdf.setFont('helvetica','bold');
    const flightLines = pdf.splitTextToSize(`${labels[row.flight]}${row.course ? ` | ${row.course}` : ''}`, 6.0);
    pdf.setFont('helvetica','normal'); pdf.setFontSize(11);
    const nameLines = pdf.splitTextToSize(row.names.join(' / '),6.0);
    // Split unusually large groups into continued rows so nothing crosses the footer.
    for (let offset = 0; offset < nameLines.length; offset += 30) {
      const chunk = nameLines.slice(offset, offset + 30);
      const height = 0.25 + flightLines.length * 0.16 + chunk.length * 0.18;
      if (y + height + (currentDate !== row.date ? 0.34 : 0) > 10.4) { pdf.addPage(); header(); currentDate = null; }
      if (currentDate !== row.date) { dateHeader(row.date); currentDate = row.date; }
      pdf.setFillColor(...color.map(c => Math.round(c*0.08+255*0.92))); pdf.rect(0.5,y,7.5,height,'F');
      pdf.setFillColor(...color); pdf.rect(0.5,y,0.045,height,'F');
      pdf.setTextColor(30,30,30); pdf.setFont('helvetica','bold'); pdf.setFontSize(12); pdf.text(row.time,0.64,y+0.25);
      pdf.setTextColor(...color); pdf.setFontSize(10); pdf.text(flightLines,1.65,y+0.2);
      pdf.setTextColor(30,30,30); pdf.setFont('helvetica','normal'); pdf.setFontSize(11);
      pdf.text(chunk,1.65,y+0.24+flightLines.length*0.16); y += height+0.08;
    }
  });
  const unassigned = rounds.reduce((sum,r) => sum+(r.players || []).filter(p => !p.tee_time?.trim()).length,0);
  if (unassigned || !rows.length) {
    if (y > 10) { pdf.addPage(); header(); }
    pdf.setFontSize(10); pdf.setTextColor(80,80,80);
    pdf.text(`${unassigned} player entries without tee times.${!rows.length ? ' No tee times assigned.' : ''}`,0.5,y+0.2);
  }
  const total = pdf.getNumberOfPages();
  for (let i=1;i<=total;i++) { pdf.setPage(i); pdf.setFontSize(8); pdf.setTextColor(150,150,150); pdf.text('Swift Score Golf',0.5,10.8); pdf.text(`Page ${i} of ${total}`,7.1,10.8); }
}
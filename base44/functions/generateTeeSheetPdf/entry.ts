import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { jsPDF } from 'npm:jspdf@4.0.0';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { roundId } = await req.json();
    if (!roundId) return Response.json({ error: 'roundId required' }, { status: 400 });

    const round = await base44.entities.Round.get(roundId);
    if (!round) return Response.json({ error: 'Round not found' }, { status: 404 });

    const players = round.players || [];
    // Group players by their assigned tee_time to match the UI exactly
    const teeTimeGroups = {};
    for (const p of players) {
      const teeTime = (p.tee_time || '').trim();
      if (teeTime) {
        if (!teeTimeGroups[teeTime]) teeTimeGroups[teeTime] = [];
        teeTimeGroups[teeTime].push(p.name);
      }
    }
    
    const sortedTimes = Object.keys(teeTimeGroups).sort();

    const dateStr = round.date
      ? new Date(round.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
      : '';

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'in', format: 'letter' });
    const pageW = 8.5;
    const margin = 0.5;

    // Header bar
    pdf.setFillColor(20, 83, 45);
    pdf.rect(0, 0, pageW, 1.0, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(20);
    pdf.text('Tee Sheet', margin, 0.5);

    // Meta
    pdf.setTextColor(80, 80, 80);
    pdf.setFontSize(11);
    let metaY = 1.3;
    if (round.course_name) {
      pdf.text(`Course: ${round.course_name}`, margin, metaY);
      metaY += 0.25;
    }
    if (dateStr) {
      pdf.text(`Date: ${dateStr}`, margin, metaY);
      metaY += 0.25;
    }
    pdf.text(`Players: ${players.length}`, margin, metaY);

    // Table
    const tableY = metaY + 0.35;
    const colW = pageW - margin * 2;
    const timeColW = 1.2;

    // Header row
    pdf.setFillColor(20, 83, 45);
    pdf.rect(margin, tableY, colW, 0.3, 'F');
    pdf.setTextColor(167, 243, 208);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.text('Tee Time', margin + 0.1, tableY + 0.2);
    pdf.text('Players', margin + timeColW + 0.1, tableY + 0.2);

    let y = tableY + 0.3;
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(26, 26, 26);

    const rowH = 0.35;
    sortedTimes.forEach((time, idx) => {
      if (y > 10.5) {
        pdf.addPage();
        y = margin;
      }
      if (idx % 2 === 0) {
        pdf.setFillColor(245, 250, 245);
        pdf.rect(margin, y, colW, rowH, 'F');
      }
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(12);
      pdf.text(time, margin + 0.1, y + 0.22);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(14);
      const names = teeTimeGroups[time].join(' / ');
      const maxW = colW - timeColW - 0.2;
      const lines = pdf.splitTextToSize(names, maxW);
      pdf.text(lines, margin + timeColW + 0.1, y + 0.22);
      y += rowH * Math.max(1, lines.length);
    });

    // Footer
    const totalPages = pdf.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      pdf.setPage(i);
      pdf.setFontSize(8);
      pdf.setTextColor(150, 150, 150);
      pdf.text('Swift Score Golf', margin, 10.8);
      pdf.text(`Page ${i} of ${totalPages}`, pageW - margin - 0.8, 10.8);
    }

    const pdfArrayBuffer = pdf.output('arraybuffer');
    const pdfBlob = new Blob([pdfArrayBuffer], { type: 'application/pdf' });
    const file = new File([pdfBlob], `tee-sheet-${round.event_name || 'golf'}.pdf`, { type: 'application/pdf' });
    const { file_url } = await base44.asServiceRole.integrations.Core.UploadFile({ file });
    return Response.json({
      url: file_url,
      filename: `tee-sheet-${round.event_name || 'golf'}.pdf`
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
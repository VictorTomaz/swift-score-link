// BACKUP COPY - FOR REFERENCE ONLY
// This is a backup of the working scorecard PDF generator as of 2026-06-30
// Original: base44/functions/generateScorecardPdf/entry.ts
// DO NOT DEPLOY THIS FILE - it's for reference/rollback only
//
// Version: 2026-06-30
// Status: Working - correct column width calculations

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

    const allPlayers = round.players || [];
    
    // Fetch logo once at the start
    let logoBytes = null;
    try {
      const logoUrl = 'https://media.base44.com/images/public/69bb019558d96a11fbfbddce/189d00ac3_IMG_6860.jpg';
      const logoResponse = await fetch(logoUrl);
      const logoArrayBuffer = await logoResponse.arrayBuffer();
      logoBytes = new Uint8Array(logoArrayBuffer);
    } catch (e) {
      console.error('Failed to fetch logo:', e);
    }
    
    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'in',
      format: 'letter',
      hotfixes: ['px_scaling'],
    });

    const pageWidth = 11;
    const pageHeight = 8.5;
    const margin = 0.25;
    
    // Column widths matching blank scorecard layout (proven to work correctly)
    const colWidths = {
      name: 1.80,     // Player name column
      hole: 0.32,     // Each hole column (1-9, 10-18)
      out: 0.45,      // OUT column
      init: 0.50,     // INIT column
      in: 0.45,       // IN column
      tot: 0.45,      // TOT column
      hcp: 0.35,      // HCP column
      net: 0.35       // NET column
    };
    
    // Calculate exact card width from column widths (must match sum of all columns)
    const cardWidth = colWidths.name + 18 * colWidths.hole + colWidths.out + colWidths.init + colWidths.in + colWidths.tot + colWidths.hcp + colWidths.net;
    
    const rowHeights = {
      header: 0.22,   // Header rows
      player: 0.55    // Player rows
    };

    // Calculate card height
    const headerRows = 3;
    const playerRows = 4;
    const cardHeight = headerRows * rowHeights.header + playerRows * rowHeights.player;

    // Split players into foursomes
    const foursomes = [];
    for (let i = 0; i < allPlayers.length; i += 4) {
      foursomes.push(allPlayers.slice(i, i + 4));
    }
    if (foursomes.length === 0) {
      foursomes.push([]);
    }

    // Draw up to 2 scorecards per page (stacked vertically)
    let pageNum = 0;
    for (let i = 0; i < foursomes.length; i += 2) {
      if (pageNum > 0) {
        pdf.addPage('letter', 'landscape');
      }

      const topFoursome = foursomes[i];
      const bottomFoursome = foursomes[i + 1];

      // Scorecard starts below the header with more top margin
      const topY = margin + 0.6;
      // Center the cut line vertically on the page (page height 8.5" / 2 = 4.25")
      const cutLineY = pageHeight / 2;
      // Move bottom scorecard further down towards the bottom of the page
      const bottomY = cutLineY + 0.80;

      // Draw top scorecard (includes its own header with tournament name + logo)
      await drawScorecard(pdf, round, topFoursome, margin, topY, cardWidth, cardHeight, colWidths, rowHeights, logoBytes, pageWidth);

      // Draw dashed cut line centered vertically on the page (invisible)
      if (bottomFoursome && bottomFoursome.length > 0) {
        pdf.setDrawColor(255, 255, 255); // White = invisible
        pdf.setLineWidth(0.001);
        pdf.setLineDashPattern([0.05, 0.05]);
        pdf.line(margin, cutLineY, margin + cardWidth, cutLineY);
        pdf.setLineDashPattern([]);
        pdf.setDrawColor(0); // Restore for next operations
        pdf.setLineWidth(0.01);

        // Draw bottom scorecard (includes its own header with tournament name + logo)
        await drawScorecard(pdf, round, bottomFoursome, margin, bottomY, cardWidth, cardHeight, colWidths, rowHeights, logoBytes, pageWidth);
      }

      pageNum++;
    }

    const pdfArrayBuffer = pdf.output('arraybuffer');
    const pdfBlob = new Blob([pdfArrayBuffer], { type: 'application/pdf' });
    const file = new File([pdfBlob], `scorecards-${round.event_name || 'golf'}.pdf`, { type: 'application/pdf' });
    const { file_url } = await base44.asServiceRole.integrations.Core.UploadFile({ file });
    
    return Response.json({
      url: `${file_url}?t=${Date.now()}`,
      filename: `scorecards-${round.event_name || 'golf'}.pdf`
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

async function drawScorecard(pdf, round, players, startX, startY, cardWidth, cardHeight, colWidths, rowHeights, logoBytes, pageWidth) {
  const par = round.par || [];
  const hcpIndexes = round.hole_handicap_indexes || [];
  const displayPlayers = players.length > 0 ? players.slice(0, 4) : Array(4).fill(null);
  
  const totalPar = par.length === 18 ? par.reduce((a, b) => a + b, 0) : 0;
  const frontPar = par.slice(0, 9).reduce((a, b) => a + b, 0);
  const backPar = par.slice(9, 18).reduce((a, b) => a + b, 0);

  const dateStr = round.date
    ? new Date(round.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '';

  // Single column map: Name | 1-9 | OUT | INIT | 10-18 | IN | TOT | HCP | NET
  const columnDefs = [
    { key: 'name', label: '', width: colWidths.name },
    { key: 'h1', label: '1', width: colWidths.hole },
    { key: 'h2', label: '2', width: colWidths.hole },
    { key: 'h3', label: '3', width: colWidths.hole },
    { key: 'h4', label: '4', width: colWidths.hole },
    { key: 'h5', label: '5', width: colWidths.hole },
    { key: 'h6', label: '6', width: colWidths.hole },
    { key: 'h7', label: '7', width: colWidths.hole },
    { key: 'h8', label: '8', width: colWidths.hole },
    { key: 'h9', label: '9', width: colWidths.hole },
    { key: 'out', label: 'OUT', width: colWidths.out },
    { key: 'init', label: 'INIT', width: colWidths.init },
    { key: 'h10', label: '10', width: colWidths.hole },
    { key: 'h11', label: '11', width: colWidths.hole },
    { key: 'h12', label: '12', width: colWidths.hole },
    { key: 'h13', label: '13', width: colWidths.hole },
    { key: 'h14', label: '14', width: colWidths.hole },
    { key: 'h15', label: '15', width: colWidths.hole },
    { key: 'h16', label: '16', width: colWidths.hole },
    { key: 'h17', label: '17', width: colWidths.hole },
    { key: 'h18', label: '18', width: colWidths.hole },
    { key: 'in', label: 'IN', width: colWidths.in },
    { key: 'tot', label: 'TOT', width: colWidths.tot },
    { key: 'hcp', label: 'HCP', width: colWidths.hcp },
    { key: 'net', label: 'NET', width: colWidths.net }
  ];

  // Pre-calculate all column X positions from the single column map
  const colXPositions = [];
  let currentX = startX;
  for (const col of columnDefs) {
    colXPositions.push(currentX);
    currentX += col.width;
  }
  


  const getX = (key) => {
    const index = columnDefs.findIndex(c => c.key === key);
    return index >= 0 ? colXPositions[index] : startX;
  };
  const getWidth = (key) => {
    const col = columnDefs.find(c => c.key === key);
    return col ? col.width : 0;
  };

  let currentY = startY;

  // Header area above the scorecard grid: centered tournament name + logo on right
  const headerTextY = currentY - 0.35;
  pdf.setFontSize(17);
  pdf.setFont('helvetica', 'bold');
  pdf.text(round.event_name || 'Golf Round', pageWidth / 2, headerTextY + 0.15, { align: 'center' });
  
  // Draw logo at top right, outside the scorecard grid but visible on the page
  if (logoBytes) {
    const logoSize = 0.5;
    const logoX = pageWidth - startX - logoSize - 0.15;
    const logoY = headerTextY - 0.10;
    try {
      pdf.addImage(logoBytes, 'JPEG', logoX, logoY, logoSize, logoSize);
    } catch (e) {
      console.error('Failed to embed logo:', e);
    }
  }

  pdf.setFontSize(7);
  pdf.setDrawColor(0);
  pdf.setLineWidth(0.01);

  // No outer border - individual cell borders only (matches blank scorecard pattern)

  // === ROW 1: Hole header ===
  const holeHeaderRow = [
    { key: 'name', text: 'Hole', bg: [255, 255, 255], fg: [0, 0, 0], bold: true },
    { key: 'h1', text: '1', bg: [230, 230, 230], fg: [0, 0, 0], bold: false },
    { key: 'h2', text: '2', bg: [230, 230, 230], fg: [0, 0, 0], bold: false },
    { key: 'h3', text: '3', bg: [230, 230, 230], fg: [0, 0, 0], bold: false },
    { key: 'h4', text: '4', bg: [230, 230, 230], fg: [0, 0, 0], bold: false },
    { key: 'h5', text: '5', bg: [230, 230, 230], fg: [0, 0, 0], bold: false },
    { key: 'h6', text: '6', bg: [230, 230, 230], fg: [0, 0, 0], bold: false },
    { key: 'h7', text: '7', bg: [230, 230, 230], fg: [0, 0, 0], bold: false },
    { key: 'h8', text: '8', bg: [230, 230, 230], fg: [0, 0, 0], bold: false },
    { key: 'h9', text: '9', bg: [230, 230, 230], fg: [0, 0, 0], bold: false },
    { key: 'out', text: 'OUT', bg: [0, 0, 0], fg: [255, 255, 255], bold: false },
    { key: 'init', text: 'INIT', bg: [0, 0, 0], fg: [255, 255, 255], bold: false },
    { key: 'h10', text: '10', bg: [230, 230, 230], fg: [0, 0, 0], bold: false },
    { key: 'h11', text: '11', bg: [230, 230, 230], fg: [0, 0, 0], bold: false },
    { key: 'h12', text: '12', bg: [230, 230, 230], fg: [0, 0, 0], bold: false },
    { key: 'h13', text: '13', bg: [230, 230, 230], fg: [0, 0, 0], bold: false },
    { key: 'h14', text: '14', bg: [230, 230, 230], fg: [0, 0, 0], bold: false },
    { key: 'h15', text: '15', bg: [230, 230, 230], fg: [0, 0, 0], bold: false },
    { key: 'h16', text: '16', bg: [230, 230, 230], fg: [0, 0, 0], bold: false },
    { key: 'h17', text: '17', bg: [230, 230, 230], fg: [0, 0, 0], bold: false },
    { key: 'h18', text: '18', bg: [230, 230, 230], fg: [0, 0, 0], bold: false },
    { key: 'in', text: 'IN', bg: [0, 0, 0], fg: [255, 255, 255], bold: false },
    { key: 'tot', text: 'TOT', bg: [230, 230, 230], fg: [0, 0, 0], bold: false },
    { key: 'hcp', text: 'HCP', bg: [0, 0, 0], fg: [255, 255, 255], bold: false },
    { key: 'net', text: 'NET', bg: [0, 0, 0], fg: [255, 255, 255], bold: false }
  ];

  for (const cell of holeHeaderRow) {
    const x = getX(cell.key);
    const w = getWidth(cell.key);
    pdf.setFillColor(...cell.bg);
    pdf.rect(x, currentY, w, rowHeights.header, 'F');
    pdf.setFont('helvetica', cell.bold ? 'bold' : 'normal');
    pdf.setTextColor(...cell.fg);
    pdf.text(cell.text, x + w / 2, currentY + rowHeights.header / 2 + 0.02, { align: 'center' });
  }

  currentY += rowHeights.header;

  // === ROW 2: Par ===
  pdf.setTextColor(0, 0, 0);
  const parRow = [
    { key: 'name', text: 'Par', bg: [255, 255, 255], bold: true },
    { key: 'h1', text: String(par[0] ?? '') },
    { key: 'h2', text: String(par[1] ?? '') },
    { key: 'h3', text: String(par[2] ?? '') },
    { key: 'h4', text: String(par[3] ?? '') },
    { key: 'h5', text: String(par[4] ?? '') },
    { key: 'h6', text: String(par[5] ?? '') },
    { key: 'h7', text: String(par[6] ?? '') },
    { key: 'h8', text: String(par[7] ?? '') },
    { key: 'h9', text: String(par[8] ?? '') },
    { key: 'out', text: String(frontPar ?? '') },
    { key: 'init', text: '' },
    { key: 'h10', text: String(par[9] ?? '') },
    { key: 'h11', text: String(par[10] ?? '') },
    { key: 'h12', text: String(par[11] ?? '') },
    { key: 'h13', text: String(par[12] ?? '') },
    { key: 'h14', text: String(par[13] ?? '') },
    { key: 'h15', text: String(par[14] ?? '') },
    { key: 'h16', text: String(par[15] ?? '') },
    { key: 'h17', text: String(par[16] ?? '') },
    { key: 'h18', text: String(par[17] ?? '') },
    { key: 'in', text: String(backPar ?? '') },
    { key: 'tot', text: String(totalPar ?? '') },
    { key: 'hcp', text: '' },
    { key: 'net', text: '' }
  ];

  for (const cell of parRow) {
    const x = getX(cell.key);
    const w = getWidth(cell.key);
    pdf.setFillColor(255, 255, 255);
    pdf.rect(x, currentY, w, rowHeights.header, 'F');
    pdf.setFont('helvetica', cell.bold ? 'bold' : 'normal');
    pdf.text(cell.text, x + w / 2, currentY + rowHeights.header / 2 + 0.02, { align: 'center' });
  }

  currentY += rowHeights.header;

  // === ROW 3: HCP (Handicap Index) ===
  pdf.setTextColor(0, 0, 0);
  const hcpIndexRow = [
    { key: 'name', text: 'HCP', bg: [255, 255, 255], bold: true },
    { key: 'h1', text: String(hcpIndexes[0] ?? '') },
    { key: 'h2', text: String(hcpIndexes[1] ?? '') },
    { key: 'h3', text: String(hcpIndexes[2] ?? '') },
    { key: 'h4', text: String(hcpIndexes[3] ?? '') },
    { key: 'h5', text: String(hcpIndexes[4] ?? '') },
    { key: 'h6', text: String(hcpIndexes[5] ?? '') },
    { key: 'h7', text: String(hcpIndexes[6] ?? '') },
    { key: 'h8', text: String(hcpIndexes[7] ?? '') },
    { key: 'h9', text: String(hcpIndexes[8] ?? '') },
    { key: 'out', text: '' },
    { key: 'init', text: '' },
    { key: 'h10', text: String(hcpIndexes[9] ?? '') },
    { key: 'h11', text: String(hcpIndexes[10] ?? '') },
    { key: 'h12', text: String(hcpIndexes[11] ?? '') },
    { key: 'h13', text: String(hcpIndexes[12] ?? '') },
    { key: 'h14', text: String(hcpIndexes[13] ?? '') },
    { key: 'h15', text: String(hcpIndexes[14] ?? '') },
    { key: 'h16', text: String(hcpIndexes[15] ?? '') },
    { key: 'h17', text: String(hcpIndexes[16] ?? '') },
    { key: 'h18', text: String(hcpIndexes[17] ?? '') },
    { key: 'in', text: '' },
    { key: 'tot', text: '' },
    { key: 'hcp', text: '' },
    { key: 'net', text: '' }
  ];

  for (const cell of hcpIndexRow) {
    const x = getX(cell.key);
    const w = getWidth(cell.key);
    pdf.setFillColor(255, 255, 255);
    pdf.rect(x, currentY, w, rowHeights.header, 'F');
    pdf.setFont('helvetica', cell.bold ? 'bold' : 'normal');
    pdf.text(cell.text, x + w / 2, currentY + rowHeights.header / 2 + 0.02, { align: 'center' });
  }

  currentY += rowHeights.header;

  // === Player rows ===
  pdf.setTextColor(0, 0, 0);
  displayPlayers.forEach((player) => {
    const playerName = player ? (player.name || '') : '';
    const ch = player?.course_handicap;
    const hcpDisplay = player?.is_plus_handicap && ch != null ? `+${Math.abs(ch)}` : (ch != null ? String(ch) : '');
    const scores = player?.scores || [];
    const totalScore = scores.filter(s => s != null && s !== '').reduce((sum, s) => sum + Number(s), 0);
    const initials = playerName ? playerName.trim().split(/\s+/).map(n => n[0]).join('').toUpperCase().substring(0, 2) : '';

    const playerRow = [
      { key: 'name', text: playerName, align: 'left', nameOnly: true },
      { key: 'h1', score: 0, hasDot: true },
      { key: 'h2', score: 1, hasDot: true },
      { key: 'h3', score: 2, hasDot: true },
      { key: 'h4', score: 3, hasDot: true },
      { key: 'h5', score: 4, hasDot: true },
      { key: 'h6', score: 5, hasDot: true },
      { key: 'h7', score: 6, hasDot: true },
      { key: 'h8', score: 7, hasDot: true },
      { key: 'h9', score: 8, hasDot: true },
      { key: 'out', hasDot: true },
      { key: 'init', initials: initials, bg: [240, 240, 240] },
      { key: 'h10', score: 9, hasDot: true },
      { key: 'h11', score: 10, hasDot: true },
      { key: 'h12', score: 11, hasDot: true },
      { key: 'h13', score: 12, hasDot: true },
      { key: 'h14', score: 13, hasDot: true },
      { key: 'h15', score: 14, hasDot: true },
      { key: 'h16', score: 15, hasDot: true },
      { key: 'h17', score: 16, hasDot: true },
      { key: 'h18', score: 17, hasDot: true },
      { key: 'in', hasDot: true },
      { key: 'tot', text: totalScore > 0 ? String(totalScore) : '', bold: true },
      { key: 'hcp', text: hcpDisplay, bold: true, hcpAlign: true },
      { key: 'net', hasDot: true }
    ];

    pdf.setFontSize(11);
    pdf.setFont('helvetica', 'bold');

    for (const cell of playerRow) {
      const x = getX(cell.key);
      const w = getWidth(cell.key);
      
      if (cell.nameOnly) {
        pdf.rect(x, currentY, w, rowHeights.player);
        pdf.setFontSize(12);
        pdf.setFont('helvetica', 'bold');
        pdf.text(cell.text, x + 0.04, currentY + rowHeights.player / 2 + 0.05, { align: 'left' });
        pdf.setFontSize(11);
        pdf.setFont('helvetica', 'bold');
      } else if (cell.initials !== undefined) {
        if (cell.bg) pdf.setFillColor(...cell.bg);
        pdf.rect(x, currentY, w, rowHeights.player, 'F');
        pdf.setFillColor(255, 255, 255);
        if (cell.initials) {
          pdf.setFontSize(10);
          pdf.setFont('helvetica', 'bold');
          pdf.text(cell.initials, x + w / 2, currentY + rowHeights.player / 2 + 0.04, { align: 'center' });
          pdf.setFontSize(11);
          pdf.setFont('helvetica', 'bold');
        }
      } else if (cell.hasDot) {
        pdf.rect(x, currentY, w, rowHeights.player);
        // Four corner dots for OCR alignment (invisible)
        pdf.setFillColor(255, 255, 255); // White = invisible
        pdf.circle(x + 0.035, currentY + 0.035, 0.015, 'F');
        pdf.circle(x + w - 0.035, currentY + 0.035, 0.015, 'F');
        pdf.circle(x + 0.035, currentY + rowHeights.player - 0.035, 0.015, 'F');
        pdf.circle(x + w - 0.035, currentY + rowHeights.player - 0.035, 0.015, 'F');
        pdf.setFillColor(255, 255, 255);
      } else if (cell.hcpAlign) {
        // HCP column - draw full rectangle
        pdf.rect(x, currentY, w, rowHeights.player);
        if (cell.text) {
          pdf.setTextColor(0, 0, 0);
          pdf.setFontSize(9);
          pdf.setFont('helvetica', 'bold');
          const padding = 0.14;
          const drawX = x + padding;
          pdf.text(cell.text, drawX, currentY + rowHeights.player / 2 + 0.03);
          pdf.setFontSize(11);
          pdf.setFont('helvetica', 'bold');
        }
      } else {
        pdf.rect(x, currentY, w, rowHeights.player);
        if (cell.text) {
          pdf.setFont('helvetica', cell.bold ? 'bold' : 'normal');
          pdf.text(cell.text, x + w / 2, currentY + rowHeights.player / 2 + 0.04, { align: 'center' });
        }
      }
    }

    currentY += rowHeights.player;
  });

  // Pad with empty player rows to fill 4 slots
  const emptyRows = 4 - displayPlayers.length;
  for (let ei = 0; ei < emptyRows; ei++) {
    for (let ci = 0; ci < columnDefs.length; ci++) {
      const key = columnDefs[ci].key;
      const x = getX(key);
      const w = getWidth(key);
      const isInit = key === 'init';
      const isDotCell = ['h1','h2','h3','h4','h5','h6','h7','h8','h9','h10','h11','h12','h13','h14','h15','h16','h17','h18','out','in','net'].includes(key);
      
      if (isDotCell) {
        pdf.rect(x, currentY, w, rowHeights.player);
        // Four corner dots for OCR alignment (invisible)
        pdf.setFillColor(255, 255, 255); // White = invisible
        pdf.circle(x + 0.035, currentY + 0.035, 0.015, 'F');
        pdf.circle(x + w - 0.035, currentY + 0.035, 0.015, 'F');
        pdf.circle(x + 0.035, currentY + rowHeights.player - 0.035, 0.015, 'F');
        pdf.circle(x + w - 0.035, currentY + rowHeights.player - 0.035, 0.015, 'F');
        pdf.setFillColor(255, 255, 255);
      } else if (isInit) {
        pdf.setFillColor(240, 240, 240);
        pdf.rect(x, currentY, w, rowHeights.player, 'F');
        pdf.setFillColor(255, 255, 255);
      } else {
        pdf.rect(x, currentY, w, rowHeights.player);
      }
    }
    currentY += rowHeights.player;
  }

  // Draw outer border rectangle around entire scorecard grid (clean perimeter)
  pdf.setLineWidth(0.015);
  pdf.rect(startX, startY, cardWidth, currentY - startY);
  pdf.setLineWidth(0.01);
}
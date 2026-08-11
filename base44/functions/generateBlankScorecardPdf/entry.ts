import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { jsPDF } from 'npm:jspdf@4.0.0';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { roundId, quantity = 3 } = await req.json();
    const numCards = Math.min(Math.max(1, quantity), 10);

    // Fetch round data for par/hcp if available
    let headerText = 'Swift Score Golf';
    let par = [];
    let hcpIndexes = [];
    let isTeamMode = false;
    let isScramble = false;
    let teamSize = 2;
    let players = [];

    // Blank scorecards intentionally omit the competition name (blank header)
    if (roundId) {
      try {
        const round = await base44.entities.Round.get(roundId);
        if (round) {
          headerText = '';
          par = round.par || [];
          hcpIndexes = round.hole_handicap_indexes || [];
          isTeamMode = round.team_mode === true;
          isScramble = isTeamMode && round.team_format === 'scramble';
          teamSize = round.team_size || 2;
          // Blank scorecards intentionally show NO player names — only par/HCP.
          players = [];
        }
      } catch (e) {
        console.error('Failed to fetch round:', e);
      }
    }

    // Default par/hcp if no round data
    if (par.length !== 18) {
      par = Array(18).fill(4);
      par[2] = 5; par[5] = 5; par[8] = 3; par[10] = 4; par[13] = 5; par[16] = 3; par[17] = 4;
    }
    if (hcpIndexes.length !== 18) {
      hcpIndexes = [11, 15, 3, 7, 1, 17, 13, 5, 9, 12, 16, 4, 8, 2, 18, 14, 6, 10];
    }

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

    // Column widths matching the reference scorecard layout (full 10.5" printable area)
    const colWidths = {
      name: 2.00,     // Player name column
      init: 0.50,     // INIT column (between name and holes)
      hole: 0.33,     // Each hole column (1-9, 10-18)
      out: 0.42,      // OUT column (grey background)
      in: 0.42,       // IN column (grey background)
      tot: 0.42,      // TOT column
      hcp: 0.40,      // HCP column
      net: 0.40       // NET column
    };

    const cardWidth = colWidths.name + colWidths.init + 18 * colWidths.hole + colWidths.out + colWidths.in + colWidths.tot + colWidths.hcp + colWidths.net;

    const rowHeights = {
      header: 0.22,
      player: 0.55
    };

    const headerRows = 3;
    const contentRows = isScramble ? 2 : (isTeamMode ? teamSize + 2 : 4);
    const cardHeight = headerRows * rowHeights.header + contentRows * rowHeights.player;
    const spacing = 0.25;

    let yPos = margin;

    for (let page = 0; page < Math.ceil(numCards / 2); page++) {
      if (page > 0) {
        pdf.addPage('letter', 'landscape');
        yPos = margin;
      }

      const cardsOnPage = Math.min(2, numCards - page * 2);

      for (let cardNum = 0; cardNum < cardsOnPage; cardNum++) {
        const startX = margin;
        const startY = yPos + cardNum * (cardHeight + 0.6 + spacing);

        await drawScorecard(
          pdf,
          startX,
          startY,
          cardWidth,
          cardHeight,
          colWidths,
          rowHeights,
          headerRows,
          contentRows,
          par,
          hcpIndexes,
          logoBytes,
          pageWidth,
          headerText,
          isTeamMode,
          isScramble,
          teamSize,
          players
        );
      }
    }

    const pdfArrayBuffer = pdf.output('arraybuffer');
    const pdfBlob = new Blob([pdfArrayBuffer], { type: 'application/pdf' });
    const file = new File([pdfBlob], `blank-scorecards-${Date.now()}.pdf`, { type: 'application/pdf' });
    const { file_url } = await base44.asServiceRole.integrations.Core.UploadFile({ file });

    return Response.json({
      url: `${file_url}?t=${Date.now()}`,
      filename: `blank-scorecards.pdf`
    });
  } catch (error) {
    console.error('Error generating blank scorecards:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

async function drawScorecard(pdf, startX, startY, cardWidth, cardHeight, colWidths, rowHeights, headerRows, contentRows, par, hcpIndexes, logoBytes, pageWidth, headerText, isTeamMode, isScramble, teamSize, players) {
  const totalPar = par.length === 18 ? par.reduce((a, b) => a + b, 0) : 0;
  const frontPar = par.slice(0, 9).reduce((a, b) => a + b, 0);
  const backPar = par.slice(9, 18).reduce((a, b) => a + b, 0);

  // Column map: Name | 1-9 | OUT | INIT | 10-18 | IN | TOT | HCP | NET
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

  // Header bar (dark green) matching the standard scorecard
  pdf.setFillColor(20, 83, 45);
  pdf.rect(startX, currentY - 0.35, cardWidth, 0.35, 'F');

  // Header text (centered)
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(17);
  pdf.setFont('helvetica', 'bold');
  if (headerText) {
    pdf.text(headerText, pageWidth / 2, currentY - 0.12, { align: 'center' });
  }

  // Logo at top right of header bar
  if (logoBytes) {
    const logoSize = 0.5;
    const logoX = startX + cardWidth - logoSize - 0.1;
    const logoY = currentY - 0.30;
    try {
      pdf.addImage(logoBytes, 'JPEG', logoX, logoY, logoSize, logoSize);
    } catch (e) {
      console.error('Failed to embed logo:', e);
    }
  }

  pdf.setFontSize(7);
  pdf.setDrawColor(0);
  pdf.setLineWidth(0.01);
  pdf.setTextColor(0, 0, 0);
  const tableTopY = currentY;

  // === ROW 1: Hole header ===
  const holeHeaderRow = [
    { key: 'name', text: 'Hole', bg: [255, 255, 255], fg: [0, 0, 0], bold: true },
    { key: 'h1', text: '1', bg: [255, 255, 255], fg: [0, 0, 0], bold: false },
    { key: 'h2', text: '2', bg: [255, 255, 255], fg: [0, 0, 0], bold: false },
    { key: 'h3', text: '3', bg: [255, 255, 255], fg: [0, 0, 0], bold: false },
    { key: 'h4', text: '4', bg: [255, 255, 255], fg: [0, 0, 0], bold: false },
    { key: 'h5', text: '5', bg: [255, 255, 255], fg: [0, 0, 0], bold: false },
    { key: 'h6', text: '6', bg: [255, 255, 255], fg: [0, 0, 0], bold: false },
    { key: 'h7', text: '7', bg: [255, 255, 255], fg: [0, 0, 0], bold: false },
    { key: 'h8', text: '8', bg: [255, 255, 255], fg: [0, 0, 0], bold: false },
    { key: 'h9', text: '9', bg: [255, 255, 255], fg: [0, 0, 0], bold: false },
    { key: 'out', text: 'OUT', bg: [240, 240, 240], fg: [0, 0, 0], bold: true },
    { key: 'init', text: 'INIT', bg: [240, 240, 240], fg: [0, 0, 0], bold: true },
    { key: 'h10', text: '10', bg: [255, 255, 255], fg: [0, 0, 0], bold: false },
    { key: 'h11', text: '11', bg: [255, 255, 255], fg: [0, 0, 0], bold: false },
    { key: 'h12', text: '12', bg: [255, 255, 255], fg: [0, 0, 0], bold: false },
    { key: 'h13', text: '13', bg: [255, 255, 255], fg: [0, 0, 0], bold: false },
    { key: 'h14', text: '14', bg: [255, 255, 255], fg: [0, 0, 0], bold: false },
    { key: 'h15', text: '15', bg: [255, 255, 255], fg: [0, 0, 0], bold: false },
    { key: 'h16', text: '16', bg: [255, 255, 255], fg: [0, 0, 0], bold: false },
    { key: 'h17', text: '17', bg: [255, 255, 255], fg: [0, 0, 0], bold: false },
    { key: 'h18', text: '18', bg: [255, 255, 255], fg: [0, 0, 0], bold: false },
    { key: 'in', text: 'IN', bg: [240, 240, 240], fg: [0, 0, 0], bold: true },
    { key: 'tot', text: 'TOT', bg: [255, 255, 255], fg: [0, 0, 0], bold: true },
    { key: 'hcp', text: 'HCP', bg: [255, 255, 255], fg: [0, 0, 0], bold: true },
    { key: 'net', text: 'NET', bg: [255, 255, 255], fg: [0, 0, 0], bold: true }
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

  // === Content rows (team-mode-aware) ===
  pdf.setTextColor(0, 0, 0);
  if (isScramble) {
    // Scramble: team row (green) + individual score row (gray)
    const teamBg = [220, 244, 220];
    const teamLastNames = players.filter(p => p && p.name).map(p => p.name.trim().split(/\s+/).pop());
    pdf.setFillColor(...teamBg);
    pdf.rect(getX('name'), currentY, getWidth('name'), rowHeights.player, 'F');
    if (teamLastNames.length > 0) {
      pdf.setFontSize(8);
      pdf.setFont('helvetica', 'bold');
      pdf.text(teamLastNames, getX('name') + 0.04, currentY + 0.08, { align: 'left', lineHeightFactor: 1.15 });
    }
    for (let hole = 0; hole < 18; hole++) {
      const key = `h${hole + 1}`;
      pdf.setFillColor(...teamBg);
      pdf.rect(getX(key), currentY, getWidth(key), rowHeights.player, 'F');
    }
    for (const key of ['out', 'init', 'in', 'tot', 'hcp', 'net']) {
      pdf.setFillColor(...teamBg);
      pdf.rect(getX(key), currentY, getWidth(key), rowHeights.player, 'F');
    }
    currentY += rowHeights.player;
    const indBg = [245, 245, 245];
    pdf.setFillColor(...indBg);
    pdf.rect(getX('name'), currentY, getWidth('name'), rowHeights.player, 'F');
    pdf.setFontSize(7);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(150, 150, 150);
    pdf.text('Individual', getX('name') + 0.04, currentY + rowHeights.player / 2 + 0.02, { align: 'left' });
    for (let hole = 0; hole < 18; hole++) {
      const key = `h${hole + 1}`;
      pdf.setFillColor(...indBg);
      pdf.rect(getX(key), currentY, getWidth(key), rowHeights.player, 'F');
    }
    for (const key of ['out', 'init', 'in', 'tot', 'hcp', 'net']) {
      pdf.setFillColor(...indBg);
      pdf.rect(getX(key), currentY, getWidth(key), rowHeights.player, 'F');
    }
    pdf.setTextColor(0, 0, 0);
    currentY += rowHeights.player;
  } else if (isTeamMode) {
    // Best ball: player rows + Gross + Net
    for (let pi = 0; pi < teamSize; pi++) {
      const playerName = players[pi]?.name || '';
      for (let ci = 0; ci < columnDefs.length; ci++) {
        const key = columnDefs[ci].key;
        const x = getX(key);
        const w = getWidth(key);
        if (key === 'name') {
          pdf.setFillColor(255, 255, 255);
          pdf.rect(x, currentY, w, rowHeights.player, 'F');
          if (playerName) {
            pdf.setFontSize(11);
            pdf.setFont('helvetica', 'bold');
            pdf.text(playerName, x + 0.04, currentY + rowHeights.player / 2 + 0.05, { align: 'left' });
          }
        } else if (key === 'init') {
          pdf.setFillColor(240, 240, 240);
          pdf.rect(x, currentY, w, rowHeights.player, 'F');
        } else {
          pdf.setFillColor(255, 255, 255);
          pdf.rect(x, currentY, w, rowHeights.player, 'F');
        }
      }
      currentY += rowHeights.player;
    }
    const grossBg = [220, 244, 220];
    pdf.setFillColor(...grossBg);
    pdf.rect(getX('name'), currentY, getWidth('name'), rowHeights.player, 'F');
    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Gross', getX('name') + 0.04, currentY + rowHeights.player / 2 + 0.05, { align: 'left' });
    for (let hole = 0; hole < 18; hole++) {
      const key = `h${hole + 1}`;
      pdf.setFillColor(...grossBg);
      pdf.rect(getX(key), currentY, getWidth(key), rowHeights.player, 'F');
    }
    for (const key of ['out', 'init', 'in', 'tot', 'hcp', 'net']) {
      pdf.setFillColor(...grossBg);
      pdf.rect(getX(key), currentY, getWidth(key), rowHeights.player, 'F');
    }
    currentY += rowHeights.player;
    const netBg = [220, 230, 246];
    pdf.setFillColor(...netBg);
    pdf.rect(getX('name'), currentY, getWidth('name'), rowHeights.player, 'F');
    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Net', getX('name') + 0.04, currentY + rowHeights.player / 2 + 0.05, { align: 'left' });
    for (let hole = 0; hole < 18; hole++) {
      const key = `h${hole + 1}`;
      pdf.setFillColor(...netBg);
      pdf.rect(getX(key), currentY, getWidth(key), rowHeights.player, 'F');
    }
    for (const key of ['out', 'init', 'in', 'tot', 'hcp', 'net']) {
      pdf.setFillColor(...netBg);
      pdf.rect(getX(key), currentY, getWidth(key), rowHeights.player, 'F');
    }
    currentY += rowHeights.player;
  } else {
    // Non-team: blank player rows
    for (let pi = 0; pi < contentRows; pi++) {
      for (let ci = 0; ci < columnDefs.length; ci++) {
        const key = columnDefs[ci].key;
        const x = getX(key);
        const w = getWidth(key);
        if (key === 'init') {
          pdf.setFillColor(240, 240, 240);
          pdf.rect(x, currentY, w, rowHeights.player, 'F');
        } else {
          pdf.setFillColor(255, 255, 255);
          pdf.rect(x, currentY, w, rowHeights.player, 'F');
        }
      }
      currentY += rowHeights.player;
    }
  }

  // === Draw grid lines (row-based for clean rendering) ===
  pdf.setDrawColor(0, 0, 0);
  pdf.setLineWidth(0.01);
  const tableBottomY = Math.round(currentY * 100) / 100;

  // Vertical lines at each column boundary
  for (const x of colXPositions) {
    const xR = Math.round(x * 100) / 100;
    pdf.line(xR, tableTopY, xR, tableBottomY);
  }
  const rightEdge = Math.round((startX + cardWidth) * 100) / 100;
  pdf.line(rightEdge, tableTopY, rightEdge, tableBottomY);

  // Horizontal lines at each row boundary
  let gridY = tableTopY;
  for (let r = 0; r < headerRows; r++) {
    pdf.line(startX, gridY, startX + cardWidth, gridY);
    gridY += rowHeights.header;
  }
  for (let r = 0; r < contentRows; r++) {
    pdf.line(startX, gridY, startX + cardWidth, gridY);
    gridY += rowHeights.player;
  }
  pdf.line(startX, gridY, startX + cardWidth, gridY);
}
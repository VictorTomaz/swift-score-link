// LEGACY/DISABLED - DO NOT USE
// This file has been renamed to prevent accidental usage.
// The active PDF generator is: base44/functions/generateScorecardPdf/entry.ts

import { jsPDF } from 'jspdf';

export function generateScorecardPdfBlob(round) {
  const allPlayers = round.players || [];
  const chunkSize = 4;
  const foursomes = [];
  for (let i = 0; i < allPlayers.length; i += chunkSize) {
    foursomes.push(allPlayers.slice(i, i + chunkSize));
  }
  if (foursomes.length === 0) {
    foursomes.push([]);
  }

  const margin = 0.15;
  const cardWidth = 10.7;
  const cardHeight = 3.85;
  const topCardY = 0.2;
  const cutLineY = 4.25;
  const bottomCardY = 4.45;

  const pdf = new jsPDF({
    orientation: 'landscape',
    unit: 'in',
    format: 'letter',
    hotfixes: ['px_scaling'],
  });

  // DIAGNOSTIC MARKER - DO NOT REMOVE
  const generationTimestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  pdf.setFontSize(6);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(100, 100, 100);
  pdf.text(`GENERATED_BY: src/lib/generateScorecardPdf.legacy.disabled.js [CLIENT-SIDE]`, margin, 0.08);
  pdf.text(`TIME: ${generationTimestamp}`, margin, 0.14);
  pdf.setTextColor(0, 0, 0);

  const pages = [];
  for (let i = 0; i < foursomes.length; i += 2) {
    const top = foursomes[i];
    const bottom = foursomes[i + 1] || [];
    pages.push([top, bottom]);
  }

  pages.forEach((pageFoursomes, pageIdx) => {
    if (pageIdx > 0) {
      pdf.addPage('letter', 'landscape');
    }

    const [topFoursome, bottomFoursome] = pageFoursomes;

    drawScorecard(pdf, round, topFoursome, margin, topCardY, cardWidth, cardHeight);

    pdf.setDrawColor(150);
    pdf.setLineDash([0.1, 0.1], 0);
    pdf.line(margin, cutLineY, margin + cardWidth, cutLineY);
    pdf.setLineDash([], 0);

    drawScorecard(pdf, round, bottomFoursome, margin, bottomCardY, cardWidth, cardHeight);
  });

  return pdf;
}

function getInitials(name) {
  if (!name) return '';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function drawScorecard(pdf, round, players, startX, startY, cardWidth, cardHeight) {
  const par = round.par || [];
  const hcpIndexes = round.hole_handicap_indexes || [];
  const totalPar = par.length === 18 ? par.reduce((a, b) => a + b, 0) : 0;
  const frontPar = par.slice(0, 9).reduce((a, b) => a + b, 0);
  const backPar = par.slice(9, 18).reduce((a, b) => a + b, 0);

  const dateStr = round.date
    ? new Date(round.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '';

  const contentX = startX + 0.12;
  const contentY = startY + 0.18;
  const innerWidth = cardWidth - 0.24;

  // Header
  pdf.setFontSize(15);
  pdf.setFont('helvetica', 'bold');
  pdf.text(round.event_name || 'Golf Round', contentX, contentY + 0.20);

  pdf.setFontSize(8.5);
  pdf.setFont('helvetica', 'normal');
  const headerY = contentY + 0.20;
  const rightStart = contentX + innerWidth * 0.62;
  pdf.text(`Date: ${dateStr}`, rightStart, headerY);
  pdf.text(`Tees: ${round.tee_set || ''}`, rightStart + 1.2, headerY);

  const tableY = contentY + 0.38;
  const nameColWidth = 1.15;
  const initColWidth = 0.3;
  const remainingWidth = innerWidth - nameColWidth - initColWidth;
  const scoreColWidth = remainingWidth / 23;

  const headerRowHeight = 0.24;
  const playerRowHeight = 0.58;

  let currentY = tableY;

  pdf.setFontSize(8);
  pdf.setDrawColor(0);
  pdf.setLineWidth(0.01);

  const afterFront9 = contentX + nameColWidth + 9 * scoreColWidth;
  const afterOut = afterFront9 + scoreColWidth;
  const afterInit = afterOut + initColWidth;
  const afterBack9 = afterInit + 9 * scoreColWidth;
  const afterTot = afterBack9 + scoreColWidth;

  // === ROW 1: Hole numbers ===
  pdf.setFillColor(230, 230, 230);
  pdf.rect(contentX, currentY, nameColWidth, headerRowHeight, 'F');
  pdf.text('Hole', contentX + nameColWidth / 2, currentY + headerRowHeight / 2 + 0.02, { align: 'center' });

  for (let i = 0; i < 9; i++) {
    pdf.setFillColor(230, 230, 230);
    pdf.rect(contentX + nameColWidth + i * scoreColWidth, currentY, scoreColWidth, headerRowHeight, 'F');
    pdf.text(String(i + 1), contentX + nameColWidth + i * scoreColWidth + scoreColWidth / 2, currentY + headerRowHeight / 2 + 0.02, { align: 'center' });
  }

  pdf.setFillColor(230, 230, 230);
  pdf.rect(afterFront9, currentY, scoreColWidth, headerRowHeight, 'F');
  pdf.text('OUT', afterFront9 + scoreColWidth / 2, currentY + headerRowHeight / 2 + 0.02, { align: 'center' });

  pdf.setFillColor(230, 230, 230);
  pdf.rect(afterOut, currentY, initColWidth, headerRowHeight, 'F');
  pdf.text('INIT', afterOut + initColWidth / 2, currentY + headerRowHeight / 2 + 0.02, { align: 'center' });

  for (let i = 9; i < 18; i++) {
    pdf.setFillColor(230, 230, 230);
    pdf.rect(afterInit + (i - 9) * scoreColWidth, currentY, scoreColWidth, headerRowHeight, 'F');
    pdf.text(String(i + 1), afterInit + (i - 9) * scoreColWidth + scoreColWidth / 2, currentY + headerRowHeight / 2 + 0.02, { align: 'center' });
  }

  // IN column - draw 3 sides only (no right border - this is where main grid ends)
  pdf.setFillColor(230, 230, 230);
  pdf.rect(afterBack9, currentY, scoreColWidth, headerRowHeight, 'F');
  pdf.line(afterBack9, currentY, afterBack9, currentY + headerRowHeight); // left only
  pdf.line(afterBack9, currentY, afterBack9 + scoreColWidth, currentY); // top
  pdf.line(afterBack9, currentY + headerRowHeight, afterBack9 + scoreColWidth, currentY + headerRowHeight); // bottom
  pdf.text('IN', afterBack9 + scoreColWidth / 2, currentY + headerRowHeight / 2 + 0.02, { align: 'center' });

  // TOT column - draw 3 sides only (no right border)
  pdf.setFillColor(230, 230, 230);
  pdf.rect(afterBack9 + scoreColWidth, currentY, scoreColWidth, headerRowHeight, 'F');
  pdf.line(afterBack9 + scoreColWidth, currentY, afterBack9 + scoreColWidth * 2, currentY); // top
  pdf.line(afterBack9 + scoreColWidth, currentY + headerRowHeight, afterBack9 + scoreColWidth * 2, currentY + headerRowHeight); // bottom
  pdf.line(afterBack9 + scoreColWidth, currentY, afterBack9 + scoreColWidth, currentY + headerRowHeight); // left
  pdf.text('TOT', afterBack9 + scoreColWidth * 1.5, currentY + headerRowHeight / 2 + 0.02, { align: 'center' });

  // HCP column - separate table with gap after TOT, draw all 4 borders
  const hcpGap = 0.12;
  const hcpColWidth = scoreColWidth * 1.4;
  const netColWidth = scoreColWidth * 1.4;
  const hcpStartX = afterTot + hcpGap;
  const netStartX = hcpStartX + hcpColWidth + hcpGap;
  pdf.setFillColor(230, 230, 230);
  pdf.rect(hcpStartX, currentY, hcpColWidth, headerRowHeight);
  pdf.line(hcpStartX, currentY, hcpStartX + hcpColWidth, currentY); // top
  pdf.line(hcpStartX, currentY + headerRowHeight, hcpStartX + hcpColWidth, currentY + headerRowHeight); // bottom
  pdf.line(hcpStartX, currentY, hcpStartX, currentY + headerRowHeight); // left
  pdf.line(hcpStartX + hcpColWidth, currentY, hcpStartX + hcpColWidth, currentY + headerRowHeight); // right
  pdf.text('HCP', hcpStartX + hcpColWidth / 2, currentY + headerRowHeight / 2 + 0.02, { align: 'center' });

  // NET column - separate table with gap after HCP, draw all 4 borders
  pdf.setFillColor(230, 230, 230);
  pdf.rect(netStartX, currentY, netColWidth, headerRowHeight);
  pdf.line(netStartX, currentY, netStartX + netColWidth, currentY); // top
  pdf.line(netStartX, currentY + headerRowHeight, netStartX + netColWidth, currentY + headerRowHeight); // bottom
  pdf.line(netStartX, currentY, netStartX, currentY + headerRowHeight); // left
  pdf.line(netStartX + netColWidth, currentY, netStartX + netColWidth, currentY + headerRowHeight); // right
  pdf.text('NET', netStartX + netColWidth / 2, currentY + headerRowHeight / 2 + 0.02, { align: 'center' });

  currentY += headerRowHeight;

  // === ROW 2: Par ===
  pdf.setFillColor(240, 240, 240);
  pdf.rect(contentX, currentY, nameColWidth, headerRowHeight, 'F');
  pdf.text('Par', contentX + nameColWidth / 2, currentY + headerRowHeight / 2 + 0.02, { align: 'center' });

  for (let i = 0; i < 9; i++) {
    pdf.rect(contentX + nameColWidth + i * scoreColWidth, currentY, scoreColWidth, headerRowHeight);
    pdf.text(String(par[i] || ''), contentX + nameColWidth + i * scoreColWidth + scoreColWidth / 2, currentY + headerRowHeight / 2 + 0.02, { align: 'center' });
  }

  pdf.rect(afterFront9, currentY, scoreColWidth, headerRowHeight);
  pdf.text(String(frontPar || ''), afterFront9 + scoreColWidth / 2, currentY + headerRowHeight / 2 + 0.02, { align: 'center' });

  // INIT cell (blank for par row)
  pdf.rect(afterOut, currentY, initColWidth, headerRowHeight);

  for (let i = 9; i < 18; i++) {
    pdf.rect(afterInit + (i - 9) * scoreColWidth, currentY, scoreColWidth, headerRowHeight);
    pdf.text(String(par[i] || ''), afterInit + (i - 9) * scoreColWidth + scoreColWidth / 2, currentY + headerRowHeight / 2 + 0.02, { align: 'center' });
  }

  // IN cell - draw 3 sides only (no right border)
  pdf.rect(afterBack9, currentY, scoreColWidth, headerRowHeight);
  pdf.line(afterBack9, currentY, afterBack9, currentY + headerRowHeight); // left
  pdf.line(afterBack9, currentY, afterBack9 + scoreColWidth, currentY); // top
  pdf.line(afterBack9, currentY + headerRowHeight, afterBack9 + scoreColWidth, currentY + headerRowHeight); // bottom
  pdf.text(String(backPar || ''), afterBack9 + scoreColWidth / 2, currentY + headerRowHeight / 2 + 0.02, { align: 'center' });

  // TOT cell - draw 3 sides only (no right border)
  pdf.rect(afterBack9 + scoreColWidth, currentY, scoreColWidth, headerRowHeight);
  pdf.line(afterBack9 + scoreColWidth, currentY, afterBack9 + scoreColWidth, currentY + headerRowHeight); // left
  pdf.line(afterBack9 + scoreColWidth, currentY, afterBack9 + scoreColWidth * 2, currentY); // top
  pdf.line(afterBack9 + scoreColWidth, currentY + headerRowHeight, afterBack9 + scoreColWidth * 2, currentY + headerRowHeight); // bottom
  pdf.text(String(totalPar || ''), afterBack9 + scoreColWidth * 1.5, currentY + headerRowHeight / 2 + 0.02, { align: 'center' });

  // HCP cell - separate, fill only (no borders in par row)
  pdf.setFillColor(240, 240, 240);
  pdf.rect(hcpStartX, currentY, hcpColWidth, headerRowHeight, 'F');
  // NET cell - separate, fill only (no borders in par row)
  pdf.setFillColor(240, 240, 240);
  pdf.rect(netStartX, currentY, netColWidth, headerRowHeight, 'F');

  currentY += headerRowHeight;

  // === ROW 3: Stroke Index (HCP) ===
  pdf.setFillColor(240, 240, 240);
  pdf.rect(contentX, currentY, nameColWidth, headerRowHeight, 'F');
  pdf.text('HCP', contentX + nameColWidth / 2, currentY + headerRowHeight / 2 + 0.02, { align: 'center' });

  for (let i = 0; i < 9; i++) {
    pdf.rect(contentX + nameColWidth + i * scoreColWidth, currentY, scoreColWidth, headerRowHeight);
    pdf.text(String(hcpIndexes[i] || ''), contentX + nameColWidth + i * scoreColWidth + scoreColWidth / 2, currentY + headerRowHeight / 2 + 0.02, { align: 'center' });
  }

  pdf.rect(afterFront9, currentY, scoreColWidth, headerRowHeight);

  pdf.rect(afterOut, currentY, initColWidth, headerRowHeight);

  for (let i = 9; i < 18; i++) {
    pdf.rect(afterInit + (i - 9) * scoreColWidth, currentY, scoreColWidth, headerRowHeight);
    pdf.text(String(hcpIndexes[i] || ''), afterInit + (i - 9) * scoreColWidth + scoreColWidth / 2, currentY + headerRowHeight / 2 + 0.02, { align: 'center' });
  }

  // IN cell - 3 sides only (no right border)
  pdf.rect(afterBack9, currentY, scoreColWidth, headerRowHeight);
  pdf.line(afterBack9, currentY, afterBack9, currentY + headerRowHeight); // left
  pdf.line(afterBack9, currentY, afterBack9 + scoreColWidth, currentY); // top
  pdf.line(afterBack9, currentY + headerRowHeight, afterBack9 + scoreColWidth, currentY + headerRowHeight); // bottom

  // TOT cell - 3 sides only (no right border)
  pdf.rect(afterBack9 + scoreColWidth, currentY, scoreColWidth, headerRowHeight);
  pdf.line(afterBack9 + scoreColWidth, currentY, afterBack9 + scoreColWidth, currentY + headerRowHeight); // left
  pdf.line(afterBack9 + scoreColWidth, currentY, afterBack9 + scoreColWidth * 2, currentY); // top
  pdf.line(afterBack9 + scoreColWidth, currentY + headerRowHeight, afterBack9 + scoreColWidth * 2, currentY + headerRowHeight); // bottom

  // HCP and NET cells - separate, fill only (no borders in stroke index row)
  pdf.setFillColor(240, 240, 240);
  pdf.rect(hcpStartX, currentY, hcpColWidth, headerRowHeight, 'F');
  pdf.rect(netStartX, currentY, netColWidth, headerRowHeight, 'F');

  currentY += headerRowHeight;

  // === Player rows ===
  const displayPlayers = players.length > 0 ? players : Array(4).fill(null);
  displayPlayers.slice(0, 4).forEach((player, pi) => {
    const playerName = player ? (player.name || `Player ${pi + 1}`) : '';
    const ch = player?.course_handicap;
    const hcpDisplay = player?.is_plus_handicap && ch != null ? `+${ch}` : ch != null ? String(ch) : '';

    let fontSize = 12;
    pdf.setFontSize(fontSize);
    pdf.setFont('helvetica', 'bold');
    const maxNameWidth = nameColWidth - 0.12;
    if (pdf.getTextWidth(playerName) > maxNameWidth) {
      fontSize = 10;
      pdf.setFontSize(fontSize);
    }
    let displayName = playerName;
    while (displayName.length > 1 && pdf.getTextWidth(displayName) > maxNameWidth) {
      displayName = displayName.slice(0, -1);
    }

    pdf.rect(contentX, currentY, nameColWidth, playerRowHeight);
    pdf.text(displayName, contentX + 0.06, currentY + playerRowHeight / 2 + 0.04, { align: 'left' });

    for (let i = 0; i < 9; i++) {
      pdf.rect(contentX + nameColWidth + i * scoreColWidth, currentY, scoreColWidth, playerRowHeight);
      pdf.setFillColor(200, 200, 200);
      pdf.circle(contentX + nameColWidth + i * scoreColWidth + scoreColWidth - 0.025, currentY + 0.035, 0.01, 'F');
      pdf.setFillColor(255, 255, 255);
    }

    pdf.rect(afterFront9, currentY, scoreColWidth, playerRowHeight);
    pdf.setFillColor(200, 200, 200);
    pdf.circle(afterFront9 + scoreColWidth - 0.025, currentY + 0.035, 0.01, 'F');
    pdf.setFillColor(255, 255, 255);

    pdf.rect(afterOut, currentY, initColWidth, playerRowHeight);
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'bold');
    pdf.text(getInitials(playerName), afterOut + initColWidth / 2, currentY + playerRowHeight / 2 + 0.03, { align: 'center' });

    for (let i = 9; i < 18; i++) {
      pdf.rect(afterInit + (i - 9) * scoreColWidth, currentY, scoreColWidth, playerRowHeight);
      pdf.setFillColor(200, 200, 200);
      pdf.circle(afterInit + (i - 9) * scoreColWidth + scoreColWidth - 0.025, currentY + 0.035, 0.01, 'F');
      pdf.setFillColor(255, 255, 255);
    }

    // IN column - draw 3 sides only (no right border)
    pdf.rect(afterBack9, currentY, scoreColWidth, playerRowHeight);
    pdf.line(afterBack9, currentY, afterBack9, currentY + playerRowHeight); // left
    pdf.line(afterBack9, currentY, afterBack9 + scoreColWidth, currentY); // top
    pdf.line(afterBack9, currentY + playerRowHeight, afterBack9 + scoreColWidth, currentY + playerRowHeight); // bottom
    pdf.setFillColor(200, 200, 200);
    pdf.circle(afterBack9 + scoreColWidth - 0.025, currentY + 0.035, 0.01, 'F');
    pdf.setFillColor(255, 255, 255);

    // TOT column: draw 3 sides only (no right border)
    const totX = afterBack9 + scoreColWidth;
    const totY = currentY;
    pdf.setFillColor(255, 255, 255);
    pdf.rect(totX, totY, scoreColWidth, playerRowHeight, 'F');
    pdf.setDrawColor(0);
    pdf.setLineWidth(0.01);
    pdf.line(totX, totY, totX + scoreColWidth, totY); // top
    pdf.line(totX, totY + playerRowHeight, totX + scoreColWidth, totY + playerRowHeight); // bottom
    pdf.line(totX, totY, totX, totY + playerRowHeight); // left
    pdf.setFillColor(200, 200, 200);
    pdf.circle(totX + scoreColWidth - 0.025, totY + 0.035, 0.01, 'F');
    pdf.setFillColor(255, 255, 255);

    // HCP column: separate table with own borders (left and right only) - uses hcpStartX from header
    pdf.setFillColor(255, 255, 255);
    pdf.rect(hcpStartX, totY, hcpColWidth, playerRowHeight, 'F');
    pdf.setDrawColor(0);
    pdf.setLineWidth(0.01);
    // Only draw left and right borders of HCP column
    pdf.line(hcpStartX, totY, hcpStartX, totY + playerRowHeight); // left
    pdf.line(hcpStartX + hcpColWidth, totY, hcpStartX + hcpColWidth, totY + playerRowHeight); // right
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'bold');
    // Center handicap values with proper spacing
    pdf.text(hcpDisplay, hcpStartX + hcpColWidth / 2, totY + playerRowHeight / 2 + 0.035, { align: 'center' });
    pdf.setFillColor(200, 200, 200);
    pdf.circle(hcpStartX + hcpColWidth - 0.025, totY + 0.035, 0.01, 'F');
    pdf.setFillColor(255, 255, 255);

    // NET column: separate table with own borders (left and right only) - uses netStartX from header
    pdf.setFillColor(255, 255, 255);
    pdf.rect(netStartX, totY, netColWidth, playerRowHeight, 'F');
    pdf.setDrawColor(0);
    pdf.setLineWidth(0.01);
    pdf.line(netStartX, totY, netStartX, totY + playerRowHeight); // left
    pdf.line(netStartX + netColWidth, totY, netStartX + netColWidth, totY + playerRowHeight); // right
    pdf.setFillColor(200, 200, 200);
    pdf.circle(netStartX + netColWidth - 0.025, totY + 0.035, 0.01, 'F');
    pdf.setFillColor(255, 255, 255);

    currentY += playerRowHeight;
  });

  // Outer border: draw 3 sides only (skip right vertical to avoid line through HCP/NET)
  pdf.setDrawColor(0);
  pdf.setLineWidth(0.01);
  pdf.line(startX, startY, startX + cardWidth, startY); // top
  pdf.line(startX, startY + cardHeight, startX + cardWidth, startY + cardHeight); // bottom
  pdf.line(startX, startY, startX, startY + cardHeight); // left
}
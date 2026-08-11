import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { jsPDF } from 'npm:jspdf@4.0.0';

const DEFAULT_666_SEGS = [
  { holes: 'Holes 1–6', format: 'chapman' },
  { holes: 'Holes 7–12', format: 'best_ball' },
  { holes: 'Holes 13–18', format: 'scramble' },
];
const FMT_LABEL_666 = { chapman: 'Chapman', best_ball: 'Best Ball', scramble: 'Scramble', alternate_shot: 'Alt Shot' };

const HCP_FORMULA_LABELS = {
  combined_avg: 'Combined Average',
  combined_85: '85% of Combined',
  usga_scramble: 'USGA Scramble',
  sum: 'Full Combined',
};

function computeTeamHandicap(players, formula) {
  const handicaps = (players || [])
    .filter((p) => p && p.course_handicap != null)
    .map((p) => Number(p.course_handicap))
    .filter((n) => !isNaN(n))
    .sort((a, b) => a - b);
  if (handicaps.length === 0) return null;
  const sum = handicaps.reduce((a, b) => a + b, 0);
  const count = handicaps.length;
  switch (formula) {
    case 'combined_avg': return Math.round(sum / count);
    case 'sum': return sum;
    case 'usga_scramble': {
      let pct;
      if (count >= 4) pct = [0.25, 0.20, 0.15, 0.10];
      else if (count === 3) pct = [0.30, 0.20, 0.10];
      else pct = [0.35, 0.15];
      let total = 0;
      for (let i = 0; i < count && i < pct.length; i++) total += handicaps[i] * pct[i];
      return Math.round(total);
    }
    case 'combined_85':
    default: return Math.round(sum * 0.85);
  }
}

// Scorecard PDF generator — landscape, tee-time grouped, multi-team support within tee times.
// When team_mode is on, players at the same tee time are sub-grouped by `tee_group`
// field. Each sub-group gets its own player rows + Gross/Net best-ball rows.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { roundId, players: payloadPlayers } = await req.json();
    if (!roundId) return Response.json({ error: 'roundId required' }, { status: 400 });

    const round = await base44.entities.Round.get(roundId);
    if (!round) return Response.json({ error: 'Round not found' }, { status: 404 });

    // The DB roster is the source of truth for names/handicaps (always fresh).
    // Only tee_time/tee_group are taken from the screen payload (matched by
    // player_id) so the card reflects current tee assignments without ever
    // rendering a stale name from an outdated in-memory snapshot.
    const dbPlayers = round.players || [];
    let allPlayers = dbPlayers;
    if (Array.isArray(payloadPlayers) && payloadPlayers.length > 0) {
      const screenById = {};
      for (const p of payloadPlayers) {
        if (p && p.player_id) screenById[p.player_id] = p;
      }
      allPlayers = dbPlayers.map((p) => {
        const sp = screenById[p.player_id];
        if (!sp) return p;
        return {
          ...p,
          tee_time: sp.tee_time != null ? sp.tee_time : p.tee_time,
          tee_group: sp.tee_group != null ? sp.tee_group : p.tee_group,
        };
      });
    }

    const headerText = round.event_name || 'Golf Round';
    const par = round.par || [];
    const hcpIndexes = round.hole_handicap_indexes || [];

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

    const colWidths = {
      name: 2.00,
      init: 0.50,
      hole: 0.33,
      out: 0.42,
      in: 0.42,
      tot: 0.42,
      hcp: 0.40,
      net: 0.40
    };

    const cardWidth = colWidths.name + colWidths.init + 18 * colWidths.hole + colWidths.out + colWidths.in + colWidths.tot + colWidths.hcp + colWidths.net;

    const isTeamMode = round.team_mode === true || ['team_scramble', 'team_best_ball', 'team_6_6_6', 'team_chapman'].includes(round.game_type);
    const teamSize = isTeamMode ? (round.team_size || 2) : 0;
    const isScramble = isTeamMode && round.team_format === 'scramble';
    const is666 = isTeamMode && round.game_type === 'team_6_6_6';
    const isChapman = isTeamMode && round.game_type === 'team_chapman';

    const rowHeights = {
      header: isTeamMode ? 0.20 : 0.22,
      player: isTeamMode ? 0.42 : 0.55
    };

    const fixedPlayerRows = round.tee_sheet_config?.group_size || 4;

    // Group players — team mode: each (tee_time + tee_group) combo gets its own scorecard;
    // non-team mode: group by tee_time only.
    const allScorecardGroups = [];
    if (isTeamMode) {
      // 6-6-6: scorecard is per team (by tee_group tag), independent of tee time
      if (is666) {
        const tagged = {};
        const untagged = [];
        for (const p of allPlayers) {
          const tag = (p.tee_group || '').trim();
          if (tag) {
            if (!tagged[tag]) tagged[tag] = [];
            tagged[tag].push(p);
          } else {
            untagged.push(p);
          }
        }
        for (const t of Object.keys(tagged).sort()) {
          allScorecardGroups.push(tagged[t]);
        }
        untagged.sort((a, b) => (a.tee_time || '').localeCompare(b.tee_time || ''));
        for (let i = 0; i < untagged.length; i += teamSize) {
          allScorecardGroups.push(untagged.slice(i, i + teamSize));
        }
      } else {
        const hasGroupTags = allPlayers.some(p => p && (p.tee_group || '').trim());
        const teamGroups = {};
        for (const p of allPlayers) {
          const teeTime = (p.tee_time || '').trim();
          const teeGroup = (p.tee_group || '').trim() || '\u2014';
          const key = teeTime + '|' + teeGroup;
          if (!teamGroups[key]) teamGroups[key] = [];
          teamGroups[key].push(p);
        }
        const sortedKeys = Object.keys(teamGroups).sort();
        for (const key of sortedKeys) {
          const group = teamGroups[key];
          if (!hasGroupTags && teamSize > 0 && group.length > teamSize) {
            // Auto-split into teams of teamSize
            for (let i = 0; i < group.length; i += teamSize) {
              allScorecardGroups.push(group.slice(i, i + teamSize));
            }
          } else {
            allScorecardGroups.push(group);
          }
        }
      }
    } else {
      const teeTimeGroups = {};
      for (const p of allPlayers) {
        const teeTime = (p.tee_time || '').trim();
        if (teeTime) {
          if (!teeTimeGroups[teeTime]) teeTimeGroups[teeTime] = [];
          teeTimeGroups[teeTime].push(p);
        }
      }
      const sortedTimes = Object.keys(teeTimeGroups).sort();
      for (const time of sortedTimes) {
        allScorecardGroups.push(teeTimeGroups[time]);
      }
    }
    if (allScorecardGroups.length === 0) {
      allScorecardGroups.push([]);
    }

    // Each scorecard has one team — content rows = team players + Gross + Net (best_ball),
    // team players + 1 Gross row (6-6-6), or 2 (scramble)
    const teamContentRows = isTeamMode ? ((isScramble || isChapman || is666) ? 2 : (teamSize + 2)) : fixedPlayerRows;

    // Draw scorecards — 3 per page in team mode when they fit, 2 otherwise
    const legendHeight = is666 ? 0.26 : 0;
    const cardHeight = 3 * rowHeights.header + teamContentRows * rowHeights.player + legendHeight;
    // Each card has a 0.35" header bar drawn above its table top, so the visual
    // card height is cardHeight + 0.35. The spacing value is the gap between
    // table-top positions; the visible gap between cards = spacing - 0.35.
    // We want a comfortable ~0.45" visible gap, so spacing = 0.80.
    const cardSpacing = 0.80;
    const topOffset = 0.55;
    const cardsPerPage = isTeamMode && (3 * cardHeight + topOffset + 2 * cardSpacing <= pageHeight - margin) ? 3 : 2;

    let pageNum = 0;
    for (let i = 0; i < allScorecardGroups.length; i += cardsPerPage) {
      if (pageNum > 0) {
        pdf.addPage('letter', 'landscape');
      }

      if (isTeamMode) {
        // Mirror the individual scorecard layout: first card anchored near the
        // top (margin + 0.6), last card anchored so its table bottom sits at
        // pageHeight - margin - 0.35. Middle cards (3-per-page) space evenly
        // between those two anchors.
        const topBound = margin + 0.6;
        const bottomTableTop = pageHeight - margin - cardHeight - 0.35;
        const cardsOnPage = Math.min(cardsPerPage, allScorecardGroups.length - i);
        const step = cardsOnPage > 1
          ? (bottomTableTop - topBound) / (cardsOnPage - 1)
          : cardHeight + cardSpacing;
        let yPos = topBound;
        for (let j = 0; j < cardsOnPage; j++) {
          const group = allScorecardGroups[i + j];
          if (group && group.length > 0) {
            await drawScorecard(pdf, round, group, margin, yPos, cardWidth, cardHeight, colWidths, rowHeights, logoBytes, pageWidth, headerText, par, hcpIndexes, teamContentRows);
          }
          yPos += step;
        }
      } else {
        const topGroup = allScorecardGroups[i];
        const bottomGroup = allScorecardGroups[i + 1];
        const topY = margin + 0.6;
        // Anchor the bottom card to the bottom margin so the open page space
        // below the top card is filled (card visual height = cardHeight + 0.35 header).
        const bottomY = pageHeight - margin - cardHeight - 0.35;

        await drawScorecard(pdf, round, topGroup, margin, topY, cardWidth, cardHeight, colWidths, rowHeights, logoBytes, pageWidth, headerText, par, hcpIndexes, teamContentRows);

        if (bottomGroup && bottomGroup.length > 0) {
          await drawScorecard(pdf, round, bottomGroup, margin, bottomY, cardWidth, cardHeight, colWidths, rowHeights, logoBytes, pageWidth, headerText, par, hcpIndexes, teamContentRows);
        }
      }

      pageNum++;
    }

    const pdfArrayBuffer = pdf.output('arraybuffer');
    const pdfBlob = new Blob([pdfArrayBuffer], { type: 'application/pdf' });
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 10);
    const file = new File([pdfBlob], `scorecards-${round.event_name || 'golf'}-${timestamp}-${randomId}.pdf`, { type: 'application/pdf' });
    const { file_uri } = await base44.asServiceRole.integrations.Core.UploadPrivateFile({ file });
    const { signed_url } = await base44.asServiceRole.integrations.Core.CreateFileSignedUrl({ file_uri, expires_in: 86400 });
    await base44.entities.Round.update(roundId, { scorecard_pdf_url: signed_url });

    const pdfBytes = new Uint8Array(pdfArrayBuffer);
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < pdfBytes.length; i += chunkSize) {
      binary += String.fromCharCode.apply(null, pdfBytes.subarray(i, i + chunkSize));
    }
    const dataUrl = `data:application/pdf;base64,${btoa(binary)}`;

    return Response.json({
      url: dataUrl,
      signed_url,
      filename: `scorecards-${round.event_name || 'golf'}-${timestamp}-${randomId}.pdf`,
      format_version: '2026-07-15-v12-multi-team',
      debug: { timestamp, randomId, bytes: pdfBytes.length }
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

function holeStrokes(courseHandicap, hcpIdx) {
  const ch = Number(courseHandicap);
  if (ch == null || isNaN(ch)) return 0;
  // Plus handicap: -1 stroke on the easiest N holes (highest HCP index)
  if (ch < 0) {
    const floored = Math.floor(Math.abs(ch));
    return hcpIdx > (18 - floored) ? -1 : 0;
  }
  const floored = Math.floor(ch);
  // Standard USGA allocation: one stroke per hole for each full pass of 18,
  // then an extra stroke on the hardest N holes (HCP index ≤ remainder).
  // e.g. CH 55 → 3 dots on every hole + a 4th dot on the #1 handicap hole.
  const fullPasses = Math.floor(floored / 18);
  const remainder = floored % 18;
  let strokes = fullPasses;
  if (remainder > 0 && hcpIdx <= remainder) strokes += 1;
  return strokes;
}

async function drawScorecard(pdf, round, players, startX, startY, cardWidth, cardHeight, colWidths, rowHeights, logoBytes, pageWidth, headerText, par, hcpIndexes, paddedCount) {
  const isTeamMode = round.team_mode === true;
  const teamSize = isTeamMode ? (round.team_size || 2) : 0;
  const isScramble = isTeamMode && round.team_format === 'scramble';
  const is666 = isTeamMode && round.game_type === 'team_6_6_6';
  const isChapman = isTeamMode && round.game_type === 'team_chapman';

  // Sub-group players by tee_group when in team mode (multiple teams per tee time)
  let subTeams;
  if (isTeamMode) {
    const groups = {};
    for (const p of players) {
      if (!p) continue;
      const tag = (p.tee_group || '').trim() || '\u2014';
      if (!groups[tag]) groups[tag] = [];
      groups[tag].push(p);
    }
    subTeams = Object.keys(groups).sort().map(tag => groups[tag]);
    if (subTeams.length === 0) subTeams = [[]];
  } else {
    subTeams = [players.length > 0 ? players : [null]];
  }

  const totalPar = par.length === 18 ? par.reduce((a, b) => a + b, 0) : 0;
  const frontPar = par.slice(0, 9).reduce((a, b) => a + b, 0);
  const backPar = par.slice(9, 18).reduce((a, b) => a + b, 0);

  const dateStr = round.date
    ? new Date(round.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '';

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

  // Header bar (dark green)
  pdf.setFillColor(20, 83, 45);
  pdf.rect(startX, currentY - 0.35, cardWidth, 0.35, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(17);
  pdf.setFont('helvetica', 'bold');
  pdf.text(headerText || 'Golf Round', pageWidth / 2, currentY - 0.12, { align: 'center' });

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

  // Team HCP formula label — shown on the left side of the green header bar
  if (isTeamMode) {
    const formulaLabel = HCP_FORMULA_LABELS[round.hcp_formula] || '85% of Combined';
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(255, 255, 255);
    pdf.text(`Team HCP: ${formulaLabel}`, startX + 0.12, currentY - 0.12, { align: 'left' });
    pdf.setTextColor(0, 0, 0);
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
    { key: 'h1', text: String(par[0] ?? '') }, { key: 'h2', text: String(par[1] ?? '') },
    { key: 'h3', text: String(par[2] ?? '') }, { key: 'h4', text: String(par[3] ?? '') },
    { key: 'h5', text: String(par[4] ?? '') }, { key: 'h6', text: String(par[5] ?? '') },
    { key: 'h7', text: String(par[6] ?? '') }, { key: 'h8', text: String(par[7] ?? '') },
    { key: 'h9', text: String(par[8] ?? '') },
    { key: 'out', text: String(frontPar ?? '') }, { key: 'init', text: '' },
    { key: 'h10', text: String(par[9] ?? '') }, { key: 'h11', text: String(par[10] ?? '') },
    { key: 'h12', text: String(par[11] ?? '') }, { key: 'h13', text: String(par[12] ?? '') },
    { key: 'h14', text: String(par[13] ?? '') }, { key: 'h15', text: String(par[14] ?? '') },
    { key: 'h16', text: String(par[15] ?? '') }, { key: 'h17', text: String(par[16] ?? '') },
    { key: 'h18', text: String(par[17] ?? '') },
    { key: 'in', text: String(backPar ?? '') }, { key: 'tot', text: String(totalPar ?? '') },
    { key: 'hcp', text: '' }, { key: 'net', text: '' }
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

  // === ROW 3: HCP ===
  pdf.setTextColor(0, 0, 0);
  const hcpIndexRow = [
    { key: 'name', text: 'HCP', bg: [255, 255, 255], bold: true },
    { key: 'h1', text: String(hcpIndexes[0] ?? '') }, { key: 'h2', text: String(hcpIndexes[1] ?? '') },
    { key: 'h3', text: String(hcpIndexes[2] ?? '') }, { key: 'h4', text: String(hcpIndexes[3] ?? '') },
    { key: 'h5', text: String(hcpIndexes[4] ?? '') }, { key: 'h6', text: String(hcpIndexes[5] ?? '') },
    { key: 'h7', text: String(hcpIndexes[6] ?? '') }, { key: 'h8', text: String(hcpIndexes[7] ?? '') },
    { key: 'h9', text: String(hcpIndexes[8] ?? '') },
    { key: 'out', text: '' }, { key: 'init', text: '' },
    { key: 'h10', text: String(hcpIndexes[9] ?? '') }, { key: 'h11', text: String(hcpIndexes[10] ?? '') },
    { key: 'h12', text: String(hcpIndexes[11] ?? '') }, { key: 'h13', text: String(hcpIndexes[12] ?? '') },
    { key: 'h14', text: String(hcpIndexes[13] ?? '') }, { key: 'h15', text: String(hcpIndexes[14] ?? '') },
    { key: 'h16', text: String(hcpIndexes[15] ?? '') }, { key: 'h17', text: String(hcpIndexes[16] ?? '') },
    { key: 'h18', text: String(hcpIndexes[17] ?? '') },
    { key: 'in', text: '' }, { key: 'tot', text: '' }, { key: 'hcp', text: '' }, { key: 'net', text: '' }
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

  // === Per-sub-team: player rows + Gross + Net rows ===
  for (let teamIdx = 0; teamIdx < subTeams.length; teamIdx++) {
    const teamPlayers = subTeams[teamIdx];
    const displayPlayers = teamPlayers.length > 0 ? teamPlayers : [null];
    const teamHcpVal = computeTeamHandicap(displayPlayers.filter(p => p), round.hcp_formula);
    const teamHcpStr = teamHcpVal != null ? String(teamHcpVal) : '';

    // Best ball calculation for this team
    const grossBestBall = [];
    const netBestBall = [];
    for (let hole = 0; hole < 18; hole++) {
      const grossScores = [];
      const netScores = [];
      for (const player of displayPlayers) {
        if (!player) continue;
        const gross = Number((player.scores || [])[hole]);
        if (gross && gross > 0) {
          grossScores.push(gross);
          const strokes = holeStrokes(player.course_handicap || 0, hcpIndexes[hole] || 0);
          netScores.push(gross - strokes);
        }
      }
      grossBestBall.push(grossScores.length ? Math.min(...grossScores) : null);
      netBestBall.push(netScores.length ? Math.min(...netScores) : null);
    }
    const teamNameList = displayPlayers.filter(p => p && p.name).map(p => p.name.trim().split(/\s+/).pop());
    const grossVals = grossBestBall;
    const grossFrontSum = grossVals.slice(0, 9).filter(v => v != null).reduce((a, b) => a + b, 0);
    const grossBackSum = grossVals.slice(9, 18).filter(v => v != null).reduce((a, b) => a + b, 0);
    const grossHasFront = grossVals.slice(0, 9).some(v => v != null);
    const grossHasBack = grossVals.slice(9, 18).some(v => v != null);
    const netVals = netBestBall;
    const netFrontSum = netVals.slice(0, 9).filter(v => v != null).reduce((a, b) => a + b, 0);
    const netBackSum = netVals.slice(9, 18).filter(v => v != null).reduce((a, b) => a + b, 0);
    const netHasFront = netVals.slice(0, 9).some(v => v != null);
    const netHasBack = netVals.slice(9, 18).some(v => v != null);

    // Player rows (skipped for scramble, chapman, and 6-6-6)
    if (!isScramble && !isChapman && !is666) {
      displayPlayers.forEach((player) => {
        const playerName = player ? (player.name || '') : '';
        const ch = player?.course_handicap;
        const hcpDisplay = ch != null ? (ch < 0 ? `+${Math.abs(ch)}` : String(ch)) : '';
        const scores = player?.scores || [];
        const totalScore = scores.filter(s => s != null && s !== '').reduce((sum, s) => sum + Number(s), 0);
        const initials = playerName ? playerName.trim().split(/\s+/).map(n => n[0]).join('').toUpperCase().substring(0, 2) : '';

        const playerRow = [
          { key: 'name', text: playerName, align: 'left', nameOnly: true },
          { key: 'h1', score: 0, hasDot: true }, { key: 'h2', score: 1, hasDot: true },
          { key: 'h3', score: 2, hasDot: true }, { key: 'h4', score: 3, hasDot: true },
          { key: 'h5', score: 4, hasDot: true }, { key: 'h6', score: 5, hasDot: true },
          { key: 'h7', score: 6, hasDot: true }, { key: 'h8', score: 7, hasDot: true },
          { key: 'h9', score: 8, hasDot: true },
          { key: 'out', hasDot: true },
          { key: 'init', initials: initials, bg: [240, 240, 240] },
          { key: 'h10', score: 9, hasDot: true }, { key: 'h11', score: 10, hasDot: true },
          { key: 'h12', score: 11, hasDot: true }, { key: 'h13', score: 12, hasDot: true },
          { key: 'h14', score: 13, hasDot: true }, { key: 'h15', score: 14, hasDot: true },
          { key: 'h16', score: 15, hasDot: true }, { key: 'h17', score: 16, hasDot: true },
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
            pdf.setFillColor(255, 255, 255);
            pdf.rect(x, currentY, w, rowHeights.player, 'F');
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
            pdf.setFillColor(255, 255, 255);
            pdf.rect(x, currentY, w, rowHeights.player, 'F');
            // Draw handicap stroke dots at the top of the cell (blue for
            // strokes received, red for plus-handicap strokes given back).
            if (player && cell.score !== undefined) {
              const ch = player.course_handicap;
              const hcpVal = ch != null ? Number(ch) : (player.is_plus_handicap ? -Math.abs(player.handicap || 0) : Math.abs(player.handicap || 0));
              const strokes = holeStrokes(hcpVal, hcpIndexes[cell.score] || 0);
              if (strokes !== 0) {
                const isPlus = strokes < 0;
                const count = Math.abs(strokes);
                pdf.setFillColor(isPlus ? 248 : 29, isPlus ? 113 : 78, isPlus ? 113 : 216);
                const dotRadius = 0.013;
                const dotGap = 0.030;
                const totalWidth = (count - 1) * dotGap;
                const startDotX = x + (w - totalWidth) / 2;
                const dotY = currentY + 0.05;
                for (let d = 0; d < count; d++) {
                  pdf.circle(startDotX + d * dotGap, dotY, dotRadius, 'F');
                }
              }
            }
            pdf.setFillColor(255, 255, 255);
          } else if (cell.hcpAlign) {
            pdf.setFillColor(255, 255, 255);
            pdf.rect(x, currentY, w, rowHeights.player, 'F');
            if (cell.text) {
              pdf.setTextColor(0, 0, 0);
              pdf.setFontSize(9);
              pdf.setFont('helvetica', 'bold');
              const padding = 0.14;
              pdf.text(cell.text, x + padding, currentY + rowHeights.player / 2 + 0.03);
              pdf.setFontSize(11);
              pdf.setFont('helvetica', 'bold');
            }
          } else {
            pdf.setFillColor(255, 255, 255);
            pdf.rect(x, currentY, w, rowHeights.player, 'F');
            if (cell.text) {
              pdf.setFont('helvetica', cell.bold ? 'bold' : 'normal');
              pdf.text(cell.text, x + w / 2, currentY + rowHeights.player / 2 + 0.04, { align: 'center' });
            }
          }
        }
        currentY += rowHeights.player;
      });
    }

    // Team Gross + Net rows (best_ball mode only, not scramble/chapman, not 6-6-6)
    if (isTeamMode && !isScramble && !isChapman && !is666) {
      for (const rowData of [
        { label: 'Gross', values: grossVals, sumFront: grossFrontSum, sumBack: grossBackSum, hasFront: grossHasFront, hasBack: grossHasBack, bg: [220, 244, 220] },
        { label: 'Net', values: netVals, sumFront: netFrontSum, sumBack: netBackSum, hasFront: netHasFront, hasBack: netHasBack, bg: [220, 230, 246] }
      ]) {
        // Name cell
        pdf.setFillColor(...rowData.bg);
        pdf.rect(getX('name'), currentY, getWidth('name'), rowHeights.player, 'F');
        pdf.setFontSize(12);
        pdf.setFont('helvetica', 'bold');
        pdf.text(rowData.label, getX('name') + 0.04, currentY + rowHeights.player / 2 + 0.05, { align: 'left' });

        // Hole cells
        for (let hole = 0; hole < 18; hole++) {
          const key = `h${hole + 1}`;
          const x = getX(key);
          const w = getWidth(key);
          pdf.setFillColor(...rowData.bg);
          pdf.rect(x, currentY, w, rowHeights.player, 'F');
          const val = rowData.values[hole];
          if (val != null) {
            pdf.setTextColor(0, 0, 0);
            pdf.setFontSize(10);
            pdf.setFont('helvetica', 'bold');
            pdf.text(String(val), x + w / 2, currentY + rowHeights.player / 2 + 0.04, { align: 'center' });
            pdf.setFontSize(11);
          }
        }

        // OUT
        pdf.setFillColor(...rowData.bg);
        pdf.rect(getX('out'), currentY, getWidth('out'), rowHeights.player, 'F');
        if (rowData.hasFront) pdf.text(String(rowData.sumFront), getX('out') + getWidth('out') / 2, currentY + rowHeights.player / 2 + 0.04, { align: 'center' });

        // INIT
        pdf.setFillColor(...rowData.bg);
        pdf.rect(getX('init'), currentY, getWidth('init'), rowHeights.player, 'F');

        // IN
        pdf.setFillColor(...rowData.bg);
        pdf.rect(getX('in'), currentY, getWidth('in'), rowHeights.player, 'F');
        if (rowData.hasBack) pdf.text(String(rowData.sumBack), getX('in') + getWidth('in') / 2, currentY + rowHeights.player / 2 + 0.04, { align: 'center' });

        // TOT
        pdf.setFillColor(...rowData.bg);
        pdf.rect(getX('tot'), currentY, getWidth('tot'), rowHeights.player, 'F');
        if (rowData.hasFront || rowData.hasBack) pdf.text(String(rowData.sumFront + rowData.sumBack), getX('tot') + getWidth('tot') / 2, currentY + rowHeights.player / 2 + 0.04, { align: 'center' });

        // HCP + NET
        pdf.setFillColor(...rowData.bg);
        pdf.rect(getX('hcp'), currentY, getWidth('hcp'), rowHeights.player, 'F');
        pdf.rect(getX('net'), currentY, getWidth('net'), rowHeights.player, 'F');
        if (rowData.label === 'Net' && teamHcpStr) {
          pdf.setTextColor(0, 0, 0);
          pdf.setFontSize(9);
          pdf.setFont('helvetica', 'bold');
          pdf.text(teamHcpStr, getX('hcp') + getWidth('hcp') / 2, currentY + rowHeights.player / 2 + 0.03, { align: 'center' });
          pdf.setFontSize(11);
        }

        currentY += rowHeights.player;
      }
    }

    // Scramble / Chapman / 6-6-6: single team block with both names + marker's score row
    if (isScramble || isChapman || is666) {
      const teamBg = [220, 244, 220];
      pdf.setFillColor(...teamBg);
      pdf.rect(getX('name'), currentY, getWidth('name'), rowHeights.player, 'F');
      const nameCount = teamNameList.length;
      const rows = Math.ceil(nameCount / 2);
      const fontSize = Math.min(11, Math.max(5, Math.floor((rowHeights.player * 72) / (rows * 1.3))));
      pdf.setFontSize(fontSize);
      pdf.setFont('helvetica', 'bold');
      const lineSpacing = fontSize * 1.3 / 72;
      const totalHeight = rows * lineSpacing;
      const firstBaseline = currentY + (rowHeights.player - totalHeight) / 2 + lineSpacing * 0.7;
      const leftX = getX('name') + 0.04;
      const rightX = getX('name') + colWidths.name / 2;
      for (let r = 0; r < rows; r++) {
        const y = firstBaseline + r * lineSpacing;
        const leftIdx = r * 2;
        const rightIdx = r * 2 + 1;
        if (leftIdx < nameCount) pdf.text(teamNameList[leftIdx], leftX, y, { align: 'left' });
        if (rightIdx < nameCount) pdf.text(teamNameList[rightIdx], rightX, y, { align: 'left' });
      }
      pdf.setFontSize(11);
      for (let hole = 0; hole < 18; hole++) {
        const key = `h${hole + 1}`;
        pdf.setFillColor(...teamBg);
        pdf.rect(getX(key), currentY, getWidth(key), rowHeights.player, 'F');
      }
      for (const key of ['out', 'init', 'in', 'tot', 'hcp', 'net']) {
        pdf.setFillColor(...teamBg);
        pdf.rect(getX(key), currentY, getWidth(key), rowHeights.player, 'F');
      }
      if (teamHcpStr) {
        pdf.setTextColor(0, 0, 0);
        pdf.setFontSize(10);
        pdf.setFont('helvetica', 'bold');
        pdf.text(teamHcpStr, getX('hcp') + getWidth('hcp') / 2, currentY + rowHeights.player / 2 + 0.04, { align: 'center' });
        pdf.setFontSize(11);
      }
      currentY += rowHeights.player;

      const indBg = [245, 245, 245];
      pdf.setFillColor(...indBg);
      pdf.rect(getX('name'), currentY, getWidth('name'), rowHeights.player, 'F');
      pdf.setFontSize(7);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(150, 150, 150);
      pdf.text("Marker's Score", getX('name') + 0.04, currentY + rowHeights.player / 2 + 0.02, { align: 'left' });
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
    }
  }

  // === Empty rows to fill remaining space ===
  const currentYAfter = currentY;
  const tableBottomExpected = startY + 3 * rowHeights.header + paddedCount * rowHeights.player;
  let emptyRows = Math.max(0, Math.round((tableBottomExpected - currentYAfter) / rowHeights.player));
  for (let ei = 0; ei < emptyRows; ei++) {
    for (let ci = 0; ci < columnDefs.length; ci++) {
      const key = columnDefs[ci].key;
      const x = getX(key);
      const w = getWidth(key);
      if (['h1','h2','h3','h4','h5','h6','h7','h8','h9','h10','h11','h12','h13','h14','h15','h16','h17','h18','out','in','net'].includes(key)) {
        pdf.setFillColor(255, 255, 255);
        pdf.rect(x, currentY, w, rowHeights.player, 'F');
        pdf.setFillColor(255, 255, 255);
        pdf.circle(x + 0.035, currentY + 0.035, 0.015, 'F');
        pdf.circle(x + w - 0.035, currentY + 0.035, 0.015, 'F');
        pdf.circle(x + 0.035, currentY + rowHeights.player - 0.035, 0.015, 'F');
        pdf.circle(x + w - 0.035, currentY + rowHeights.player - 0.035, 0.015, 'F');
        pdf.setFillColor(255, 255, 255);
      } else if (key === 'init') {
        pdf.setFillColor(240, 240, 240);
        pdf.rect(x, currentY, w, rowHeights.player, 'F');
        pdf.setFillColor(255, 255, 255);
      } else {
        pdf.setFillColor(255, 255, 255);
        pdf.rect(x, currentY, w, rowHeights.player, 'F');
      }
    }
    currentY += rowHeights.player;
  }

  // === Grid lines ===
  pdf.setDrawColor(0, 0, 0);
  pdf.setLineWidth(0.01);
  const tableBottomY = Math.round(currentY * 100) / 100;
  const headerRowCount = 3;

  for (const x of colXPositions) {
    const xR = Math.round(x * 100) / 100;
    pdf.line(xR, tableTopY, xR, tableBottomY);
  }
  const rightEdge = Math.round((startX + cardWidth) * 100) / 100;
  pdf.line(rightEdge, tableTopY, rightEdge, tableBottomY);

  let gridY = tableTopY;
  for (let r = 0; r < headerRowCount; r++) {
    pdf.line(startX, gridY, startX + cardWidth, gridY);
    gridY += rowHeights.header;
  }
  for (let r = 0; r < paddedCount; r++) {
    pdf.line(startX, gridY, startX + cardWidth, gridY);
    gridY += rowHeights.player;
  }
  pdf.line(startX, gridY, startX + cardWidth, gridY);

  // 6-6-6: segment format legend below the table
  if (is666) {
    const segs = (Array.isArray(round.segments_666) && round.segments_666.length === 3)
      ? round.segments_666
      : DEFAULT_666_SEGS;
    const legendH = 0.20;
    const legendY = gridY + 0.04;
    pdf.setFillColor(245, 245, 245);
    pdf.rect(startX, legendY, cardWidth, legendH, 'F');
    pdf.setDrawColor(0, 0, 0);
    pdf.setLineWidth(0.01);
    pdf.rect(startX, legendY, cardWidth, legendH, 'S');
    const legendText = segs.map(s => `${s.holes}: ${FMT_LABEL_666[s.format] || s.format}`).join('   •   ');
    pdf.setFontSize(7);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(0, 0, 0);
    pdf.text(legendText, startX + cardWidth / 2, legendY + legendH / 2 + 0.02, { align: 'center' });
    pdf.setFontSize(11);
  }

}
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { jsPDF } from 'npm:jspdf@4.0.0';

// Results PDF generator — portrait page with standings + side games only (no final tally).

/** Returns the score-result label (Eagle, Birdie, Par, Bogey, etc.) for a given score vs par. */
function scoreResultLabel(score: any, par: any): string | null {
  const s = Number(score);
  const p = Number(par);
  if (isNaN(s) || isNaN(p) || s <= 0) return null;
  const diff = s - p;
  if (diff <= -3) return 'Albatross';
  if (diff === -2) return 'Eagle';
  if (diff === -1) return 'Birdie';
  if (diff === 0) return 'Par';
  if (diff === 1) return 'Bogey';
  if (diff === 2) return 'Double Bogey';
  if (diff >= 3) return `+${diff}`;
  return null;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const roundId = body?.roundId;
    const force = !!body?.force;
    if (!roundId) return Response.json({ error: 'roundId required' }, { status: 400 });

    // Fetch the round via user context (enforces RLS via the DB), with retries
    // to ride out the intermittent empty/404 that drops the scorecard on
    // repeated refreshes. Fall back to the service role if all retries fail.
    let round: any = null;
    for (let attempt = 1; attempt <= 3 && !round; attempt++) {
      try { round = await base44.entities.Round.get(roundId); } catch (e) { /* retry */ }
      if (!round) await new Promise(r => setTimeout(r, 150));
    }
    if (!round) {
      try { round = await base44.asServiceRole.entities.Round.get(roundId); } catch (e) { /* give up */ }
    }
    if (!round) return Response.json({ error: 'Round not found' }, { status: 404 });

    // Multi-flight: the final flight's results contain FIELD standings (all flights
    // combined). Labels and per-flight sections reflect this.
    const isMultiFlight = !!round.is_multi_flight || (round.is_multi_day && round.series_type === 'multi_flight');
    const pdfSeriesLabel = isMultiFlight ? 'Flight' : 'Day';

    // Cache: return the previously-generated results PDF so repeated presses
    // (e.g. after a page refresh) return the same working PDF instead of
    // regenerating one that may come out missing the scorecard. The cache is
    // cleared (results_pdf_url = null) whenever results are recomputed.
    // Verifies a hosted PDF's raw bytes actually contain the series scorecard
    // section (jsPDF writes text uncompressed, so a simple byte search works).
    const pdfHasScorecard = async (url: string): Promise<boolean> => {
      try {
        const res = await fetch(url);
        if (!res.ok) return false;
        const bytes = new Uint8Array(await res.arrayBuffer());
        let txt = '';
        for (let i = 0; i < bytes.length; i += 65536) {
          txt += String.fromCharCode(...bytes.subarray(i, Math.min(i + 65536, bytes.length)));
        }
        return txt.includes('SERIES SCORECARD');
      } catch (e) {
        return false;
      }
    };

    if (round.results_pdf_url && !force) {
      // Multi-day: never trust the cache blindly — verify the cached file
      // really contains the series scorecard before serving it. A bad or
      // unreachable cached file falls through to a fresh regeneration.
      // Multi-flight: no scorecard section, so skip verification.
      if (!round.is_multi_day || isMultiFlight || await pdfHasScorecard(round.results_pdf_url)) {
        return Response.json({
          url: round.results_pdf_url,
          filename: `results-${round.event_name || 'golf'}.pdf`,
        });
      }
      console.warn('[generateResultsPdf] Cached PDF failed scorecard verification — regenerating');
    }

    // Multi-day series: hold the main (gross/net) purse until the final round.
    // Day 1 (parent) and any non-final child show no main-purse payouts; only
    // side games (skins, KPs, deuces) settle day-by-day.
    let holdMainPayouts = false;
    let seriesRoundsCache: any[] | null = null;
    let scorecardDiag = '';  // diagnostic string for scorecard debugging
    let seriesIncomplete = false;  // true when a series day is missing — never cache such a PDF
    if (round.is_multi_day || round.is_multi_flight) {
      const anchorId = round.parent_round_id || round.id;
      // The series fetch is the most fragile part of this function — a transient
      // empty result from the children query silently drops the scorecard from
      // the PDF. We fetch the anchor round by id (most reliable single-record
      // fetch) and retry the children filter up to 3 times to ride out blips.
      const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
      const retryGet = async (id: string): Promise<any | null> => {
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            const r = await base44.asServiceRole.entities.Round.get(id);
            if (r) return r;
          } catch (e) { console.error(`[generateResultsPdf] anchor get attempt ${attempt} failed:`, e.message); }
          try {
            const r = await base44.entities.Round.get(id);
            if (r) return r;
          } catch (e) { /* keep retrying */ }
          await sleep(150);
        }
        return null;
      };
      const retryFilter = async (fn: () => Promise<any[]>, label: string): Promise<any[]> => {
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            const res = await fn();
            if (res && res.length > 0) return res;
          } catch (e) { console.error(`[generateResultsPdf] ${label} attempt ${attempt} failed:`, e.message); }
          await sleep(150);
        }
        return [];
      };
      // Anchor round: the parent (if this is a child) or the current round itself.
      let anchorRound: any = null;
      if (anchorId === round.id) {
        anchorRound = round;
      } else {
        anchorRound = await retryGet(anchorId);
      }
      // Child rounds of the series.
      let children = await retryFilter(
        () => base44.asServiceRole.entities.Round.filter({ parent_round_id: anchorId }, '-created_date', 200),
        'children(serviceRole)'
      );
      if (children.length === 0) {
        children = await retryFilter(
          () => base44.entities.Round.filter({ parent_round_id: anchorId }, '-created_date', 200),
          'children(user)'
        );
      }
      let allSeries = [anchorRound, ...children].filter(Boolean);
      // Always include the current round even if the anchor/children fetches missed it.
      if (!allSeries.find(r => r.id === round.id)) allSeries.push(round);
      // Deduplicate.
      const seenIds = new Set<string>();
      allSeries = allSeries.filter(r => { if (seenIds.has(r.id)) return false; seenIds.add(r.id); return true; });
      if (allSeries.length === 0) {
        console.warn('[generateResultsPdf] Series fetch empty — falling back to current round only');
        allSeries = [round];
      }
      console.log('[generateResultsPdf] Series rounds found:', allSeries.length, allSeries.map(r => r.id));
      seriesRoundsCache = allSeries;
      // Final day = the latest-dated CHILD (the parent is Day 1, never final).
      // When series days share a date, tie-break by created_date so the child
      // added last is treated as final — mirrors the on-screen isSeriesFinalDay
      // hook. Sorting parent+children together made the parent win same-date
      // ties and wrongly held the main purse on the real final day.
      const seriesChildren = allSeries.filter(r => r.parent_round_id);
      const sortedChildren = [...seriesChildren].sort((a, b) => {
        const dd = new Date(b.date) - new Date(a.date);
        if (dd !== 0) return dd;
        return new Date(b.created_date || 0) - new Date(a.created_date || 0);
      });
      let isFinal: boolean;
      if (round.parent_round_id) {
        if (round.is_series_final === true) isFinal = true;
        else if (round.is_series_final === false) isFinal = false;
        else isFinal = sortedChildren[0]?.id === round.id;
      } else {
        isFinal = false;
      }
      // Multi-flight: each flight pays its own gross/net/side games — only the
      // field prize (Low Gross/Net of the Field) is held until the final flight.
      // So holdMainPayouts is false for multi-flight (gross/net always shown).
      holdMainPayouts = !isFinal && round.series_type !== 'multi_flight';
    }

    const results = round.results || {};
    const players = round.players || [];
    const payouts = results.payouts || [];
    const grossResults = results.gross_results || [];
    const netResults = results.net_results || [];
    const kpResults = results.kp_results || [];
    const grossSkins = results.gross_skins || [];
    const netSkins = results.net_skins || [];
    const deuces = results.deuces || [];

    // Team format: use team standings instead of individual
    const isTeamFormat = (round.game_type && round.game_type !== 'individual') || round.team_mode === true;
    const teamGrossResults = results.team_gross_results || [];
    const teamNetResults = results.team_net_results || [];
    const useTeam = isTeamFormat && (teamGrossResults.length > 0 || teamNetResults.length > 0);

    // Multi-flight final results page: the final flight's results contain
    // field-wide standings + per-flight results + field prizes — label it
    // "Final Results" instead of the child round's event_name (e.g. "Flight 2
    // Day 2").
    const isFinalResultsPage = isMultiFlight && !holdMainPayouts && !!(results.field_gross_winner || results.field_net_winner || results.is_series_cumulative);
    const headerTitle = isFinalResultsPage ? 'Final Results' : (round.event_name || 'Golf Round');

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'in', format: 'letter', hotfixes: ['px_scaling'] });
    const pageWidth = 8.5;
    const pageHeight = 11;
    const margin = 0.4;

    // Fetch logo
    let logoBytes = null;
    try {
      const logoUrl = 'https://media.base44.com/images/public/69bb019558d96a11fbfbddce/189d00ac3_IMG_6860.jpg';
      const logoResponse = await fetch(logoUrl);
      const logoArrayBuffer = await logoResponse.arrayBuffer();
      logoBytes = new Uint8Array(logoArrayBuffer);
    } catch (e) {
      console.error('Failed to fetch logo:', e);
    }

    const dateStr = round.date
      ? new Date(round.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : '';

    // ── Header bar ──
    pdf.setFillColor(20, 83, 45);
    pdf.rect(0, 0, pageWidth, 0.6, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(22);
    pdf.text(headerTitle, pageWidth / 2, 0.25, { align: 'center' });
    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'normal');
    const subText = `${round.course_name || ''}${dateStr ? '  ·  ' + dateStr : ''}`;
    pdf.text(subText, pageWidth / 2, 0.45, { align: 'center' });
    if (logoBytes) {
      try { pdf.addImage(logoBytes, 'JPEG', pageWidth - 0.55, 0.1, 0.4, 0.4); } catch (e) {}
    }

    let y = 0.9;

    // Helper: section title
    const sectionTitle = (text, x, width, titleY) => {
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(14);
      pdf.setTextColor(20, 83, 45);
      pdf.text(text.toUpperCase(), x, titleY);
      pdf.setDrawColor(20, 83, 45);
      pdf.setLineWidth(0.012);
      pdf.line(x, titleY + 0.04, x + width, titleY + 0.04);
      pdf.setTextColor(0, 0, 0);
    };

    // Helper: standings table (top N places)
    const drawStandings = (data, scoreKey, payoutKey, x, width, startY, isTeam) => {
      sectionTitle(isTeam ? (scoreKey === 'best_ball_gross' ? 'Team Gross Standings' : 'Team Net Standings') : (data === grossResults ? (isMultiFlight ? 'Field Gross Standings' : 'Gross Standings') : (isMultiFlight ? 'Field Net Standings' : 'Net Standings')), x, width, startY);
      let cy = startY + 0.22;
      const rowH = 0.38;
      const moneyWinners = data.filter(r => {
        if (isTeam) return r[payoutKey] > 0;
        const payout = payouts.find(p => p.player_id === r.player_id);
        return payout && payout[payoutKey] > 0;
      });
      const nameLineH = 0.17;
      for (let i = 0; i < moneyWinners.length; i++) {
        const r = moneyWinners[i];
        const payoutAmt = isTeam ? (r[payoutKey] || 0) : (payouts.find(p => p.player_id === r.player_id)?.[payoutKey] || 0);
        const score = r.disqualified ? 'DQ' : (Array.isArray(r[scoreKey]) ? r[scoreKey].reduce((a, b) => a + (Number(b) || 0), 0) : r[scoreKey]);
        const name = isTeam ? (r.team_name || '—') : (r.name || '—');

        if (isTeam) {
          // Team: name gets its own full-width line; score + payout on a line below
          const nameLines = pdf.getTextWidth(name) > width - 0.2
            ? pdf.splitTextToSize(name, width - 0.2)
            : [name];
          const dynRowH = 0.1 + nameLines.length * nameLineH + 0.2;
          pdf.setFillColor(i % 2 === 0 ? 245 : 255, i % 2 === 0 ? 245 : 255, i % 2 === 0 ? 245 : 255);
          pdf.rect(x, cy - 0.08, width, dynRowH, 'F');
          // Rank
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(14);
          pdf.setTextColor(120, 120, 120);
          pdf.text(String(r.disqualified ? '—' : i + 1), x + 0.08, cy + 0.07);
          // Name (full width, own line)
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(14);
          pdf.setTextColor(0, 0, 0);
          nameLines.forEach((line, li) => {
            pdf.text(line, x + 0.35, cy + 0.07 + li * nameLineH);
          });
          // Score + payout on the line below the name
          const subY = cy + 0.07 + nameLines.length * nameLineH + 0.04;
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(13);
          pdf.setTextColor(80, 80, 80);
          pdf.text('Score', x + 0.35, subY);
          pdf.setTextColor(0, 0, 0);
          pdf.text(String(score), x + 1.0, subY);
          if (payoutAmt > 0) {
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(14);
            pdf.setTextColor(212, 160, 23);
            pdf.text('$' + payoutAmt.toFixed(2), x + width - 0.08, subY, { align: 'right' });
            pdf.setTextColor(0, 0, 0);
          }
          cy += dynRowH;
        } else {
          // Individual: name + score + payout on a single line
          pdf.setFillColor(i % 2 === 0 ? 245 : 255, i % 2 === 0 ? 245 : 255, i % 2 === 0 ? 245 : 255);
          pdf.rect(x, cy - 0.08, width, rowH, 'F');
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(14);
          pdf.setTextColor(120, 120, 120);
          pdf.text(String(r.disqualified ? '—' : i + 1), x + 0.08, cy + 0.05);
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(14);
          pdf.setTextColor(0, 0, 0);
          const nameMaxWidth = width - 1.55;
          const displayName = pdf.getTextWidth(name) > nameMaxWidth
            ? pdf.splitTextToSize(name, nameMaxWidth)[0]
            : name;
          pdf.text(displayName, x + 0.35, cy + 0.05);
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(14);
          pdf.setTextColor(0, 0, 0);
          pdf.text(String(score), x + width - 1.05, cy + 0.05, { align: 'right' });
          if (payoutAmt > 0) {
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(14);
            pdf.setTextColor(212, 160, 23);
            pdf.text('$' + payoutAmt.toFixed(2), x + width - 0.08, cy + 0.05, { align: 'right' });
            pdf.setTextColor(0, 0, 0);
          }
          cy += rowH;
        }
      }
      return cy;
    };

    // ── Gross & Net Standings side by side ──
    const standingsWidth = (pageWidth - margin * 2 - 0.3) / 2;
    const col2X = margin + standingsWidth + 0.3;

    if (holdMainPayouts) {
      // Non-final day: the main purse is held until the final round, so don't
      // draw gross/net standings or payouts. Show a banner; side games and the
      // cumulative series scorecard follow below.
      pdf.setFillColor(230, 240, 232);
      pdf.rect(margin, y, pageWidth - margin * 2, 0.55, 'F');
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(13);
      pdf.setTextColor(20, 83, 45);
      pdf.text(`${isMultiFlight ? 'Multi-Flight Tournament' : 'Multi-Day Series'} — Main purse held until final ${pdfSeriesLabel.toLowerCase()}`, margin + 0.1, y + 0.22);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(10);
      pdf.setTextColor(80, 80, 80);
      pdf.text(`Side games (skins, KPs, deuces) settle today. ${isMultiFlight ? 'Field standings' : 'Cumulative standings'} shown below.`, margin + 0.1, y + 0.42);
      y += 0.8;
    } else if (isMultiFlight) {
      // Multi-flight: skip the combined Field Standings — per-flight results
      // (each flight's own top finishers) are shown below, followed by the
      // final payouts table which includes Field Gross/Net columns.
    } else {
      const grossEnd = useTeam
        ? drawStandings(teamGrossResults, 'best_ball_gross', 'gross_payout', margin, standingsWidth, y, true)
        : drawStandings(grossResults, 'gross_total', 'gross_payout', margin, standingsWidth, y, false);
      const netEnd = useTeam
        ? drawStandings(teamNetResults, 'best_ball_net', 'net_payout', col2X, standingsWidth, y, true)
        : drawStandings(netResults, 'net_total', 'net_payout', col2X, standingsWidth, y, false);
      y = Math.max(grossEnd, netEnd) + 0.3;
    }

    // ── Side Games ──
    // For multi-day series, render each day's side games (skins, KPs, deuces)
    // separately — labeled "Day N — Gross Skins" etc. — so prior days' results
    // appear in the PDF just as they do on the Results page.
    const buildSideGamesFor = (r: any, rResults: any, rPlayers: any[], dayPrefix: string) => {
      const sg: any[] = [];
      const rGrossSkins = rResults.gross_skins || [];
      const rNetSkins = rResults.net_skins || [];
      const rKpResults = rResults.kp_results || [];
      const rDeuces = rResults.deuces || [];
      const showG = r.gross_skins_enabled || (rResults.gross_skins_allocated_pot > 0) || (rResults.gross_skins_separate_pot > 0) || rGrossSkins.length > 0;
      const showN = r.net_skins_enabled || (rResults.net_skins_allocated_pot > 0) || (rResults.net_skins_separate_pot > 0) || rNetSkins.length > 0;
      const pfx = dayPrefix ? `${dayPrefix} ` : '';

      // Team side games: show team name as the winner instead of the individual.
      // Aggregate format keeps side games individual (no valid "team skin").
      const isTeamEvt = !!(r.game_type && r.game_type !== 'individual');
      const isAgg = r.game_type === 'team_aggregate' || (r.team_mode === true && r.team_format === 'aggregate');
      const isTeamSg = isTeamEvt && !isAgg && r.skins_team_mode !== false;
      const lastName = (name: string) => { const parts = String(name || '').trim().split(/\s+/); return parts[parts.length - 1] || ''; };
      const teamMap: Record<string, { label: string; name: string }> = {};
      if (isTeamSg && rPlayers.length > 0) {
        const teamSize = r.team_size || 2;
        const hasTags = rPlayers.some((p: any) => (p.tee_group || '').trim());
        if (hasTags) {
          const groups: Record<string, any[]> = {};
          for (const p of rPlayers) {
            const tag = (p.tee_group || '').trim();
            if (!tag) continue;
            if (!groups[tag]) groups[tag] = [];
            groups[tag].push(p);
          }
          Object.keys(groups).sort().forEach((tag, i) => {
            const lastNames = groups[tag].map((p: any) => lastName(p.name)).filter(Boolean);
            const label = lastNames.length ? lastNames.join(' / ') : `Team ${tag}`;
            groups[tag].forEach((p: any) => { teamMap[p.player_id] = { label, name: `Team ${tag}` }; });
          });
        } else {
          for (let i = 0; i < rPlayers.length; i += teamSize) {
            const members = rPlayers.slice(i, i + teamSize);
            const letter = String.fromCharCode(65 + Math.floor(i / teamSize));
            const lastNames = members.map((p: any) => lastName(p.name)).filter(Boolean);
            const label = lastNames.length ? lastNames.join(' / ') : `Team ${letter}`;
            members.forEach((p: any) => { teamMap[p.player_id] = { label, name: `Team ${letter}` }; });
          }
        }
      }
      const displayName = (playerId: string) => {
        const playerName = rPlayers.find((p: any) => p.player_id === playerId)?.name || playerId;
        if (!isTeamSg || !teamMap[playerId]) return playerName;
        return `${teamMap[playerId].label} (${playerName})`;
      };

      if (showG) sg.push({ title: `${pfx}Gross Skins`, items: rGrossSkins.map((s: any) => ({ name: s.name, hole: s.hole, value: s.value || 0, carryover_from: s.carryover_from || [], achievement: s.achievement || scoreResultLabel(s.score, r.par?.[s.hole - 1]) })) });
      if (showN) sg.push({ title: `${pfx}Net Skins`, items: rNetSkins.map((s: any) => ({ name: s.name, hole: s.hole, value: s.value || 0, carryover_from: s.carryover_from || [], achievement: s.achievement || scoreResultLabel(s.score, r.par?.[s.hole - 1]) })) });
      if (rKpResults.length > 0) {
        const perEntry = Number(rResults.kp_per_entry_amount) || 0;
        sg.push({ title: `${pfx}KP Winners`, items: rKpResults.map((kp: any) => ({ name: displayName(kp.player_id), hole: kp.hole, value: perEntry })) });
      }
      if (r.deuce_pot_enabled && rDeuces.length > 0) {
        const perDeuce = Number(rResults.deuce_per_entry_amount) || 0;
        sg.push({ title: `${pfx}Deuce Pot`, items: rDeuces.map((d: any) => ({ name: displayName(d.player_id), hole: d.hole, value: perDeuce })) });
      }
      return sg;
    };

    const sideGames: any[] = [];
    if ((round.is_multi_day || round.is_multi_flight) && seriesRoundsCache && seriesRoundsCache.length > 0) {
      const sorted = [...seriesRoundsCache].filter(Boolean).sort((a: any, b: any) => new Date(a.date) - new Date(b.date));
      // Label each round's side games using the ACTUAL flight_number and
      // day-within-flight — NOT the array index. Using the index on a hybrid
      // tournament (2 flights × 2 days = 4 rounds) produces "Flight 1..4"
      // instead of "Flight 1, Day 1" / "Flight 1, Day 2" / "Flight 2, Day 1" /
      // "Flight 2, Day 2".
      const isHybridSg = !!(round.is_multi_day && round.is_multi_flight);
      sorted.forEach((r: any) => {
        let dayPrefix: string;
        if (isHybridSg) {
          const fn = r.flight_number || 1;
          const flightRounds = sorted.filter((rr: any) => (rr.flight_number || 1) === fn)
            .sort((a: any, b: any) => new Date(a.date) - new Date(b.date));
          const dayIdx = flightRounds.findIndex((rr: any) => rr.id === r.id);
          dayPrefix = `Flight ${fn}, Day ${dayIdx + 1}`;
        } else if (round.is_multi_flight || round.series_type === 'multi_flight') {
          dayPrefix = `Flight ${r.flight_number || 1}`;
        } else {
          dayPrefix = `Day ${sorted.findIndex((rr: any) => rr.id === r.id) + 1}`;
        }
        sideGames.push(...buildSideGamesFor(r, r.results || {}, r.players || [], dayPrefix));
      });
    } else {
      sideGames.push(...buildSideGamesFor(round, results, players, ''));
    }

    // Draw side games in a 2-column grid, auto-sized to fill remaining page
    const sgWidth = (pageWidth - margin * 2 - 0.3) / 2;
    const sgColX = [margin, margin + sgWidth + 0.3];
    const colEndY = [y, y];
    sideGames.forEach((sg, i) => {
      // Pick the column that ends higher (less content so far)
      const col = colEndY[0] <= colEndY[1] ? 0 : 1;
      const sgX = sgColX[col];
      const sgY = colEndY[col];

      if (sgY > pageHeight - 1.0) return; // skip if off page

      sectionTitle(sg.title, sgX, sgWidth, sgY);
      let cy = sgY + 0.22;
      sg.items.slice(0, 12).forEach((s, j) => {
        const hasCarry = s.carryover_from && s.carryover_from.length > 0;
        const achievementLabel = s.achievement;
        // Full winner name wraps on top; hole + amount render underneath the name
        const name = (s.name || '');
        const nameMaxWidth = sgWidth - 0.1;
        const nameLines = pdf.getTextWidth(name) > nameMaxWidth
          ? pdf.splitTextToSize(name, nameMaxWidth)
          : [name];
        const nameLineH = 0.18;
        const holeText = achievementLabel ? `Hole ${s.hole} — ${achievementLabel}` : `Hole ${s.hole}`;
        const subText = hasCarry
          ? `${holeText} (carries ${s.carryover_from.join(', ')})`
          : holeText;
        const subLines = hasCarry
          ? pdf.splitTextToSize(subText, sgWidth - 1.1)
          : [subText];
        const rowH = 0.1 + nameLines.length * nameLineH + subLines.length * 0.18 + 0.08;
        pdf.setFillColor(j % 2 === 0 ? 245 : 255, j % 2 === 0 ? 245 : 255, j % 2 === 0 ? 245 : 255);
        pdf.rect(sgX, cy - 0.04, sgWidth, rowH, 'F');
        // Name (top, full)
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(14);
        pdf.setTextColor(0, 0, 0);
        nameLines.forEach((line, li) => {
          pdf.text(line, sgX + 0.05, cy + 0.08 + li * nameLineH);
        });
        // Hole + amount underneath the name
        const subY = cy + 0.08 + nameLines.length * nameLineH + 0.04;
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(14);
        pdf.setTextColor(100, 100, 100);
        subLines.forEach((line, li) => {
          pdf.text(line, sgX + 0.05, subY + li * 0.18);
        });
        pdf.setTextColor(0, 0, 0);
        if (s.value > 0) {
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(14);
          pdf.setTextColor(212, 160, 23);
          pdf.text('$' + s.value.toFixed(2), sgX + sgWidth - 0.05, subY, { align: 'right' });
          pdf.setTextColor(0, 0, 0);
        }
        cy += rowH;
      });
      if (sg.items.length === 0) {
        const emptyRowH = 0.28;
        pdf.setFillColor(245, 245, 245);
        pdf.rect(sgX, cy - 0.06, sgWidth, emptyRowH, 'F');
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(14);
        pdf.setTextColor(150, 150, 150);
        pdf.text('None', sgX + 0.05, cy + 0.04);
        pdf.setTextColor(0, 0, 0);
        cy += emptyRowH;
      }
      colEndY[col] = cy + 0.3;
    });

    // ── Per-Flight Results (multi-flight only) ──
    // For multi-flight tournaments, show each flight's own gross/net top finishers
    // in a compact section — so the printout includes all flights' results alongside
    // the combined Field Standings above.
    // IMPORTANT: sync y to the bottom of the side-games grid first — colEndY
    // tracks each column's height, but y was last set before side games were
    // drawn, so using it directly causes the Per-Flight section to overlap the
    // side games above it.
    y = Math.max(colEndY[0], colEndY[1]) + 0.1;

    // ── Field Prizes (multi-flight only) ──
    // Highlights the Low Gross of the Field and Low Net of the Field winners,
    // mirroring the on-screen FieldPrizesCard.
    if (isMultiFlight && (results.field_gross_winner || results.field_net_winner)) {
      const fgWinner = results.field_gross_winner;
      const fnWinner = results.field_net_winner;
      const fgPrize = results.field_gross_prize || 0;
      const fnPrize = results.field_net_prize || 0;
      const neededH = 0.95;
      if (y + neededH > pageHeight - 1.0) {
        pdf.addPage();
        pdf.setFillColor(20, 83, 45); pdf.rect(0, 0, pageWidth, 0.5, 'F');
        pdf.setTextColor(255, 255, 255); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(16);
        pdf.text(`${headerTitle} — Field Prizes`, pageWidth / 2, 0.32, { align: 'center' });
        pdf.setTextColor(0, 0, 0);
        y = 0.75;
      }
      const fpWidth = pageWidth - margin * 2;
      const fpColW = (fpWidth - 0.3) / 2;
      // Background box
      pdf.setFillColor(237, 246, 239);
      pdf.rect(margin, y, fpWidth, 0.85, 'F');
      // Trophy + title
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(12);
      pdf.setTextColor(20, 83, 45);
      pdf.text('Field Prizes — Best across all flights', margin + 0.1, y + 0.2);
      // Left column: Low Gross of the Field
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(10);
      pdf.setTextColor(100, 100, 100);
      pdf.text('LOW GROSS OF THE FIELD', margin + 0.1, y + 0.38);
      if (fgWinner) {
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(13);
        pdf.setTextColor(0, 0, 0);
        pdf.text(fgWinner.name || '—', margin + 0.1, y + 0.54);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(10);
        pdf.setTextColor(120, 120, 120);
        const fgSub = `${fgWinner.flight || ''}${fgWinner.gross_total != null ? ' · Score: ' + fgWinner.gross_total : ''}`;
        pdf.text(fgSub, margin + 0.1, y + 0.68);
      }
      if (fgPrize > 0) {
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(14);
        pdf.setTextColor(212, 160, 23);
        pdf.text('$' + fgPrize.toFixed(2), margin + fpColW - 0.1, y + 0.54, { align: 'right' });
      }
      // Right column: Low Net of the Field
      const rx = margin + fpColW + 0.3;
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(10);
      pdf.setTextColor(100, 100, 100);
      pdf.text('LOW NET OF THE FIELD', rx, y + 0.38);
      if (fnWinner) {
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(13);
        pdf.setTextColor(0, 0, 0);
        pdf.text(fnWinner.name || '—', rx, y + 0.54);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(10);
        pdf.setTextColor(120, 120, 120);
        const fnSub = `${fnWinner.flight || ''}${fnWinner.net_total != null ? ' · Score: ' + fnWinner.net_total : ''}`;
        pdf.text(fnSub, rx, y + 0.68);
      }
      if (fnPrize > 0) {
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(14);
        pdf.setTextColor(212, 160, 23);
        pdf.text('$' + fnPrize.toFixed(2), margin + fpWidth - 0.1, y + 0.54, { align: 'right' });
      }
      pdf.setTextColor(0, 0, 0);
      y += 1.05;
    }

    if (isMultiFlight && seriesRoundsCache && seriesRoundsCache.length > 0) {
      // Build payout lookup from combined results (all flights)
      const payoutLookup: Record<string, any> = {};
      (payouts || []).forEach((p: any) => { payoutLookup[p.player_id] = p; });

      // Build ONE block per flight (not one per round). For hybrid tournaments
      // (2 flights × 2 days = 4 series rounds), iterating over all rounds
      // produces 4 redundant blocks. Instead, deduplicate by flight_number.
      const fieldGrossId = results.field_gross_winner?.player_id;
      const fieldNetId = results.field_net_winner?.player_id;
      const isHybridPf = !!(round.is_multi_day && round.is_multi_flight);

      type FlightBlock = { label: string; course: string; fGross: any[]; fNet: any[] };
      let flightBlocks: FlightBlock[] = [];

      if (isHybridPf && Array.isArray(results.all_flight_standings) && results.all_flight_standings.length > 0) {
        // Hybrid: use all_flight_standings from the final round's saved results —
        // it has cumulative per-flight standings, and field winners + each
        // flight's gross winner are already removed from net standings.
        flightBlocks = results.all_flight_standings
          .sort((a: any, b: any) => (a.flightNumber || 0) - (b.flightNumber || 0))
          .map((fs: any) => ({
            label: `Flight ${fs.flightNumber}`,
            course: round.course_name || '',
            fGross: (fs.gross_results || []).filter((g: any) => !g.disqualified).slice(0, 3),
            fNet: (fs.net_results || []).filter((n: any) => !n.disqualified).slice(0, 3),
          }));
      } else {
        // Non-hybrid or no all_flight_standings: deduplicate by flight_number,
        // using the latest-dated round per flight.
        const flightMap: Record<string, any> = {};
        const allSorted = [...seriesRoundsCache].filter(Boolean).sort((a: any, b: any) => new Date(a.date) - new Date(b.date));
        allSorted.forEach((r: any) => {
          const fn = r.flight_number || 1;
          if (!flightMap[fn] || new Date(r.date) > new Date(flightMap[fn].date)) {
            flightMap[fn] = r;
          }
        });
        flightBlocks = Object.keys(flightMap).sort((a, b) => Number(a) - Number(b)).map(fn => {
          const r = flightMap[fn];
          const rRes: any = r.results || {};
          const fGrossAll: any[] = (r.id === round.id
            ? (rRes.flight_own_gross || [])
            : (rRes.gross_results || [])
          ).filter((g: any) => !g.disqualified && g.player_id !== fieldGrossId && g.player_id !== fieldNetId);
          const flightGrossWinnerId = fGrossAll[0]?.player_id;
          const fGross = fGrossAll.slice(0, 3);
          const fNet: any[] = (r.id === round.id
            ? (rRes.flight_own_net || [])
            : (rRes.net_results || [])
          ).filter((n: any) => !n.disqualified && n.player_id !== fieldNetId && n.player_id !== fieldGrossId && n.player_id !== flightGrossWinnerId).slice(0, 3);
          return { label: `Flight ${fn}`, course: r.course_name || '', fGross, fNet };
        });
      }

      const flightNeededH = 0.3 + flightBlocks.length * 0.45 + 0.2;
      if (y + flightNeededH > pageHeight - 1.0) {
        pdf.addPage();
        pdf.setFillColor(20, 83, 45); pdf.rect(0, 0, pageWidth, 0.5, 'F');
        pdf.setTextColor(255, 255, 255); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(16);
        pdf.text(`${headerTitle} — Per-Flight Results`, pageWidth / 2, 0.32, { align: 'center' });
        pdf.setTextColor(0, 0, 0);
        y = 0.75;
      }
      sectionTitle('Per-Flight Results', margin, pageWidth - margin * 2, y);
      y += 0.35;
      const flightColW = (pageWidth - margin * 2 - 0.3) / 2;

      flightBlocks.forEach((fb) => {
        if (fb.fGross.length === 0 && fb.fNet.length === 0) return;
        const flightBlockH = 0.35 + Math.max(fb.fGross.length, fb.fNet.length, 1) * 0.2 + 0.2;
        if (y + flightBlockH > pageHeight - 0.5) { pdf.addPage(); y = margin; }
        // Flight label
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(13);
        pdf.setTextColor(20, 83, 45);
        pdf.text(fb.label, margin + 0.05, y + 0.15);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(10);
        pdf.setTextColor(120, 120, 120);
        pdf.text(fb.course, margin + 0.05 + pdf.getTextWidth(fb.label) + 0.15, y + 0.15);
        // Gross/Net labels
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(9);
        pdf.setTextColor(150, 150, 150);
        pdf.text('Gross', margin + 0.1, y + 0.33);
        pdf.text('Net', margin + flightColW + 0.35, y + 0.33);
        // Gross top 3 — name, score, and payout amount
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(10);
        pdf.setTextColor(0, 0, 0);
        fb.fGross.forEach((g: any, gi: number) => {
          const rowY = y + 0.33 + (gi + 1) * 0.2;
          const nm = pdf.getTextWidth(g.name || '') > flightColW - 1.5 ? pdf.splitTextToSize(g.name || '', flightColW - 1.5)[0] : (g.name || '');
          pdf.text(`${gi + 1}. ${nm}`, margin + 0.1, rowY);
          const grossPay = payoutLookup[g.player_id]?.gross_payout || 0;
          if (grossPay > 0) {
            pdf.text(String(g.gross_total ?? '—'), margin + flightColW - 0.65, rowY, { align: 'right' });
            pdf.setFont('helvetica', 'bold');
            pdf.setTextColor(212, 160, 23);
            pdf.text('$' + grossPay.toFixed(2), margin + flightColW - 0.05, rowY, { align: 'right' });
            pdf.setTextColor(0, 0, 0);
          } else {
            pdf.text(String(g.gross_total ?? '—'), margin + flightColW - 0.05, rowY, { align: 'right' });
          }
        });
        // Net top 3 — name, score, and payout amount
        fb.fNet.forEach((n: any, ni: number) => {
          const rowY = y + 0.33 + (ni + 1) * 0.2;
          const nm = pdf.getTextWidth(n.name || '') > flightColW - 1.5 ? pdf.splitTextToSize(n.name || '', flightColW - 1.5)[0] : (n.name || '');
          pdf.text(`${ni + 1}. ${nm}`, margin + flightColW + 0.35, rowY);
          const netPay = payoutLookup[n.player_id]?.net_payout || 0;
          if (netPay > 0) {
            pdf.text(String(n.net_total ?? '—'), margin + flightColW * 2 + 0.3 - 0.65, rowY, { align: 'right' });
            pdf.setFont('helvetica', 'bold');
            pdf.setTextColor(212, 160, 23);
            pdf.text('$' + netPay.toFixed(2), margin + flightColW * 2 + 0.3 - 0.05, rowY, { align: 'right' });
            pdf.setTextColor(0, 0, 0);
          } else {
            pdf.text(String(n.net_total ?? '—'), margin + flightColW * 2 + 0.3 - 0.05, rowY, { align: 'right' });
          }
        });
        pdf.setTextColor(0, 0, 0);
        y += flightBlockH;
      });
      y += 0.2;
    }

    // ── Final Payouts table (mirrors on-screen PayoutTable) ──
    // For multi-flight, the Per-Flight Results section already advanced y past
    // the side games; only sync from colEndY when that section didn't run.
    if (!(isMultiFlight && seriesRoundsCache && seriesRoundsCache.length > 0)) {
      y = Math.max(colEndY[0], colEndY[1]) + 0.1;
    }
    {
      const SIDE_TYPES_PD = [
        { key: "gross_skins_payout", label: "Gross Skins" },
        { key: "net_skins_payout", label: "Net Skins" },
        { key: "kp_payout", label: "KP" },
        { key: "deuce_payout", label: "Deuce" },
      ];
      const SIDE_KEYS_PD = SIDE_TYPES_PD.map(t => t.key);
      const sideTotalPd = (dayPayouts: any[], playerId: string) => {
        const p = (dayPayouts || []).find((x: any) => x.player_id === playerId);
        if (!p) return 0;
        return SIDE_KEYS_PD.reduce((sum, k) => sum + (p[k] || 0), 0);
      };

      const isMultiDayPd = round.is_multi_day && !isMultiFlight && seriesRoundsCache && seriesRoundsCache.length > 1;
      let mainColsPd: any[] = [];
      let dayTypeColsPd: any[] = [];
      let colsPd: any[] = [];

      // Build day metadata early so the sort can rank rows by their true
      // cumulative grand total (current total_payout + prior days' side-game
      // totals), not just the current round's total_payout — otherwise players
      // whose only winnings came on a prior day sort below true $0 earners.
      let dayMetaPd: any[] = [];
      if (isMultiDayPd) {
        const sorted = ([...seriesRoundsCache!] as any[]).filter(Boolean).sort((a: any, b: any) => new Date(a.date) - new Date(b.date));
        dayMetaPd = sorted.map((r: any, i: number) => ({
          dayLabel: `${pdfSeriesLabel} ${i + 1}`,
          dayPayouts: (r.results?.payouts) || [],
          isCurrent: r.id === round.id,
        }));
      }
      const grandTotalPd = (p: any) => {
        if (isMultiDayPd) {
          let total = p.total_payout != null ? p.total_payout : 0;
          for (const d of dayMetaPd) {
            if (d.isCurrent) continue;
            total += sideTotalPd(d.dayPayouts, p.player_id);
          }
          return total;
        }
        if (holdMainPayouts) return colsPd.reduce((sum, c) => sum + (p[c.key] || 0), 0);
        return p.total_payout != null ? p.total_payout : colsPd.reduce((sum, c) => sum + (p[c.key] || 0), 0);
      };

      const allPayouts = (results.payouts || []).slice().sort((a: any, b: any) => grandTotalPd(b) - grandTotalPd(a));

      if (isMultiDayPd) {
        mainColsPd = holdMainPayouts ? [] : [
          { key: "gross_payout", label: "Gross" },
          { key: "net_payout", label: "Net" },
        ];
        for (const d of dayMetaPd) {
          for (const t of SIDE_TYPES_PD) {
            const hasValue = allPayouts.some((p: any) => {
              const pp = d.dayPayouts.find((x: any) => x.player_id === p.player_id);
              return pp && (pp[t.key] || 0) > 0;
            });
            if (hasValue) dayTypeColsPd.push({ ...d, typeKey: t.key, typeLabel: t.label });
          }
        }
      } else {
        const allCols = [
          { key: "gross_payout", label: "Gross" },
          { key: "net_payout", label: "Net" },
          { key: "field_gross_payout", label: "Field Gross" },
          { key: "field_net_payout", label: "Field Net" },
          { key: "kp_payout", label: "KP" },
          { key: "gross_skins_payout", label: "Gross Skins" },
          { key: "net_skins_payout", label: "Net Skins" },
          { key: "deuce_payout", label: "Deuce" },
        ];
        const visible = holdMainPayouts ? allCols.filter(c => c.key !== "gross_payout" && c.key !== "net_payout") : allCols;
        colsPd = visible.filter(c => allPayouts.some(p => (p[c.key] || 0) > 0));
      }

      const numDataCols = mainColsPd.length + dayTypeColsPd.length + colsPd.length;
      if (allPayouts.length > 0 && numDataCols > 0) {
        const neededH = 0.6 + 0.45 + allPayouts.length * 0.3 + 0.2;
        if (y + neededH > pageHeight - 0.5) {
          pdf.addPage();
          pdf.setFillColor(20, 83, 45); pdf.rect(0, 0, pageWidth, 0.5, 'F');
          pdf.setTextColor(255, 255, 255); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(16);
          pdf.text(isMultiFlight ? 'Tournament Final Payouts' : `${round.event_name || 'Golf Round'} — Final Payouts`, pageWidth / 2, 0.32, { align: 'center' });
          pdf.setTextColor(0, 0, 0);
          y = 0.75;
        }
        sectionTitle('Final Payouts', margin, pageWidth - margin * 2, y);
        y += 0.3;

        const nameColW = 2.2;
        const totalColW = 0.8;
        const availWidth = pageWidth - margin * 2 - nameColW - totalColW;
        const dataColW = numDataCols > 0 ? availWidth / numDataCols : 0;
        const tableX = margin;
        const headerH = 0.45;
        const rowH = 0.3;

        // Header row (two-line for per-day side game columns)
        pdf.setFillColor(230, 235, 230);
        pdf.rect(tableX, y, pageWidth - margin * 2, headerH, 'F');
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(80, 80, 80);
        pdf.setFontSize(10);
        pdf.text('Player', tableX + 0.08, y + 0.27);
        let ci = 0;
        const drawHeaderCell = (line1: string, line2: string | undefined, cx: number) => {
          pdf.setFontSize(line2 ? 8 : 9);
          if (line2) {
            pdf.text(line1, cx, y + 0.18, { align: 'center' });
            pdf.text(line2, cx, y + 0.36, { align: 'center' });
          } else {
            pdf.text(line1, cx, y + 0.27, { align: 'center' });
          }
        };
        mainColsPd.forEach((c) => { drawHeaderCell(c.label, undefined, tableX + nameColW + ci * dataColW + dataColW / 2); ci++; });
        dayTypeColsPd.forEach((d) => { drawHeaderCell(d.dayLabel, d.typeLabel, tableX + nameColW + ci * dataColW + dataColW / 2); ci++; });
        colsPd.forEach((c) => { drawHeaderCell(c.label, undefined, tableX + nameColW + ci * dataColW + dataColW / 2); ci++; });
        pdf.setFontSize(10);
        pdf.text('Total', tableX + nameColW + numDataCols * dataColW + totalColW / 2, y + 0.27, { align: 'center' });
        y += headerH;

        // Data rows
        allPayouts.forEach((p: any, ri: number) => {
          if (y > pageHeight - 0.6) { pdf.addPage(); y = margin; }
          pdf.setFillColor(ri % 2 === 0 ? 248 : 255, ri % 2 === 0 ? 248 : 255, ri % 2 === 0 ? 248 : 255);
          pdf.rect(tableX, y, pageWidth - margin * 2, rowH, 'F');
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(10);
          pdf.setTextColor(0, 0, 0);
          const nameMaxW = nameColW - 0.1;
          const nm = p.name || '';
          const displayName = pdf.getTextWidth(nm) > nameMaxW ? pdf.splitTextToSize(nm, nameMaxW)[0] : nm;
          pdf.text(displayName, tableX + 0.08, y + 0.18);
          const cellGroups: { val: number }[] = [
            ...mainColsPd.map((c) => ({ val: p[c.key] || 0 })),
            ...dayTypeColsPd.map((d) => {
              const pp = d.dayPayouts.find((x: any) => x.player_id === p.player_id);
              return { val: pp ? (pp[d.typeKey] || 0) : 0 };
            }),
            ...colsPd.map((c) => ({ val: p[c.key] || 0 })),
          ];
          cellGroups.forEach((cell, idx) => {
            const cx = tableX + nameColW + idx * dataColW + dataColW / 2;
            if (cell.val > 0) {
              pdf.setFont('helvetica', 'bold');
              pdf.setFontSize(9);
              pdf.setTextColor(212, 160, 23);
              pdf.text('$' + cell.val.toFixed(2), cx, y + 0.18, { align: 'center' });
            } else {
              pdf.setFont('helvetica', 'normal');
              pdf.setFontSize(9);
              pdf.setTextColor(200, 200, 200);
              pdf.text('—', cx, y + 0.18, { align: 'center' });
            }
          });
          const totalX = tableX + nameColW + numDataCols * dataColW + totalColW / 2;
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(11);
          pdf.setTextColor(20, 83, 45);
          pdf.text('$' + Math.round(grandTotalPd(p)), totalX, y + 0.18, { align: 'center' });
          y += rowH;
        });
        y += 0.2;
      }
    }

    // ── Series Scorecard (multi-day cumulative, appended at bottom) ──
    // Multi-flight tournaments skip this — each player plays one flight, so a
    // cumulative scorecard doesn't apply. Per-flight results are shown above.
    if (round.is_multi_day && !isMultiFlight) {

      // Reuse the series rounds already fetched for holdMainPayouts — avoids
      // a redundant API call that could fail and cause the scorecard to vanish.
      const allRoundsRaw = seriesRoundsCache || [];
      const seenIds = new Set();
      const seriesRounds = allRoundsRaw.filter(r => {
        if (seenIds.has(r.id)) return false;
        seenIds.add(r.id);
        return true;
      }).sort((a, b) => new Date(a.date) - new Date(b.date));

      // Cross-day player info (name, handicap) lets us rebuild a day's roster
      // from RoundScore records even if that day's round.players was emptied.
      const playerInfoMap: Record<string, any> = {};
      seriesRounds.forEach(r => {
        (r.players || []).forEach(p => {
          if (p?.player_id && !playerInfoMap[p.player_id]) {
            playerInfoMap[p.player_id] = { name: p.name, handicap: p.handicap, course_handicap: p.course_handicap, is_plus_handicap: p.is_plus_handicap };
          }
        });
      });
      (results.gross_results || []).forEach((gr: any) => {
        if (gr?.player_id && !playerInfoMap[gr.player_id]) playerInfoMap[gr.player_id] = { name: gr.name, handicap: 0, course_handicap: null };
      });

      // Load + merge scores for each day
      const dayData = [];
      for (const r of seriesRounds) {
        let scoreRecords: any[] = [];
        try {
          scoreRecords = await base44.asServiceRole.entities.RoundScore.filter({ round_id: r.id }, '-created_date', 200);
        } catch (e) {
          console.error('[generateResultsPdf] asServiceRole RoundScore.filter failed:', e.message);
        }
        // Fallback to user context if service role returned nothing
        if (!scoreRecords || scoreRecords.length === 0) {
          try { scoreRecords = await base44.entities.RoundScore.filter({ round_id: r.id }, '-created_date', 200); } catch (e2) {}
        }
        const scoresMap: Record<string, any[]> = {};
        scoreRecords.forEach(rs => {
          scoresMap[rs.player_id] = (rs.scores || []).map((s: any) => {
            if (s === null || s === undefined || s === '' || s === 0) return '';
            const str = String(s).trim().toUpperCase();
            return str === 'X' ? 'X' : str;
          });
        });
        let mergedPlayers = (r.players || []).map(p => ({
          ...p,
          scores: (scoresMap[p.player_id] && scoresMap[p.player_id].length > 0) ? scoresMap[p.player_id] : (p.scores || []),
        }));
        // Fallback: if this day's roster is empty OR has players with no scores
        // (round mid-save during auto-recompute), rebuild from RoundScore records
        // using player names/handicaps gathered across the series. This ensures
        // the scorecard always renders even when round.players is temporarily
        // incomplete.
        const hasValidScores = mergedPlayers.some(p => (p.scores || []).some((s: any) => s !== '' && s != null && (s === 'X' || Number(s) >= 1)));
        if (mergedPlayers.length === 0 || !hasValidScores) {
          const rebuilt = Object.keys(scoresMap).map(pid => ({
            player_id: pid,
            name: playerInfoMap[pid]?.name || pid,
            handicap: playerInfoMap[pid]?.handicap ?? 0,
            course_handicap: playerInfoMap[pid]?.course_handicap ?? null,
            is_plus_handicap: playerInfoMap[pid]?.is_plus_handicap ?? false,
            scores: scoresMap[pid],
          }));
          if (rebuilt.length > 0) mergedPlayers = rebuilt;
        }
        dayData.push({ round: r, players: mergedPlayers });
      }

      // A child round always has a parent — if the series fetch only found
      // this one round, the scorecard would render with a missing day. Mark
      // the series incomplete so this degraded PDF is never cached.
      if (round.parent_round_id && dayData.length < 2) seriesIncomplete = true;

      // ── Scoring helpers (mirrors teamScoreEngine + teamHandicap) ──
      const isX = (s: any) => String(s).toUpperCase() === 'X';
      const normScore = (s: any) => {
        if (typeof s === 'string' && s.trim().toUpperCase() === 'X') return 'X';
        return typeof s === 'number' ? s : Number(s);
      };
      const isValidScore = (s: any) => {
        if (typeof s === 'string' && s.trim().toUpperCase() === 'X') return true;
        const n = Number(s);
        return !isNaN(n) && n >= 1;
      };
      const holeStrokes = (courseHandicap: any, holeHcpIndex: number) => {
        if (courseHandicap == null || isNaN(Number(courseHandicap))) return 0;
        const ch = Number(courseHandicap);
        if (ch < 0) {
          const floored = Math.floor(Math.abs(ch));
          return holeHcpIndex > (18 - floored) ? -1 : 0;
        }
        const floored = Math.floor(ch);
        let strokes = 0;
        if (floored > 0 && holeHcpIndex <= floored) strokes += 1;
        if (floored > 18 && holeHcpIndex <= (floored - 18)) strokes += 1;
        if (floored > 36 && holeHcpIndex <= (floored - 36)) strokes += 1;
        return strokes;
      };
      const bestBallGross = (members: any[], holeIdx: number) => {
        const scores: number[] = [];
        for (const p of members) {
          const gross = normScore((p.scores || [])[holeIdx]);
          if (typeof gross === 'number' && gross > 0) scores.push(gross);
        }
        return scores.length ? Math.min(...scores) : null;
      };
      const aggregateGross = (members: any[], holeIdx: number) => {
        let sum = 0, hasScore = false;
        for (const p of members) {
          const gross = normScore((p.scores || [])[holeIdx]);
          if (typeof gross === 'number' && gross > 0) { sum += gross; hasScore = true; }
        }
        return hasScore ? sum : null;
      };
      const bestBallNet = (members: any[], holeIdx: number, hcpIndexes: number[], formula: string) => {
        const scores: number[] = [];
        for (const p of members) {
          const gross = normScore((p.scores || [])[holeIdx]);
          if (typeof gross !== 'number' || gross <= 0) continue;
          const ch = p.course_handicap != null ? Number(p.course_handicap) : null;
          let hcpVal: any = ch != null ? ch : (p.is_plus_handicap ? -Math.abs(p.handicap || 0) : Math.abs(p.handicap || 0));
          if (formula === 'combined_85') {
            hcpVal = hcpVal < 0 ? -Math.round(Math.abs(hcpVal) * 0.85) : Math.round(hcpVal * 0.85);
          }
          scores.push(gross - holeStrokes(hcpVal, hcpIndexes[holeIdx] || 0));
        }
        return scores.length ? Math.min(...scores) : null;
      };
      const computeTeamHandicap = (players: any[], formula: string) => {
        const handicaps = (players || [])
          .filter(p => p && p.course_handicap != null)
          .map(p => Number(p.course_handicap))
          .filter(n => !isNaN(n))
          .sort((a, b) => a - b);
        if (handicaps.length === 0) return null;
        const sum = handicaps.reduce((a, b) => a + b, 0);
        const count = handicaps.length;
        switch (formula) {
          case 'none': return 0;
          case 'individual': return null;
          case 'combined_avg': return Math.round(sum / count);
          case 'avg_30': return Math.round((sum / count) * 0.70);
          case 'sum': return sum;
          case 'usga_scramble': {
            let pct: number[];
            if (count >= 4) pct = [0.25, 0.20, 0.15, 0.10];
            else if (count === 3) pct = [0.30, 0.20, 0.10];
            else pct = [0.35, 0.15];
            let total = 0;
            for (let i = 0; i < count && i < pct.length; i++) total += handicaps[i] * pct[i];
            return Math.round(total);
          }
          case 'split_60_40':
            return count === 1 ? Math.round(handicaps[0] * 0.60) : Math.round(handicaps[0] * 0.60 + handicaps[count - 1] * 0.40);
          case 'split_35_15':
            return count === 1 ? Math.round(handicaps[0] * 0.35) : Math.round(handicaps[0] * 0.35 + handicaps[count - 1] * 0.15);
          case 'combined_85':
          default: return Math.round(sum * 0.85);
        }
      };
      const isSingleTeamScoreFmt = (r: any) => {
        const gt = r?.game_type;
        if (gt === 'team_scramble' || gt === 'team_chapman' || gt === 'team_6_6_6') return true;
        if (r?.team_mode === true && r?.team_format === 'scramble') return true;
        return false;
      };
      const isAggregateFmt = (r: any) => {
        const gt = r?.game_type;
        if (gt === 'team_aggregate') return true;
        if (r?.team_mode === true && r?.team_format === 'aggregate') return true;
        return false;
      };
      const buildTeams = (r: any) => {
        const allPlayers = (r.players || []).filter((p: any) => (p.scores || []).filter(isValidScore).length > 0);
        if (allPlayers.length === 0) return [];
        const teamSize = r.team_size || 2;
        const hasGroupTags = allPlayers.some((p: any) => (p.tee_group || '').trim());
        if (hasGroupTags) {
          const groups: Record<string, any[]> = {};
          for (const p of allPlayers) {
            const tag = (p.tee_group || '').trim();
            if (!tag) continue;
            if (!groups[tag]) groups[tag] = [];
            groups[tag].push(p);
          }
          return Object.keys(groups).sort().map(tag => ({ team_id: tag, team_name: groups[tag].map((p: any) => p.name).join(' / '), members: groups[tag] }));
        }
        const teams: any[] = [];
        for (let i = 0; i < allPlayers.length; i += teamSize) {
          const members = allPlayers.slice(i, i + teamSize);
          const label = String.fromCharCode(65 + Math.floor(i / teamSize));
          teams.push({ team_id: `auto_${label}`, team_name: members.map((p: any) => p.name).join(' / '), members });
        }
        return teams;
      };
      const sumGross = (scoresArr: any[]) => {
        if (!scoresArr || scoresArr.some(isX)) return null;
        return scoresArr.reduce((a, s) => {
          if (s === null || s === undefined || s === '' || s === 0 || s === '0') return a;
          const n = Number(s);
          return a + (isNaN(n) ? 0 : n);
        }, 0);
      };
      const lastName = (name: string) => {
        if (!name) return '';
        const parts = String(name).trim().split(/\s+/);
        return parts[parts.length - 1];
      };

      const isTeamSeries = !!(round.game_type && round.game_type !== 'individual');
      const seriesRows: any[] = [];
      const dayPars: any[] = [];

      // Build seriesRows from SAVED RESULTS only — the auto-recompute on the
      // Results page always saves team_gross_results / team_net_results (or
      // gross_results / net_results for individual), so this is always
      // available and immune to the data race where round.players is
      // temporarily missing scores during a recompute.
      //
      // IMPORTANT: the final round's saved results contain CUMULATIVE series
      // totals (computed by computeTeamSeriesResults), not per-day scores.
      // So for the final round we subtract previous days' totals to get the
      // per-day value, and use the cumulative value directly as the series
      // total instead of accumulating.
      const childRounds = seriesRounds.filter((r: any) => r.parent_round_id);
      const finalRoundId = childRounds.length > 0
        ? [...childRounds].sort((a: any, b: any) => new Date(b.date) - new Date(a.date))[0].id
        : null;

      dayData.forEach(({ round: r }) => {
        const rResults: any = r.results || {};
        const isFinalRound = r.id === finalRoundId;
        // Only subtract previous days if the saved results are actually cumulative
        // (computeTeamSeriesResults sets is_series_cumulative=true). If the
        // auto-recompute failed to compute series results, the saved results stay
        // per-day and must be used directly.
        const isCumulative = isFinalRound && !!rResults.is_series_cumulative;
        if (isTeamSeries) {
          const teamGross: any[] = rResults.team_gross_results || [];
          const teamNet: any[] = rResults.team_net_results || [];
          teamGross.forEach((tg: any) => {
            const tn = teamNet.find((t: any) => t.team_name === tg.team_name) || {};
            let row = seriesRows.find(s => s.team_id === tg.team_name);
            if (!row) {
              row = { team_id: tg.team_name, label: tg.team_name || '—', subLabel: '', dayGross: {}, dayNet: {}, seriesGross: 0, seriesNet: 0, hasAny: false };
              seriesRows.push(row);
            }
            const savedGross = tg.best_ball_gross ?? tg.gross_total ?? null;
            const savedNet = tn.best_ball_net ?? tn.net_total ?? null;
            if (isCumulative && savedGross != null) {
              const prevGross = Object.values(row.dayGross).reduce((a: number, g: any) => a + (g || 0), 0);
              const prevNet = Object.values(row.dayNet).reduce((a: number, n: any) => a + (n || 0), 0);
              row.dayGross[r.id] = savedGross - prevGross;
              row.dayNet[r.id] = savedNet != null ? savedNet - prevNet : null;
              row.seriesGross = savedGross;
              if (savedNet != null) row.seriesNet = savedNet;
              row.hasAny = true;
            } else {
              row.dayGross[r.id] = savedGross;
              row.dayNet[r.id] = savedNet;
              if (savedGross != null) { row.seriesGross += savedGross; row.hasAny = true; }
              if (savedNet != null) row.seriesNet += savedNet;
            }
          });
        } else {
          const grossResults: any[] = rResults.gross_results || [];
          const netResults: any[] = rResults.net_results || [];
          grossResults.forEach((gr: any) => {
            const nr = netResults.find((n: any) => n.player_id === gr.player_id) || {};
            let row = seriesRows.find(s => s.player_id === gr.player_id);
            if (!row) {
              row = { player_id: gr.player_id, label: gr.name || gr.player_id, subLabel: '', dayGross: {}, dayNet: {}, seriesGross: 0, seriesNet: 0, hasAny: false };
              seriesRows.push(row);
            }
            const savedGross = gr.gross_total ?? null;
            const savedNet = nr.net_total ?? null;
            if (isCumulative && savedGross != null) {
              const prevGross = Object.values(row.dayGross).reduce((a: number, g: any) => a + (g || 0), 0);
              const prevNet = Object.values(row.dayNet).reduce((a: number, n: any) => a + (n || 0), 0);
              row.dayGross[r.id] = savedGross - prevGross;
              row.dayNet[r.id] = savedNet != null ? savedNet - prevNet : null;
              row.seriesGross = savedGross;
              if (savedNet != null) row.seriesNet = savedNet;
              row.hasAny = true;
            } else {
              row.dayGross[r.id] = savedGross;
              row.dayNet[r.id] = savedNet;
              if (savedGross != null) { row.seriesGross += savedGross; row.hasAny = true; }
              if (savedNet != null) row.seriesNet += savedNet;
            }
          });
        }
        const totalPar = (r.par || []).reduce((a: number, b: number) => a + (b || 0), 0);
        dayPars.push({ roundId: r.id, totalPar, dateLabel: r.date ? new Date(r.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '' });
      });

      // Fallback: if saved results produced no rows with data (e.g., auto-recompute
      // temporarily saved empty team_gross_results during a refresh), compute from
      // live scores loaded above. The scoring helpers are already defined.
      if (seriesRows.length === 0 || seriesRows.every((r: any) => !r.hasAny)) {
        console.log('[generateResultsPdf] Saved results empty — falling back to live scores');
        seriesRows.length = 0;
        dayData.forEach(({ round: r, players: dayPlayers }) => {
          const hcpIndexes = r.hole_handicap_indexes || [];
          const formula = r.hcp_formula || 'combined_85';
          if (isTeamSeries) {
            const teams = buildTeams({ ...r, players: dayPlayers });
            teams.forEach((team: any) => {
              let row = seriesRows.find(s => s.team_id === team.team_id);
              if (!row) {
                row = { team_id: team.team_id, label: team.team_name, subLabel: '', dayGross: {}, dayNet: {}, seriesGross: 0, seriesNet: 0, hasAny: false };
                seriesRows.push(row);
              }
              let dayGross = 0, dayNet = 0, hasGross = false, hasNet = false;
              const singleTeam = isSingleTeamScoreFmt(r);
              const agg = isAggregateFmt(r);
              for (let h = 0; h < 18; h++) {
                const holeGross = agg ? aggregateGross(team.members, h) : bestBallGross(team.members, h);
                if (holeGross != null) { dayGross += holeGross; hasGross = true; }
                if (!singleTeam && !agg) {
                  const holeNet = bestBallNet(team.members, h, hcpIndexes, formula);
                  if (holeNet != null) { dayNet += holeNet; hasNet = true; }
                }
              }
              if (singleTeam && hasGross) {
                const th = computeTeamHandicap(team.members, formula);
                if (th != null) { dayNet = dayGross - th; hasNet = true; }
              }
              row.dayGross[r.id] = hasGross ? dayGross : null;
              row.dayNet[r.id] = hasNet ? dayNet : null;
              if (hasGross) { row.seriesGross += dayGross; row.hasAny = true; }
              if (hasNet) row.seriesNet += dayNet;
            });
          } else {
            dayPlayers.forEach((p: any) => {
              if ((p.scores || []).filter(isValidScore).length === 0) return;
              let row = seriesRows.find(s => s.player_id === p.player_id);
              if (!row) {
                row = { player_id: p.player_id, label: p.name || p.player_id, subLabel: '', dayGross: {}, dayNet: {}, seriesGross: 0, seriesNet: 0, hasAny: false };
                seriesRows.push(row);
              }
              const gross = sumGross(p.scores);
              let net: number | null = null;
              if (gross != null) {
                const ch = p.course_handicap != null ? Number(p.course_handicap) : (p.is_plus_handicap ? -Math.abs(p.handicap || 0) : Math.abs(p.handicap || 0));
                let netSum = 0;
                for (let h = 0; h < 18; h++) {
                  const s = normScore((p.scores || [])[h]);
                  if (typeof s !== 'number' || s <= 0) continue;
                  netSum += s - holeStrokes(ch, hcpIndexes[h] || 0);
                }
                net = netSum;
              }
              row.dayGross[r.id] = gross;
              row.dayNet[r.id] = net;
              if (gross != null) { row.seriesGross += gross; row.hasAny = true; }
              if (net != null) row.seriesNet += net;
            });
          }
        });
      }

      // Draw the series scorecard table — ALWAYS on its own dedicated page
      // so it's never obscured, pushed off-page, or hidden behind the footer.
      console.log('[generateResultsPdf] Scorecard check:', { seriesRows: seriesRows.length, dayData: dayData.length, isTeamSeries, hasAnyWithScores: seriesRows.filter(r => r.hasAny).length });
      if (seriesRows.length > 0 && dayData.length > 0) {
        // Draw the scorecard on the FIRST page whenever it fits (so it's
        // immediately visible without scrolling to page 2); only spill to a
        // new page when there isn't enough room left.
        const neededH = 0.6 + 0.3 + 0.25 + seriesRows.length * 0.3 + 0.3;
        y += 0.1;
        if (y + neededH > pageHeight - 0.5) {
          pdf.addPage();
          // Repeat the event header on the scorecard page for context
          pdf.setFillColor(20, 83, 45);
          pdf.rect(0, 0, pageWidth, 0.5, 'F');
          pdf.setTextColor(255, 255, 255);
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(16);
          // Use the anchor (parent) round's event_name for the series scorecard
          // header — the scorecard spans ALL days, so labeling it with the current
          // child round's name (e.g. "Flight 2 Day 5") is misleading. The parent
          // round holds the tournament name.
          const anchorName = (seriesRoundsCache || []).find((r: any) => !r.parent_round_id)?.event_name || round.event_name || 'Golf Round';
          pdf.text(`${anchorName} — Series Scorecard`, pageWidth / 2, 0.32, { align: 'center' });
          pdf.setTextColor(0, 0, 0);
          y = 0.75;
        }
        sectionTitle(isTeamSeries ? 'Series Scorecard (Teams)' : 'Series Scorecard', margin, pageWidth - margin * 2, y);
        y += 0.3;

        const numDays = dayData.length;
        const nameColW = 2.2;
        const totalColW = 0.8;
        const availWidth = pageWidth - margin * 2 - nameColW - totalColW;
        const dayColW = availWidth / numDays;
        const tableX = margin;

        // Header row
        pdf.setFillColor(230, 235, 230);
        pdf.rect(tableX, y, pageWidth - margin * 2, 0.3, 'F');
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(11);
        pdf.setTextColor(80, 80, 80);
        pdf.text(isTeamSeries ? 'Team' : 'Player', tableX + 0.08, y + 0.2);
        dayData.forEach(({ round: r }, di) => {
          pdf.text(dayPars[di].dateLabel, tableX + nameColW + di * dayColW + dayColW / 2, y + 0.2, { align: 'center' });
        });
        pdf.text('Total', tableX + nameColW + numDays * dayColW + totalColW / 2, y + 0.2, { align: 'center' });
        y += 0.3;

        // Par row
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(9);
        pdf.setTextColor(120, 120, 120);
        pdf.text('Par', tableX + 0.08, y + 0.18);
        dayPars.forEach((dp: any, di: number) => {
          pdf.text(String(dp.totalPar || '—'), tableX + nameColW + di * dayColW + dayColW / 2, y + 0.18, { align: 'center' });
        });
        const totalParAll = dayPars.reduce((a: number, dp: any) => a + (dp.totalPar || 0), 0);
        pdf.text(String(totalParAll), tableX + nameColW + numDays * dayColW + totalColW / 2, y + 0.18, { align: 'center' });
        y += 0.25;

        // Data rows
        seriesRows.forEach((row, ri) => {
          if (y > pageHeight - 0.6) { pdf.addPage(); y = margin; }
          pdf.setFillColor(ri % 2 === 0 ? 248 : 255, ri % 2 === 0 ? 248 : 255, ri % 2 === 0 ? 248 : 255);
          pdf.rect(tableX, y, pageWidth - margin * 2, 0.3, 'F');
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(10);
          pdf.setTextColor(0, 0, 0);
          const nameMaxW = nameColW - 0.1;
          const displayName = pdf.getTextWidth(row.label) > nameMaxW ? pdf.splitTextToSize(row.label, nameMaxW)[0] : row.label;
          pdf.text(displayName, tableX + 0.08, y + 0.15);
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(7);
          pdf.setTextColor(120, 120, 120);
          pdf.text(row.subLabel, tableX + 0.08, y + 0.25);
          // Per-day gross/net
          dayData.forEach(({ round: r }, di) => {
            const gross = row.dayGross[r.id];
            const net = row.dayNet[r.id];
            const cellX = tableX + nameColW + di * dayColW + dayColW / 2;
            if (gross != null) {
              pdf.setFont('helvetica', 'bold');
              pdf.setFontSize(10);
              pdf.setTextColor(0, 0, 0);
              pdf.text(String(gross), cellX - (net != null ? 0.12 : 0), y + 0.18, { align: net != null ? 'right' : 'center' });
              if (net != null) {
                pdf.setFont('helvetica', 'bold');
                pdf.setFontSize(10);
                pdf.setTextColor(212, 160, 23);
                pdf.text('/' + String(net), cellX + 0.02, y + 0.18, { align: 'left' });
              }
            } else {
              pdf.setFont('helvetica', 'normal');
              pdf.setFontSize(10);
              pdf.setTextColor(150, 150, 150);
              pdf.text('—', cellX, y + 0.18, { align: 'center' });
            }
          });
          // Total column
          const totalX = tableX + nameColW + numDays * dayColW + totalColW / 2;
          if (row.hasAny) {
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(11);
            pdf.setTextColor(20, 83, 45);
            pdf.text(String(row.seriesGross), totalX - (row.seriesNet > 0 ? 0.14 : 0), y + 0.18, { align: row.seriesNet > 0 ? 'right' : 'center' });
            if (row.seriesNet > 0) {
              pdf.setFont('helvetica', 'bold');
              pdf.setFontSize(11);
              pdf.setTextColor(212, 160, 23);
              pdf.text('/' + String(row.seriesNet), totalX + 0.02, y + 0.18, { align: 'left' });
            }
          } else {
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(10);
            pdf.setTextColor(150, 150, 150);
            pdf.text('—', totalX, y + 0.18, { align: 'center' });
          }
          y += 0.3;
        });
        y += 0.2;
      } else {
        // Scorecard didn't render — record diagnostics so we can see why
        const childResults: any = (seriesRounds.find((r: any) => r.id === round.id) || round).results || {};
        scorecardDiag = `seriesRoundsCache=${seriesRoundsCache?.length ?? 'null'}, seriesRounds=${seriesRounds.length}, dayData=${dayData.length}, seriesRows=${seriesRows.length}, isTeamSeries=${isTeamSeries}, childHasResults=${!!childResults}, childTeamGross=${childResults.team_gross_results?.length ?? 'null'}, childIsCumulative=${!!childResults.is_series_cumulative}`;
      }
    }

    // Never deliver a multi-day PDF missing its series scorecard — fail loudly
    // so the user simply presses Print again (the retry regenerates fresh).
    // Multi-flight: no scorecard section, so skip this check.
    if (round.is_multi_day && !isMultiFlight && (scorecardDiag || seriesIncomplete)) {
      console.error('[generateResultsPdf] Refusing to deliver PDF without scorecard:', scorecardDiag || 'series incomplete');
      return Response.json({ error: 'Scorecard data was temporarily unavailable — please press Print Results again.' }, { status: 503 });
    }

    // Footer
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(14);
    pdf.setTextColor(180, 180, 180);
    const genStamp = new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    pdf.text('Swift Score Golf · Generated ' + genStamp, pageWidth / 2, pageHeight - 0.2, { align: 'center' });

    // Upload to storage and return a hosted URL (data URLs don't work reliably on iOS)
    const pdfArrayBuffer = pdf.output('arraybuffer');
    const pdfBlob = new Blob([pdfArrayBuffer], { type: 'application/pdf' });
    const file = new File([pdfBlob], `results-${round.event_name || 'golf'}.pdf`, { type: 'application/pdf' });
    const uploadRes = await base44.asServiceRole.integrations.Core.UploadFile({ file });

    // Final safety net: for multi-day series, verify the UPLOADED file's bytes
    // actually contain the scorecard before delivering it to the user. If not,
    // fail loudly so a re-press regenerates fresh — never hand out a broken PDF.
    // Multi-flight: no scorecard section, so skip verification.
    if (round.is_multi_day && !isMultiFlight) {
      const verified = await pdfHasScorecard(uploadRes.file_url);
      if (!verified) {
        console.error('[generateResultsPdf] Uploaded PDF failed scorecard verification — refusing delivery');
        return Response.json({ error: 'Scorecard data was temporarily unavailable — please press Print Results again.' }, { status: 503 });
      }
    }

    // Cache the PDF URL — but only when the scorecard actually rendered (for
    // multi-day series). A broken PDF (missing scorecard) is never cached so
    // the next press retries fresh instead of locking in the failure.
    const shouldCache = !round.is_multi_day || isMultiFlight || (!scorecardDiag && !seriesIncomplete);
    if (shouldCache) {
      try {
        await base44.asServiceRole.entities.Round.update(roundId, { results_pdf_url: uploadRes.file_url });
      } catch (e) { /* non-fatal — PDF still returned below */ }
    }

    return Response.json({
      url: uploadRes.file_url,
      filename: `results-${round.event_name || 'golf'}.pdf`,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
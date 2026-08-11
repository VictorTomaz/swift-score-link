import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

/**
 * Returns every round in a multi-day series (parent + all children) for a
 * given round. Uses the user-context get (with retries) for the initial
 * round so RLS is enforced by the database, then the service role for the
 * rest of the series (reliable). Mirrors the proven pattern from
 * generateResultsPdf.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const roundId = body?.roundId;
    if (!roundId) return Response.json({ error: 'roundId required' }, { status: 400 });

    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

    // Fetch the requested round via user context (enforces RLS via the DB),
    // with retries to ride out the intermittent empty/404 that blanks the
    // scorecard on repeated refreshes.
    let round = null;
    for (let attempt = 1; attempt <= 3 && !round; attempt++) {
      try { round = await base44.entities.Round.get(roundId); } catch (e) { /* retry */ }
      if (!round) await sleep(150);
    }
    if (!round) return Response.json({ error: 'Round not found' }, { status: 404 });

    if (!round.is_multi_day && !round.is_multi_flight) return Response.json({ rounds: [round] });

    const anchorId = round.parent_round_id || round.id;

    // Anchor round (the parent) via service role — most reliable single fetch.
    // Fall back to user context if the service-role get errors.
    let anchorRound = round;
    if (anchorId !== round.id) {
      try { anchorRound = await base44.asServiceRole.entities.Round.get(anchorId); }
      catch (e) {
        try { anchorRound = await base44.entities.Round.get(anchorId); }
        catch (e2) { anchorRound = null; }
      }
      if (!anchorRound) anchorRound = round;
    }

    // Children of the series via service role, with retries to ride out any
    // transient empty results. Fall back to user-context filter if the service
    // role keeps returning empty (it intermittently fails in the Deno runtime).
    let children = [];
    for (let attempt = 1; attempt <= 3 && children.length === 0; attempt++) {
      try {
        const res = await base44.asServiceRole.entities.Round.filter(
          { parent_round_id: anchorId }, '-created_date', 200
        );
        if (res && res.length > 0) children = res;
      } catch (e) { /* retry */ }
      if (children.length === 0) await sleep(120);
    }
    // Service-role failed — try user context as a last resort.
    if (children.length === 0) {
      try {
        const res = await base44.entities.Round.filter(
          { parent_round_id: anchorId }, '-created_date', 200
        );
        if (res && res.length > 0) children = res;
      } catch (e) { /* give up */ }
    }

    let allSeries = [anchorRound, ...children].filter(Boolean);
    if (!allSeries.find(r => r.id === round.id)) allSeries.push(round);
    const seen = new Set();
    allSeries = allSeries.filter(r => (seen.has(r.id) ? false : (seen.add(r.id), true)))
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    return Response.json({ rounds: allSeries });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();
    const { data, event } = payload;

    // Only fix CUSTOM game mode rounds with deuce pot enabled
    if (data.game_mode !== 'CUSTOM' || !data.deuce_pot_enabled) {
      return Response.json({ status: 'skipped', reason: 'not applicable' });
    }

    const results = data.results || {};
    const deuces = results.deuces || [];
    const deucePot = results.deuce_pot || 0;
    const currentPerEntry = results.deuce_per_entry_amount;

    // Already correct — skip (prevents infinite update loop)
    if (currentPerEntry && currentPerEntry > 0) {
      return Response.json({ status: 'skipped', reason: 'already correct' });
    }

    // No deuces to fix
    if (deuces.length === 0 || deucePot === 0) {
      return Response.json({ status: 'skipped', reason: 'no deuces or pot' });
    }

    const perDeuceAmount = deucePot / deuces.length;
    const roundId = event.entity_id;

    // Merge into existing results (don't overwrite other fields)
    const rounds = await base44.asServiceRole.entities.Round.filter({ id: roundId });
    const round = rounds[0];
    if (!round) return Response.json({ status: 'error', reason: 'round not found' }, { status: 404 });

    const updatedResults = { ...round.results, deuce_per_entry_amount: perDeuceAmount };
    await base44.asServiceRole.entities.Round.update(roundId, { results: updatedResults });

    return Response.json({ status: 'fixed', perDeuceAmount, roundId });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
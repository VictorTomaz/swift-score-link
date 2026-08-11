import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const oldEmails = ['reallithotripsy@outlook.com', 'swiftscoregolf@gmail.com'];
    const newEmail = 'm7fzk4p8ww@privaterelay.appleid.com';
    const newUserId = '6a3d21ac633c14bd195cc137';

    let totalUpdated = 0;
    let hasMore = true;
    let batches = 0;

    while (hasMore && batches < 100) {
      const result = await base44.asServiceRole.entities.RoundScore.updateMany(
        { created_by: { $in: oldEmails } },
        { $set: { created_by: newEmail, created_by_id: newUserId } }
      );
      totalUpdated += result.updated || 0;
      hasMore = result.has_more;
      batches++;
      if (hasMore) await new Promise(r => setTimeout(r, 2000));
    }

    return Response.json({ success: true, totalUpdated, batches });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
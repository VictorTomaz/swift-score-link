import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Delete all user's rounds
    const rounds = await base44.asServiceRole.entities.Round.filter({ created_by: user.email });
    for (const round of rounds) {
      await base44.asServiceRole.entities.Round.delete(round.id);
    }

    // Delete all user's players
    const players = await base44.asServiceRole.entities.Player.filter({ created_by: user.email });
    for (const player of players) {
      await base44.asServiceRole.entities.Player.delete(player.id);
    }

    // Delete all user's courses
    const courses = await base44.asServiceRole.entities.Course.filter({ created_by: user.email });
    for (const course of courses) {
      await base44.asServiceRole.entities.Course.delete(course.id);
    }

    // Delete the user account itself
    await base44.asServiceRole.entities.User.delete(user.id);

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
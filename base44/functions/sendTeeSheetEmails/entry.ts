import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { round_id } = body;
    if (!round_id) return Response.json({ error: 'round_id is required' }, { status: 400 });

    const round = await base44.entities.Round.get(round_id);
    if (!round) return Response.json({ error: 'Round not found' }, { status: 404 });

    const players = round.players || [];
    const dateStr = round.date ? round.date.replace(/-/g, '/') : '';

    // Build the full tee sheet once — same content for every player
    const assignedPlayers = players.filter((p) => p.tee_time);
    const teeTimeGroups = {};
    for (const p of assignedPlayers) {
      if (!teeTimeGroups[p.tee_time]) teeTimeGroups[p.tee_time] = [];
      teeTimeGroups[p.tee_time].push(p.name);
    }
    const sortedTimes = Object.keys(teeTimeGroups).sort();
    const sheetLines = [];
    for (const time of sortedTimes) {
      sheetLines.push(`${time}  —  ${teeTimeGroups[time].join(', ')}`);
    }
    const teeSheetText = sheetLines.length
      ? sheetLines.join('\n')
      : 'No tee times assigned yet.';

    let sent = 0;
    let skipped = 0;
    const errors = [];

    for (const p of assignedPlayers) {
      let email = null;
      if (p.player_id) {
        try {
          const player = await base44.entities.Player.get(p.player_id);
          if (player && player.email) email = player.email;
        } catch { /* ignore lookup errors */ }
      }

      if (!email) { skipped++; continue; }

      const subject = `Tee Sheet – ${round.event_name}`;

      const teeSheetRows = sortedTimes.map((time) => {
        const names = teeTimeGroups[time].join(', ');
        const highlight = time === p.tee_time;
        return `<tr>
          <td style="padding:10px 16px;border-bottom:1px solid #f0f0f0;${highlight ? 'background:#16a343;color:#fff;font-weight:700;' : 'background:#fff;'}font-size:15px;white-space:nowrap;">${time}</td>
          <td style="padding:10px 16px;border-bottom:1px solid #f0f0f0;${highlight ? 'background:#16a343;color:#fff;font-weight:700;' : 'background:#fff;'}font-size:15px;">${names}</td>
        </tr>`;
      }).join('');

      const dateFormatted = round.date
        ? new Date(round.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
        : '';

      const emailBody = `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:24px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <!-- Header -->
        <tr>
          <td style="background:#14532d;padding:24px 32px;text-align:center;">
            <div style="font-size:20px;font-weight:700;color:#ffffff;letter-spacing:0.5px;">Swift Score Golf</div>
            <div style="font-size:13px;color:#a7f3d0;margin-top:4px;text-transform:uppercase;letter-spacing:1px;">Tee Sheet</div>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:28px 32px;">
            <p style="margin:0 0 6px;font-size:18px;font-weight:600;color:#1a1a1a;">Hi ${p.name},</p>
            <p style="margin:0 0 20px;font-size:15px;color:#555;line-height:1.5;">
              Here is the full tee sheet for <strong style="color:#14532d;">${round.event_name}</strong>${round.course_name ? ' at ' + round.course_name : ''}${dateFormatted ? ' on ' + dateFormatted : ''}.
            </p>

            <!-- Your tee time callout -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
              <tr>
                <td style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:8px;padding:14px 16px;text-align:center;">
                  <div style="font-size:12px;color:#15803d;text-transform:uppercase;letter-spacing:1px;font-weight:600;">Your Tee Time</div>
                  <div style="font-size:26px;font-weight:800;color:#14532d;margin-top:2px;">${p.tee_time}</div>
                </td>
              </tr>
            </table>

            <!-- Tee sheet table -->
            <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
              <thead>
                <tr style="background:#14532d;">
                  <th style="padding:10px 16px;text-align:left;font-size:12px;color:#a7f3d0;text-transform:uppercase;letter-spacing:1px;">Time</th>
                  <th style="padding:10px 16px;text-align:left;font-size:12px;color:#a7f3d0;text-transform:uppercase;letter-spacing:1px;">Players</th>
                </tr>
              </thead>
              <tbody>${teeSheetRows}</tbody>
            </table>

            <p style="margin:24px 0 0;font-size:15px;color:#555;">Good luck and play well!</p>
            <p style="margin:4px 0 0;font-size:15px;color:#1a1a1a;font-weight:600;">– Swift Score Golf</p>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:#f9fafb;padding:16px 32px;border-top:1px solid #f0f0f0;text-align:center;">
            <p style="margin:0;font-size:12px;color:#999;">If you'd like to unsubscribe and stop receiving these emails, <a href="#" style="color:#16a343;text-decoration:underline;">click here</a>.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

      try {
        await base44.integrations.Core.SendEmail({
          to: email,
          subject,
          body: emailBody,
        });
        sent++;
      } catch (e) {
        errors.push({ name: p.name, error: e.message });
      }
    }

    return Response.json({ sent, skipped, errors, total: players.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
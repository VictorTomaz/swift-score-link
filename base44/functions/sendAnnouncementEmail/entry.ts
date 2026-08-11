import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { scope, round_id, player_ids, subject, message } = body;

    if (!message || !message.trim()) {
      return Response.json({ error: 'Message is required' }, { status: 400 });
    }
    if (!scope || (scope !== 'all' && scope !== 'competition')) {
      return Response.json({ error: 'scope must be "all" or "competition"' }, { status: 400 });
    }
    if (scope === 'competition' && !round_id) {
      return Response.json({ error: 'round_id is required for competition scope' }, { status: 400 });
    }

    // Build the recipient list
    let recipients = []; // [{ name, email }]

    if (scope === 'competition') {
      const round = await base44.entities.Round.get(round_id);
      if (!round) return Response.json({ error: 'Round not found' }, { status: 404 });

      const players = round.players || [];
      for (const p of players) {
        let email = null;
        if (p.player_id) {
          try {
            const player = await base44.entities.Player.get(p.player_id);
            if (player && player.email) email = player.email;
          } catch { /* ignore lookup errors */ }
        }
        if (email) {
          recipients.push({ name: p.name || 'Player', email });
        }
      }
    } else {
      // "all" scope
      if (player_ids && player_ids.length > 0) {
        // Send to specifically selected players
        for (const pid of player_ids) {
          try {
            const player = await base44.entities.Player.get(pid);
            if (player && player.email) {
              recipients.push({ name: player.name || 'Player', email: player.email });
            }
          } catch { /* ignore lookup errors */ }
        }
      } else {
        // No selection — fetch every player the user can see (RLS-filtered)
        let skip = 0;
        const limit = 500;
        let hasMore = true;
        while (hasMore) {
          const batch = await base44.entities.Player.list('-created_date', limit, skip);
          for (const player of batch) {
            if (player.email && player.receive_email_results !== false) {
              recipients.push({ name: player.name || 'Player', email: player.email });
            }
          }
          hasMore = batch.length === limit;
          skip += limit;
        }
      }
    }

    if (recipients.length === 0) {
      return Response.json({ sent: 0, skipped: 0, message: 'No recipients with email addresses found.' });
    }

    const emailSubject = subject?.trim() || 'Swift Score Golf Announcement';
    const fromName = 'Swift Score Golf';

    let sent = 0;
    let skipped = 0;
    const errors = [];

    for (const r of recipients) {
      const emailBody = `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:24px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:#14532d;padding:24px 32px;text-align:center;">
            <div style="font-size:20px;font-weight:700;color:#ffffff;letter-spacing:0.5px;">Swift Score Golf</div>
            <div style="font-size:13px;color:#a7f3d0;margin-top:4px;text-transform:uppercase;letter-spacing:1px;">Announcement</div>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 32px;">
            <p style="margin:0 0 6px;font-size:18px;font-weight:600;color:#1a1a1a;">Hi ${r.name},</p>
            <p style="margin:0 0 20px;font-size:15px;color:#555;line-height:1.6;white-space:pre-wrap;">${message.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
            <p style="margin:24px 0 0;font-size:15px;color:#555;">Best regards,</p>
            <p style="margin:4px 0 0;font-size:15px;color:#1a1a1a;font-weight:600;">– Swift Score Golf</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

      try {
        await base44.integrations.Core.SendEmail({
          to: r.email,
          subject: emailSubject,
          body: emailBody,
          from_name: fromName,
        });
        sent++;
      } catch (e) {
        errors.push({ name: r.name, error: e.message });
        skipped++;
      }
    }

    return Response.json({ sent, skipped, errors, total: recipients.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
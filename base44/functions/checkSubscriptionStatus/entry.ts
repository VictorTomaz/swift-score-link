import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // Get user's active subscriptions
    const subscriptions = await base44.entities.Subscription.filter({ 
      user_id: user.id 
    });
    
    if (!subscriptions || subscriptions.length === 0) {
      return Response.json({ 
        hasActiveSubscription: false,
        subscription: null 
      });
    }
    
    const now = new Date();
    const activeSub = subscriptions.find(sub => {
      if (sub.status !== 'active' && sub.status !== 'trialing') return false;
      const endDate = sub.current_period_end || sub.trial_end_date;
      if (endDate) {
        return new Date(endDate) > now;
      }
      return false;
    });
    
    if (activeSub) {
      return Response.json({
        hasActiveSubscription: true,
        subscription: activeSub,
        isTrial: activeSub.is_trial_period || activeSub.status === 'trialing',
        expiresDate: activeSub.current_period_end,
      });
    }
    
    return Response.json({ 
      hasActiveSubscription: false,
      subscription: null 
    });
    
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
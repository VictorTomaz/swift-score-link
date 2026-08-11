import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import Stripe from 'npm:stripe@17.7.0';

const PRICE_MAP = {
  monthly: 'price_1TqNGqQnJlYwvWLbf7px9ict',
  yearly: 'price_1TqNGoQnJlYwvWLbqPP10gNc',
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const planType = body.plan_type;

    if (!planType || !PRICE_MAP[planType]) {
      return Response.json(
        { error: 'Invalid or missing plan_type. Use "monthly" or "yearly".' },
        { status: 400 }
      );
    }

    // Try to get the current user (app is public, so this may fail)
    let userId = null;
    let userEmail = body.user_email || null;
    try {
      const user = await base44.auth.me();
      if (user) {
        userId = user.id;
        userEmail = userEmail || user.email;
      }
    } catch (_e) {
      // Not authenticated — continue with provided email only
    }

    if (!userEmail) {
      return Response.json(
        { error: 'User email is required to start a subscription.' },
        { status: 400 }
      );
    }

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));
    const origin = body.origin || 'https://swiftscore.base44.app';

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer_email: userEmail,
      line_items: [{ price: PRICE_MAP[planType], quantity: 1 }],
      subscription_data: {
        trial_period_days: 30,
        metadata: {
          base44_user_id: userId || '',
          base44_user_email: userEmail,
          plan_type: planType,
          base44_app_id: Deno.env.get('BASE44_APP_ID') || '',
        },
      },
      metadata: {
        base44_user_id: userId || '',
        base44_user_email: userEmail,
        plan_type: planType,
        base44_app_id: Deno.env.get('BASE44_APP_ID') || '',
      },
      success_url: `${origin}/Paywall?status=success`,
      cancel_url: `${origin}/Paywall?status=cancelled`,
    });

    return Response.json({ checkout_url: session.url, session_id: session.id });
  } catch (error) {
    console.error('Stripe checkout error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
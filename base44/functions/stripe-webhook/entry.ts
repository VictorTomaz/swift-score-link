import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import Stripe from 'npm:stripe@17.7.0';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));
    const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');

    const rawBody = await req.text();
    const signature = req.headers.get('stripe-signature');

    let event;
    if (webhookSecret && signature) {
      event = await stripe.webhooks.constructEventAsync(
        rawBody,
        signature,
        webhookSecret
      );
    } else {
      event = JSON.parse(rawBody);
    }

    console.log(`Stripe webhook received: ${event.type}`);

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const metadata = session.metadata || {};
        const subMetadata = session.subscription_data?.metadata || metadata;

        const userId = metadata.base44_user_id || subMetadata.base44_user_id || '';
        const userEmail = metadata.base44_user_email || subMetadata.base44_user_email || session.customer_email || '';
        const planType = metadata.plan_type || subMetadata.plan_type || 'monthly';

        // If no user_id in metadata, try to find by email
        let resolvedUserId = userId;
        if (!resolvedUserId && userEmail) {
          try {
            const users = await base44.asServiceRole.entities.User.filter({ email: userEmail });
            if (users && users.length > 0) {
              resolvedUserId = users[0].id;
            }
          } catch (e) {
            console.error('Failed to look up user by email:', e);
          }
        }

        // Fetch the subscription to get period details
        let subData = null;
        if (session.subscription) {
          try {
            subData = await stripe.subscriptions.retrieve(session.subscription);
          } catch (e) {
            console.error('Failed to retrieve subscription:', e);
          }
        }

        const productId = subData?.items?.data?.[0]?.price?.product || '';
        const status = subData?.status || 'active';
        const isTrial = subData?.status === 'trialing';
        const currentPeriodStart = subData?.current_period_start
          ? new Date(subData.current_period_start * 1000).toISOString()
          : null;
        const currentPeriodEnd = subData?.current_period_end
          ? new Date(subData.current_period_end * 1000).toISOString()
          : null;
        const trialStart = subData?.trial_start
          ? new Date(subData.trial_start * 1000).toISOString()
          : null;
        const trialEnd = subData?.trial_end
          ? new Date(subData.trial_end * 1000).toISOString()
          : null;

        // Check if subscription record already exists
        const existing = await base44.asServiceRole.entities.Subscription.filter({
          apple_original_transaction_id: session.subscription,
        });

        const recordData = {
          user_id: resolvedUserId || '',
          product_id: productId || `swiftscore_${planType}`,
          subscription_type: planType,
          status: isTrial ? 'trialing' : status,
          trial_start_date: trialStart,
          trial_end_date: trialEnd,
          current_period_start: currentPeriodStart,
          current_period_end: currentPeriodEnd,
          apple_transaction_id: session.subscription || '',
          apple_original_transaction_id: session.subscription || '',
          is_trial_period: isTrial,
        };

        if (existing && existing.length > 0) {
          await base44.asServiceRole.entities.Subscription.update(existing[0].id, recordData);
          console.log(`Updated subscription ${existing[0].id} for user ${resolvedUserId}`);
        } else {
          await base44.asServiceRole.entities.Subscription.create(recordData);
          console.log(`Created subscription for user ${resolvedUserId}`);
        }
        break;
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object;
        const metadata = sub.metadata || {};
        const userId = metadata.base44_user_id || '';
        const userEmail = metadata.base44_user_email || '';
        const planType = metadata.plan_type || 'monthly';

        const productId = sub?.items?.data?.[0]?.price?.product || '';
        const status = sub.status;
        const isTrial = status === 'trialing';
        const currentPeriodStart = sub.current_period_start
          ? new Date(sub.current_period_start * 1000).toISOString()
          : null;
        const currentPeriodEnd = sub.current_period_end
          ? new Date(sub.current_period_end * 1000).toISOString()
          : null;

        const existing = await base44.asServiceRole.entities.Subscription.filter({
          apple_original_transaction_id: sub.id,
        });

        const recordData = {
          status: isTrial ? 'trialing' : status,
          current_period_start: currentPeriodStart,
          current_period_end: currentPeriodEnd,
          is_trial_period: isTrial,
          trial_start_date: sub.trial_start ? new Date(sub.trial_start * 1000).toISOString() : undefined,
          trial_end_date: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : undefined,
        };

        if (existing && existing.length > 0) {
          await base44.asServiceRole.entities.Subscription.update(existing[0].id, recordData);
          console.log(`Updated subscription ${existing[0].id} on sub.updated`);
        } else {
          // Resolve user by email if needed
          let resolvedUserId = userId;
          if (!resolvedUserId && userEmail) {
            try {
              const users = await base44.asServiceRole.entities.User.filter({ email: userEmail });
              if (users && users.length > 0) resolvedUserId = users[0].id;
            } catch (_e) { /* ignore */ }
          }
          await base44.asServiceRole.entities.Subscription.create({
            user_id: resolvedUserId || '',
            product_id: productId || `swiftscore_${planType}`,
            subscription_type: planType,
            status: isTrial ? 'trialing' : status,
            current_period_start: currentPeriodStart,
            current_period_end: currentPeriodEnd,
            apple_transaction_id: sub.id,
            apple_original_transaction_id: sub.id,
            is_trial_period: isTrial,
          });
          console.log(`Created subscription ${sub.id} on sub.updated`);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        const existing = await base44.asServiceRole.entities.Subscription.filter({
          apple_original_transaction_id: sub.id,
        });
        if (existing && existing.length > 0) {
          await base44.asServiceRole.entities.Subscription.update(existing[0].id, {
            status: 'cancelled',
          });
          console.log(`Cancelled subscription ${existing[0].id}`);
        }
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return Response.json({ received: true });
  } catch (error) {
    console.error('Stripe webhook error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
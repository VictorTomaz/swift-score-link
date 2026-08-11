import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { receiptData, productId } = await req.json();
    
    if (!receiptData || !productId) {
      return Response.json({ error: 'receiptData and productId required' }, { status: 400 });
    }

    // Validate receipt with Apple's servers
    // Production first; if Apple returns 21007, the receipt is from the sandbox
    // (TestFlight or local StoreKit testing) and we retry against the sandbox endpoint.
    const validationUrl = 'https://buy.itunes.apple.com/verifyReceipt';
    const sandboxUrl = 'https://sandbox.itunes.apple.com/verifyReceipt';

    const environments = [
      { url: validationUrl, isSandbox: false },
      { url: sandboxUrl, isSandbox: true },
    ];

    for (const env of environments) {
      const validationResponse = await fetch(env.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          'receipt-data': receiptData,
          'password': Deno.env.get('APPLE_SHARED_SECRET'),
        }),
      });

      const result = await validationResponse.json();

      if (result.status === 0) {
        // Valid receipt — mark which environment validated it
        const isSandbox = env.isSandbox;

        const latestReceiptInfo = result.receipt.latest_receipt_info || result.receipt.in_app || [];

        // Find the subscription matching our product
        const subscriptionInfo = latestReceiptInfo.find(
          info => info.product_id === productId
        );

        if (!subscriptionInfo) {
          return Response.json({
            valid: false,
            error: 'No active subscription found for this product',
            isSandbox,
          }, { status: 404 });
        }

        const expiresDate = new Date(subscriptionInfo.expires_date);
        const now = new Date();
        const isActive = expiresDate > now;

        // Check if in trial period
        const isTrial = subscriptionInfo.is_trial_period === 'true';
        const trialEndDate = subscriptionInfo.original_purchase_date
          ? new Date(new Date(subscriptionInfo.original_purchase_date).getTime() + (30 * 24 * 60 * 60 * 1000))
          : null;

        // Update or create subscription record
        const existingSubs = await base44.entities.Subscription.filter({
          user_id: user.id,
          product_id: productId
        });

        const subscriptionData = {
          user_id: user.id,
          product_id: productId,
          subscription_type: productId.includes('yearly') ? 'yearly' : 'monthly',
          status: isActive ? (isTrial ? 'trialing' : 'active') : 'expired',
          apple_transaction_id: subscriptionInfo.transaction_id,
          apple_original_transaction_id: subscriptionInfo.original_transaction_id,
          receipt_data: receiptData,
          is_trial_period: isTrial,
          current_period_start: new Date(subscriptionInfo.purchase_date),
          current_period_end: expiresDate,
        };

        if (isTrial) {
          subscriptionData.trial_start_date = subscriptionInfo.original_purchase_date;
          subscriptionData.trial_end_date = trialEndDate.toISOString();
        }

        let subscription;
        if (existingSubs && existingSubs.length > 0) {
          await base44.entities.Subscription.update(existingSubs[0].id, subscriptionData);
          subscription = await base44.entities.Subscription.get(existingSubs[0].id);
        } else {
          subscription = await base44.entities.Subscription.create(subscriptionData);
        }

        return Response.json({
          valid: true,
          isActive,
          isTrial,
          isSandbox,
          expiresDate: expiresDate.toISOString(),
          subscription,
        });
      } else if (result.status === 21007 && !env.isSandbox) {
        // Sandbox receipt sent to production endpoint — retry against sandbox
        continue;
      } else {
        // Other error
        return Response.json({
          valid: false,
          error: `Apple validation failed: ${result.status}`,
          isSandbox: env.isSandbox,
        }, { status: 400 });
      }
    }

    return Response.json({
      valid: false,
      error: 'Receipt validation failed',
    }, { status: 400 });
    
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
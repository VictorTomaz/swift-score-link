import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { X509Certificate } from 'node:crypto';
import { compactVerify, importX509 } from 'npm:jose';

// Apple Root CA - G3 Certificate in PEM format
// Used to anchor the trust chain of JWS payloads received from Apple StoreKit 2
const APPLE_ROOT_CA_G3 = `-----BEGIN CERTIFICATE-----
MIICQzCCAcmgAwIBAgIILcX8iNLFS5UwCgYIKoZIzj0EAwMwZzEbMBkGA1UEAwwS
QXBwbGUgUm9vdCBDQSAtIEczMSYwJAYDVQQLDB1BcHBsZSBDZXJ0aWZpY2F0aW9u
IEF1dGhvcml0eTETMBEGA1UECgwKQXBwbGUgSW5jLjELMAkGA1UEBhMCVVMwHhcN
MTQwNDMwMTgxOTA2WhcNMzkwNDMwMTgxOTA2WjBnMRswGQYDVQQDDBJBcHBsZSBS
b290IENBIC0gRzMxJjAkBgNVBAsMHUFwcGxlIENlcnRpZmljYXRpb24gQXV0aG9y
aXR5MRMwEQYDVQQKDApBcHBsZSBJbmMuMQswCQYDVQQGEwJVUzB2MBAGByqGSM49
AgEGBSuBBAAiA2IABJjpLz1AcqTtkyJygRMc3RCV8cWjTnHcFBbZDuWmBSp3ZHtf
TjjTuxxEtX/1H7YyYl3J6YRbTzBPEVoA/VhYDKX1DyxNB0cTddqXl5dvMVztK517
IDvYuVTZXpmkOlEKMaNCMEAwHQYDVR0OBBYEFLuw3qFYM4iapIqZ3r6966/ayySr
MA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/BAQDAgEGMAoGCCqGSM49BAMDA2gA
MGUCMQCD6cHEFl4aXTQY2e3v9GwOAEZLuN+yRhHFD/3meoyhpmvOwgPUnPWTxnS4
at+qIxUCMG1mihDK1A3UT82NQz60imOlM27jbdoXt2QfyFMm+YhidDkLF1vLUagM
6BgD56KyKA==
-----END CERTIFICATE-----`;

function derToPem(base64Der: string): string {
  return `-----BEGIN CERTIFICATE-----\n${base64Der}\n-----END CERTIFICATE-----`;
}

/**
 * Validates the Apple X.509 certificate chain (x5c) and verifies the JWS signature.
 * Returns the verified payload.
 */
async function verifyAppleJWS(jws: string): Promise<any> {
  const parts = jws.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid JWS token structure');
  }

  // 1. Decode header to extract x5c
  const header = JSON.parse(atob(parts[0]));
  const x5c = header.x5c;
  if (!x5c || x5c.length === 0) {
    throw new Error('x5c header missing');
  }

  // 2. Parse and verify X.509 certificate chain
  const certs = x5c.map((der: string) => {
    const pem = derToPem(der);
    return new X509Certificate(pem);
  });

  const now = new Date();

  // Validate date bounds for each certificate in the chain
  for (let i = 0; i < certs.length; i++) {
    const cert = certs[i];
    if (now < new Date(cert.validFrom) || now > new Date(cert.validTo)) {
      throw new Error(`Certificate ${i} has expired or is not yet valid`);
    }
  }

  // Verify intermediate signatures (each cert signed by the next one)
  for (let i = 0; i < certs.length - 1; i++) {
    const leaf = certs[i];
    const issuer = certs[i + 1];
    if (!leaf.verify(issuer.publicKey)) {
      throw new Error(`Certificate signature verification failed at chain index ${i}`);
    }
  }

  // Anchor the chain to the trusted Apple Root CA G3
  const lastCert = certs[certs.length - 1];
  const rootCert = new X509Certificate(APPLE_ROOT_CA_G3);

  const isSignedByRoot = lastCert.verify(rootCert.publicKey);
  const isRootItself = lastCert.publicKey.export({ type: 'spki', format: 'pem' }) === rootCert.publicKey.export({ type: 'spki', format: 'pem' });

  if (!isSignedByRoot && !isRootItself) {
    throw new Error('Certificate chain does not root to trusted Apple Root CA G3');
  }

  // 3. Import public key from leaf certificate
  const leafPem = derToPem(x5c[0]);
  const publicKey = await importX509(leafPem, header.alg || 'ES256');

  // 4. Verify JWS signature using Web Crypto / jose
  const { payload } = await compactVerify(jws, publicKey);
  
  const textDecoder = new TextDecoder();
  const jsonString = textDecoder.decode(payload);
  return JSON.parse(jsonString);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { receiptData, jwsTransaction, productId } = await req.json();
    
    if (!productId) {
      return Response.json({ error: 'productId is required' }, { status: 400 });
    }

    // --- Path A: StoreKit 2 JWS Transaction Validation ---
    if (jwsTransaction) {
      try {
        // Criptograficamente verifica a assinatura e cadeia do token JWS do StoreKit 2
        const decoded = await verifyAppleJWS(jwsTransaction);
        if (decoded.bundleId !== 'com.base69bb019558d96a11fbfbddce.app') {
          console.error('validateAppleReceipt: bundle ID mismatch, got', decoded.bundleId);
          return Response.json({ error: 'Invalid bundle ID in transaction' }, { status: 400 });
        }

        const transactionId = decoded.transactionId;
        const originalTransactionId = decoded.originalTransactionId;
        
        const expiresDateMs = decoded.expiresDate;
        const purchaseDateMs = decoded.purchaseDate || Date.now();
        
        const expiresDate = expiresDateMs ? new Date(expiresDateMs) : null;
        const purchaseDate = new Date(purchaseDateMs);
        const now = new Date();
        
        const isActive = expiresDate ? expiresDate > now : false;
        const isTrial = decoded.offerType === 1 || decoded.offerType === 2;
        const isSandbox = decoded.environment === 'Sandbox';

        const subscriptionData: any = {
          user_id: user.id,
          product_id: productId,
          subscription_type: productId.includes('yearly') ? 'yearly' : 'monthly',
          status: isActive ? (isTrial ? 'trialing' : 'active') : 'expired',
          apple_transaction_id: transactionId,
          apple_original_transaction_id: originalTransactionId,
          receipt_data: jwsTransaction,
          is_trial_period: isTrial,
          current_period_start: purchaseDate.toISOString(),
          current_period_end: expiresDate ? expiresDate.toISOString() : null,
        };

        if (isTrial && expiresDate) {
          subscriptionData.trial_start_date = purchaseDate.toISOString();
          subscriptionData.trial_end_date = expiresDate.toISOString();
        }

        const existingSubs = await base44.entities.Subscription.filter({
          user_id: user.id,
          product_id: productId
        });

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
          expiresDate: expiresDate ? expiresDate.toISOString() : null,
          subscription,
        });
      } catch (err: any) {
        console.error('validateAppleReceipt: JWS verification failed:', err.message, err.stack);
        return Response.json({ error: 'Failed to process JWS: ' + err.message }, { status: 400 });
      }
    }

    // --- Path B: Legacy StoreKit 1 Receipt Validation ---
    if (!receiptData) {
      return Response.json({ error: 'receiptData or jwsTransaction is required' }, { status: 400 });
    }

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
        const isSandbox = env.isSandbox;
        const latestReceiptInfo = result.receipt.latest_receipt_info || result.receipt.in_app || [];
        const subscriptionInfo = latestReceiptInfo.find(
          (info: any) => info.product_id === productId
        );

        if (!subscriptionInfo) {
          return Response.json({
            valid: false,
            error: 'No active subscription found for this product',
            isSandbox,
          }, { status: 404 });
        }

        const expiresDate = new Date(Number(subscriptionInfo.expires_date_ms || subscriptionInfo.expires_date));
        const now = new Date();
        const isActive = expiresDate > now;

        const isTrial = subscriptionInfo.is_trial_period === 'true';
        const trialEndDate = subscriptionInfo.original_purchase_date_ms
          ? new Date(Number(subscriptionInfo.original_purchase_date_ms) + (30 * 24 * 60 * 60 * 1000))
          : null;

        const existingSubs = await base44.entities.Subscription.filter({
          user_id: user.id,
          product_id: productId
        });

        const purchaseDate = new Date(Number(subscriptionInfo.purchase_date_ms || subscriptionInfo.purchase_date));

        const subscriptionData: any = {
          user_id: user.id,
          product_id: productId,
          subscription_type: productId.includes('yearly') ? 'yearly' : 'monthly',
          status: isActive ? (isTrial ? 'trialing' : 'active') : 'expired',
          apple_transaction_id: subscriptionInfo.transaction_id,
          apple_original_transaction_id: subscriptionInfo.original_transaction_id,
          receipt_data: receiptData,
          is_trial_period: isTrial,
          current_period_start: purchaseDate.toISOString(),
          current_period_end: expiresDate.toISOString(),
        };

        if (isTrial && trialEndDate) {
          subscriptionData.trial_start_date = new Date(Number(subscriptionInfo.original_purchase_date_ms)).toISOString();
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
        continue;
      } else {
        console.error('validateAppleReceipt: legacy verifyReceipt failed with status', result.status, 'isSandbox:', env.isSandbox);
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

  } catch (error: any) {
    console.error('validateAppleReceipt: unexpected error:', error.message, error.stack);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
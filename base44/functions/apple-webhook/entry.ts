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
  console.log('Apple Webhook: invocation received');
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const signedPayload = body.signedPayload;
    
    if (!signedPayload) {
      return Response.json({ error: 'signedPayload is required' }, { status: 400 });
    }
    
    // Decodifica e verifica criptograficamente a assinatura do payload principal (envelope)
    const notification = await verifyAppleJWS(signedPayload);
    const notificationType = notification.notificationType;
    const subtype = notification.subtype;
    const data = notification.data || {};
    
    console.log(`Apple Webhook: Received verified notification type ${notificationType} (${subtype})`);
    
    const signedTransactionInfo = data.signedTransactionInfo;
    if (!signedTransactionInfo) {
      return Response.json({ error: 'signedTransactionInfo is missing in data' }, { status: 400 });
    }
    
    // Decodifica e verifica criptograficamente a assinatura dos detalhes da transação
    const transaction = await verifyAppleJWS(signedTransactionInfo);
    const bundleId = transaction.bundleId;
    const productId = transaction.productId;
    const transactionId = transaction.transactionId;
    const originalTransactionId = transaction.originalTransactionId;
    const appAccountToken: string | undefined = transaction.appAccountToken;
    
    if (bundleId !== 'com.base69bb019558d96a11fbfbddce.app') {
      console.error('Apple Webhook: bundle ID mismatch, got', bundleId);
      try {
        await base44.asServiceRole.entities.IapErrorLog.create({ source: 'apple-webhook', path: 'webhook', error_message: `Bundle ID mismatch: ${bundleId}`, product_id: productId });
      } catch (logErr: any) { console.error('Apple Webhook: failed to write IapErrorLog:', logErr.message); }
      return Response.json({ error: 'Invalid bundle ID in webhook transaction' }, { status: 400 });
    }
    
    const expiresDateMs = transaction.expiresDate;
    const purchaseDateMs = transaction.purchaseDate || Date.now();
    const expiresDate = expiresDateMs ? new Date(expiresDateMs) : null;
    const purchaseDate = new Date(purchaseDateMs);
    const now = new Date();
    
    const isActive = expiresDate ? expiresDate > now : false;
    const isTrial = transaction.offerType === 1 || transaction.offerType === 2;
    
    let status = 'active';
    if (!isActive) {
      status = 'expired';
    } else if (isTrial) {
      status = 'trialing';
    }
    
    if (notificationType === 'REVOCATION') {
      status = 'expired';
    }
    
    // Find the right Subscription row. Prefer appAccountToken — a UUID the
    // native app derives from ITS OWN Base44 user id and attaches to the
    // purchase (see uuidFromUserId in StoreKitManager.swift / entry.ts) — over
    // apple_original_transaction_id, which belongs to the Apple ID, not our
    // user. A real user's own Apple ID is unique to them, so the two never
    // diverge in production; but a shared sandbox tester used across several
    // Base44 test accounts makes Apple report the SAME original_transaction_id
    // for all of them, and matching by it alone silently overwrote the WRONG
    // user's record (confirmed 2026-09-13: victortomaz26's purchase landed on
    // a different test account). appAccountToken disambiguates precisely.
    let existing: any[] = [];
    let matchedBy = 'none';
    if (appAccountToken) {
      existing = await base44.asServiceRole.entities.Subscription.filter({
        apple_app_account_token: appAccountToken
      });
      if (existing && existing.length > 0) matchedBy = 'appAccountToken';
    }
    if (existing.length === 0) {
      // Fallback for transactions/records that predate this fix (no token
      // stored yet) — same risk as before for those, but self-heals going
      // forward since we now always persist the token when we have one.
      const byOriginalId = await base44.asServiceRole.entities.Subscription.filter({
        apple_original_transaction_id: originalTransactionId
      });
      if (byOriginalId && byOriginalId.length > 0) {
        matchedBy = 'original_transaction_id (fallback)';
        // One Apple subscription belongs to exactly one app account: the
        // earliest row (same ownership rule as validateAppleReceipt). More than
        // one row only exists from pre-rule duplicates — always update the owner.
        existing = [...byOriginalId].sort((a: any, b: any) => String(a.created_date).localeCompare(String(b.created_date)));
        if (existing.length > 1) {
          console.error(`Apple Webhook: ${existing.length} Subscription rows share original_transaction_id ${originalTransactionId} (pre-rule duplicates); updating the owner (earliest row) ${existing[0].id}.`);
        }
      }
    }

    const recordData: any = {
      product_id: productId,
      subscription_type: productId.includes('yearly') ? 'yearly' : 'monthly',
      status: status,
      apple_transaction_id: transactionId,
      apple_original_transaction_id: originalTransactionId,
      apple_app_account_token: appAccountToken || null,
      is_trial_period: isTrial,
      current_period_start: purchaseDate.toISOString(),
      current_period_end: expiresDate ? expiresDate.toISOString() : null,
      receipt_data: signedTransactionInfo,
    };

    if (isTrial && expiresDate) {
      recordData.trial_start_date = purchaseDate.toISOString();
      recordData.trial_end_date = expiresDate.toISOString();
    }

    if (existing && existing.length > 0) {
      await base44.asServiceRole.entities.Subscription.update(existing[0].id, recordData);
      console.log(`Apple Webhook: Updated subscription ${existing[0].id} to ${status} for transaction ${transactionId} (matched by ${matchedBy})`);
    } else {
      console.log(`Apple Webhook: No existing Subscription found (appAccountToken=${appAccountToken ?? 'none'}, originalTransactionId=${originalTransactionId}) — nothing to update. This notification likely arrived before the purchasing client's own validateAppleReceipt call created the row.`);
    }
    
    return Response.json({ received: true });
  } catch (error: any) {
    console.error('Apple webhook validation error:', error.message, error.stack);
    try {
      const base44 = createClientFromRequest(req);
      await base44.asServiceRole.entities.IapErrorLog.create({ source: 'apple-webhook', path: 'unexpected', error_message: error.message });
    } catch (logErr: any) { console.error('Apple Webhook: failed to write IapErrorLog:', logErr.message); }
    return Response.json({ error: 'Signature verification or validation failed: ' + error.message }, { status: 401 });
  }
});

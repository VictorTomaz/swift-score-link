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
    
    if (bundleId !== 'com.swiftscore.golf') {
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
    
    // Encontra a assinatura existente no banco pelo originalTransactionId
    const existing = await base44.asServiceRole.entities.Subscription.filter({
      apple_original_transaction_id: originalTransactionId
    });
    
    const recordData: any = {
      product_id: productId,
      subscription_type: productId.includes('yearly') ? 'yearly' : 'monthly',
      status: status,
      apple_transaction_id: transactionId,
      apple_original_transaction_id: originalTransactionId,
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
      console.log(`Apple Webhook: Updated subscription ${existing[0].id} to ${status} for transaction ${transactionId}`);
    } else {
      console.log(`Apple Webhook: Subscription with originalTransactionId ${originalTransactionId} not found in DB.`);
    }
    
    return Response.json({ received: true });
  } catch (error: any) {
    console.error('Apple webhook validation error:', error.message);
    return Response.json({ error: 'Signature verification or validation failed: ' + error.message }, { status: 401 });
  }
});

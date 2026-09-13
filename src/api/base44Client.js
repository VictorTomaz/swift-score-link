import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';

const { token } = appParams;

// App ID / serverUrl / appBaseUrl are hardcoded (not read from appParams/env) because
// there's no .env.local in this project — leaving them as env-derived values makes
// redirectToLogin/loginWithProvider/logout build "undefined/login?..." URLs, breaking
// Google/Apple login and logout. See commit f69391c.
//
// functionsVersion is DELIBERATELY not read from appParams. Root cause of the
// intermittent "receiptData and productId required" 400 (2026-09-13): the SDK
// sends whatever appParams.functionsVersion resolves to as a
// Base44-Functions-Version header on every functions.fetch() call — and
// app-params.js persists that value into localStorage the first time it ever
// shows up in the page URL (e.g. from a Base44-hosted OAuth login redirect),
// then keeps reusing it FOREVER after, even across app updates, with no
// expiry. If that one-time value ever pointed at an old backend snapshot
// (this app's very first, pre-StoreKit-2 scaffold — confirmed by matching
// the exact error string via `git log -S`), every validateAppleReceipt call
// from that device got silently pinned to that old code: same wrong 400,
// zero server-side log trace (the old code never logged), and deterministic
// on retry (confirmed live: 3/3 attempts hit the identical stale response,
// which a random edge-cache-propagation theory would not produce). Version
// pinning make sense for Base44's own live-editing preview, never for a
// shipped native app — this always wants the latest deployed function code.
export const base44 = createClient({
  appId: '69bb019558d96a11fbfbddce',
  token,
  serverUrl: 'https://swift-score-link.base44.app',
  requiresAuth: false,
  appBaseUrl: 'https://swift-score-link.base44.app'
});

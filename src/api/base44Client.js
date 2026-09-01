import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';

const { token, functionsVersion } = appParams;

// App ID / serverUrl / appBaseUrl are hardcoded (not read from appParams/env) because
// there's no .env.local in this project — leaving them as env-derived values makes
// redirectToLogin/loginWithProvider/logout build "undefined/login?..." URLs, breaking
// Google/Apple login and logout. See commit f69391c.
export const base44 = createClient({
  appId: '69bb019558d96a11fbfbddce',
  token,
  functionsVersion,
  serverUrl: 'https://swift-score-link.base44.app',
  requiresAuth: false,
  appBaseUrl: 'https://swift-score-link.base44.app'
});

import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';

const { appId, token, functionsVersion, appBaseUrl } = appParams;

//Create a client with authentication required
export const base44 = createClient({
  appId: '69bb019558d96a11fbfbddce',
  token,
  functionsVersion,
  serverUrl: 'https://swift-score-link.base44.app',
  requiresAuth: false,
  appBaseUrl: 'https://swift-score-link.base44.app'
});

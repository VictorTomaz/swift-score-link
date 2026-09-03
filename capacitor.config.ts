import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // This must match the LIVE published app ("Swift Score Golf (App)" in App
  // Store Connect, App ID 6763093744) — not com.swiftscore.golf, which is a
  // separate, unpublished app record. See swift_score_golf_project memory
  // for how this mix-up happened.
  appId: 'com.base69bb019558d96a11fbfbddce.app',
  appName: 'Swift Score Golf',
  webDir: 'dist',
  plugins: {
    CapacitorHttp: {
      enabled: false
    }
  },
  ios: {
    contentInset: 'always'
  },
  server: {
    allowNavigation: ['swift-score-link.base44.app']
  }
};

export default config;

import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.swiftscore.golf',
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

// `cap sync` regenerates ios/App/App/capacitor.config.json's packageClassList from
// npm-packaged Capacitor plugins only (@capacitor/browser, @capacitor/app, ...).
// StoreKitPlugin is a local plugin (added directly to the App target's source, not
// an npm package) so `cap sync` has no way to discover it and always drops it,
// silently breaking the native bridge — CapacitorBridge.swift only registers
// plugins whose class name is in this list (via NSClassFromString), it does not
// scan the ObjC runtime. This script re-adds it after every sync. Idempotent.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const configPath = join(__dirname, '..', 'ios', 'App', 'App', 'capacitor.config.json');
const PLUGIN_NAME = 'StoreKitPlugin';

const config = JSON.parse(readFileSync(configPath, 'utf-8'));
config.packageClassList = config.packageClassList || [];

if (!config.packageClassList.includes(PLUGIN_NAME)) {
  config.packageClassList.push(PLUGIN_NAME);
  writeFileSync(configPath, JSON.stringify(config, null, '\t') + '\n');
  console.log(`[fix-storekit-plugin-registration] Added "${PLUGIN_NAME}" to packageClassList.`);
} else {
  console.log(`[fix-storekit-plugin-registration] "${PLUGIN_NAME}" already registered — nothing to do.`);
}

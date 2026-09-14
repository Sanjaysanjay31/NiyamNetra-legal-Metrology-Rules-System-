// ============================================================================
// withCleartextTraffic — Expo config plugin (Android only)
// ============================================================================
// The `android.usesCleartextTraffic` key was removed from the Expo app-config
// schema (SDK 54). `npx expo-doctor` fails its schema check while it is
// present, and a key the schema does not know is dropped at build time — so a
// standalone APK built against an http:// LAN backend gets Android 9+'s
// default cleartext block and every request dies with a white
// "cannot reach backend" screen.
//
// This plugin writes the flag where it now belongs: directly on the
// <application> node of AndroidManifest.xml, at prebuild / EAS-build time.
//
//   • https://niyamnetra-backend.onrender.com is unaffected — https always
//     works, cleartext or not.
//   • http://<lan-ip>:8000 needs this. Expo Go already allows cleartext (its
//     own manifest does), so only standalone APK/dev-client builds care.
//
// NOTE for a future Play Store submission: remove this plugin from app.json
// (or set the value to "false") so cleartext is blocked again — enforcement
// devices should talk to https only.
// ============================================================================
const { withAndroidManifest } = require('@expo/config-plugins');

function withCleartextTraffic(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults && cfg.modResults.manifest;
    const app = manifest && manifest.application && manifest.application[0];
    if (app) {
      app.$ = app.$ || {};
      app.$['android:usesCleartextTraffic'] = 'true';
    }
    return cfg;
  });
}

module.exports = withCleartextTraffic;

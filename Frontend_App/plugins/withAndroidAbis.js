// ============================================================================
// withAndroidAbis — Expo config plugin (Android only)
// ============================================================================
// WHY THIS EXISTS
//
// A defensive APK that has to sideload onto whatever phone a field officer owns
// was carrying every ABI React Native can build: measured on the release APK
// this project produced, the native libraries alone were
//
//     x86          22.6 MB      <- emulator/desktop only, no phone needs it
//     x86_64       22.1 MB      <- emulator/desktop only, no phone needs it
//     arm64-v8a    20.8 MB      <- every phone made in the last decade
//     armeabi-v7a  14.1 MB      <- older 32-bit phones
//
// i.e. 44.7 MB of the 93.7 MB APK was dead weight. Android's package installer
// needs room for the APK plus its own copy while installing, so on a budget
// phone with a nearly full 32/64 GB of storage — the phones most likely to be
// used in the field — the install fails with "App not installed" and no useful
// reason. Several OEM file managers also refuse or mangle very large APKs when
// they are shared over WhatsApp/Bluetooth.
//
// Dropping the two x86 ABIs keeps EVERY real phone working (arm64-v8a covers
// all current phones, armeabi-v7a the 32-bit ones) and takes the APK to about
// half its size.
//
// Emulator testing still works: set NN_BUILD_ABIS before prebuild/build, or
// leave the `development` profile in eas.json as it is (it sets the full list
// for dev-client builds).
//
//   NN_BUILD_ABIS=arm64-v8a,armeabi-v7a,x86_64  npx expo prebuild -p android
// ============================================================================
const { withGradleProperties } = require('@expo/config-plugins');

// Phones only. x86/x86_64 are emulator and ancient Intel-tablet targets.
const DEFAULT_ABIS = ['arm64-v8a', 'armeabi-v7a'];
const GRADLE_KEY = 'reactNativeArchitectures';

function abisFromEnv(env) {
  const raw = String((env && env.NN_BUILD_ABIS) || '').trim();
  if (!raw) return DEFAULT_ABIS;
  const list = raw.split(',').map((s) => s.trim()).filter(Boolean);
  return list.length > 0 ? list : DEFAULT_ABIS;
}

function withAndroidAbis(config, { env = process.env } = {}) {
  const abis = abisFromEnv(env);
  return withGradleProperties(config, (cfg) => {
    const props = cfg.modResults;
    const entry = props.find((p) => p.type === 'property' && p.key === GRADLE_KEY);
    if (entry) entry.value = abis.join(',');
    else props.push({ type: 'property', key: GRADLE_KEY, value: abis.join(',') });
    console.log(`[withAndroidAbis] building native libraries for: ${abis.join(', ')}`);
    return cfg;
  });
}

module.exports = withAndroidAbis;
module.exports.DEFAULT_ABIS = DEFAULT_ABIS;
module.exports.abisFromEnv = abisFromEnv;

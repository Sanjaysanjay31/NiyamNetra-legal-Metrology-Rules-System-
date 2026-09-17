// ============================================================================
// withAllowScreenCapture — Expo config plugin (Android only)
// ============================================================================
// WHY THIS EXISTS
//
// The SIH demo is screen-recorded, and an Android recording comes out black
// whenever the app's window carries WindowManager.LayoutParams.FLAG_SECURE.
// That flag is ACTIVITY-wide: a single library — or a single leftover call from
// an older build of this app — blacks out every frame of every screen, including
// Login, until the app is force-stopped.
//
// The JS side (hooks/useAllowScreenCapture.js) stops the app from ever setting
// the flag. This plugin removes the failure mode entirely, at the only place
// that cannot be bypassed: the Activity itself.
//
// It patches android/app/src/main/java/com/niyamnetra/app/MainActivity.kt so
// that FLAG_SECURE is cleared in onCreate (after super), on every onResume, and
// again in onWindowFocusChanged — i.e. on launch, on every return to the
// foreground, and immediately after a system dialog (the biometric app-lock
// prompt, a permission dialog) hands the window back, before the first frame is
// drawn.
//
// Idempotent: re-running prebuild will not add the block twice (marker check),
// and a `--clean` prebuild regenerates MainActivity.kt from the template and
// re-applies it.
// ============================================================================
const { withMainActivity } = require('@expo/config-plugins');

const MARKER = 'NIYAMNETRA_ALLOW_SCREEN_CAPTURE';

// A flag can be set on the window AFTER onResume has run: the biometric
// app-lock prompt (expo-local-authentication), and the OEM dialogs some MIUI /
// ColorOS builds show, go through their own window and some of them hand
// FLAG_SECURE back to the activity. onWindowFocusChanged fires when that dialog
// closes and this activity regains focus, which is the earliest moment the flag
// can be cleared again. Kept as its own marker so a project that was prebuilt
// before this addition still gets the override.
const FOCUS_MARKER = 'NIYAMNETRA_ALLOW_SCREEN_CAPTURE_FOCUS';

const IMPORT_LINE = 'import android.view.WindowManager';

// Inserted just before the `invokeDefaultOnBackPressed` doc comment, which is a
// stable anchor in Expo's MainActivity template. `onCreate` also calls the
// helper directly (belt and braces) in case a future template stops calling
// onResume for this activity.
const HELPERS = `  // ${MARKER} — begin
  // Clears FLAG_SECURE so screen recording and screenshots of this app are
  // never black. Editing? Keep the block and only change the body: the marker
  // is what makes plugins/withAllowScreenCapture.js idempotent.
  private fun allowScreenRecording() {
    try {
      window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
    } catch (e: Throwable) {
      // A missing window must never crash the demo build.
    }
  }

  override fun onResume() {
    super.onResume()
    allowScreenRecording()
  }

  // ${FOCUS_MARKER} — begin
  // Runs after any system dialog (biometric prompt, permission dialogs) hands
  // focus back, i.e. after the flag could have been set again.
  override fun onWindowFocusChanged(hasFocus: Boolean) {
    super.onWindowFocusChanged(hasFocus)
    if (hasFocus) allowScreenRecording()
  }
  // ${FOCUS_MARKER} — end
  // ${MARKER} — end
`;

// The same override, on its own, for files patched by an earlier revision of
// this plugin (the marker check below is what makes the patch idempotent, so an
// already-patched file has to be topped up in place instead of replaced).
const FOCUS_BLOCK = `  // ${FOCUS_MARKER} — begin
  // Runs after any system dialog (biometric prompt, permission dialogs) hands
  // focus back, i.e. after the flag could have been set again.
  override fun onWindowFocusChanged(hasFocus: Boolean) {
    super.onWindowFocusChanged(hasFocus)
    if (hasFocus) allowScreenRecording()
  }
  // ${FOCUS_MARKER} — end
`;

const END_MARKER_LINE = `  // ${MARKER} — end\n`;

// The template's anchor: the KDoc block above invokeDefaultOnBackPressed.
// NOTE: `[ \t]` and not `\s` — `\s` matches newlines, so it would swallow the
// blank line that separates this KDoc from the previous member (and then the
// patch would not be byte-identical to the file it is checked against).
const ANCHOR_RE = /^([ \t]*\/\*\*\n[ \t]*\* Align the back button behavior)/m;

function patchKotlin(contents) {
  // Already patched by this (or an earlier) revision: make sure the focus
  // override from the current revision is present, and change nothing else.
  if (contents.includes(MARKER)) {
    if (contents.includes(FOCUS_MARKER) || !contents.includes(END_MARKER_LINE)) return contents;
    return contents.replace(END_MARKER_LINE, `${FOCUS_BLOCK}${END_MARKER_LINE}`);
  }

  let src = contents;

  // 1. Import (only when absent — a future template may already have it).
  if (!src.includes(IMPORT_LINE)) {
    src = src.replace(/^(package\s+[^\n]+\n)/m, `$1\n${IMPORT_LINE}\n`);
  }

  // 2. Clear the flag as soon as the Activity finishes creating.
  if (src.includes('super.onCreate(null)')) {
    src = src.replace('super.onCreate(null)', 'super.onCreate(null)\n    allowScreenRecording()');
  }

  // 3. Add the helper + onResume override at the template anchor. If the anchor
  //    ever moves, fall back to inserting before the class-closing brace.
  if (ANCHOR_RE.test(src)) {
    return src.replace(ANCHOR_RE, (m) => `${HELPERS}\n${m}`);
  }
  const closingBrace = src.lastIndexOf('\n}');
  if (closingBrace === -1) return contents; // unexpected shape — leave untouched
  return `${src.slice(0, closingBrace)}\n${HELPERS}}${src.slice(closingBrace + 2)}`;
}

module.exports = function withAllowScreenCapture(config) {
  return withMainActivity(config, (cfg) => {
    // Only the Kotlin MainActivity is patched; anything else is left alone
    // rather than corrupted by a blind string edit.
    if (cfg.modResults.language !== 'kt') {
      console.warn('[withAllowScreenCapture] MainActivity is not Kotlin — skipping the native FLAG_SECURE patch.');
      return cfg;
    }
    cfg.modResults.contents = patchKotlin(cfg.modResults.contents);
    return cfg;
  });
};

// Exported so the transform can be unit-checked on its own (see the check run
// against android/.../MainActivity.kt) without a full prebuild.
module.exports.patchKotlin = patchKotlin;

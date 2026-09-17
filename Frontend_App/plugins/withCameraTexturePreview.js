// ============================================================================
// withCameraTexturePreview — Expo config plugin (Android only)
// ============================================================================
// WHY THIS EXISTS
//
// expo-camera renders its viewfinder with CameraX's PreviewView. PreviewView's
// default implementation mode is PERFORMANCE, which draws the camera feed into
// a SurfaceView — and a SurfaceView is NOT part of the activity's window
// buffer. Two things follow, and both were reported on this app:
//
//  1. SCREEN RECORDING. Android's own recorder (and the MIUI / ColorOS /
//     Funtouch recorders shipped on field phones) capture the camera pages as
//     black or as torn, noisy frames, because the composited window has no
//     camera content in it. Every non-camera page records fine — which is
//     exactly the "some pages cannot be recorded" symptom.
//
//  2. UI OVERLAYS AND CLIPPING. A SurfaceView is punched through the view
//     hierarchy into its own layer, so it ignores overflow:hidden, borderRadius
//     and z-order. The viewfinder card in InspectionSessionScreen
//     (`height: 240, overflow: 'hidden', borderRadius`) leaked outside its
//     rounded card, and the header/bracket/shutter overlays drawn on top of the
//     full-screen camera surfaces rendered UNDER the preview instead of over
//     it — the "noise in the background" of those pages.
//
// ImplementationMode.COMPATIBLE renders the same preview through a TextureView,
// which IS composited inside the app window: MediaProjection captures it, and
// React Native clips/transforms/overlays it like any other view. The cost is a
// marginally higher GPU load per preview frame; capture quality, focus, flash
// and still-image decoding are unaffected (they never used this surface).
//
// HOW
//
// PreviewView's implementation mode is not exposed by expo-camera's JS API, so
// the only place to change it is the camera view's own Kotlin source. This
// plugin edits node_modules/expo-camera/android/.../ExpoCameraView.kt during
// prebuild — i.e. after dependencies are installed and before Gradle compiles
// them — which is the same moment every other native edit in this project is
// applied (see withAllowScreenCapture, withCleartextTraffic).
//
// NOTE the android/ directory is git-ignored, so every EAS build and every
// fresh clone runs `expo prebuild` and re-applies this patch automatically.
// A dependency upgrade that renames ExpoCameraView.kt makes this plugin log a
// loud warning instead of failing the build silently.
// ============================================================================
const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('@expo/config-plugins');

const MARKER = 'NIYAMNETRA_TEXTURE_PREVIEW';

const CAMERA_VIEW_RELATIVE_PATH = path.join(
  'node_modules',
  'expo-camera',
  'android',
  'src',
  'main',
  'java',
  'expo',
  'modules',
  'camera',
  'ExpoCameraView.kt',
);

// The upstream property declaration this plugin rewrites (expo-camera 17.x).
// Byte-exact on purpose: if expo-camera changes this text the replacement is
// skipped and the build warns, rather than shipping a half-patched file.
const ANCHOR = [
  '  private var previewView = PreviewView(context).apply {',
  '    elevation = 0f',
  '  }',
].join('\n');

const PATCHED = [
  '  private var previewView = PreviewView(context).apply {',
  '    elevation = 0f',
  `    // ${MARKER} — keep the viewfinder inside the app window.`,
  '    // PERFORMANCE (the default) draws a SurfaceView: screen recorders capture',
  '    // it as black/torn, and it ignores RN clipping, border radius and z-order,',
  '    // so overlays and rounded cards render wrong. COMPATIBLE draws a',
  '    // TextureView, which is captured and clipped like every other RN view.',
  '    // Editing? Keep this block: the marker is what makes',
  '    // plugins/withCameraTexturePreview.js idempotent.',
  '    implementationMode = PreviewView.ImplementationMode.COMPATIBLE',
  '  }',
].join('\n');

/**
 * Rewrite the PreviewView declaration so the preview is a TextureView.
 * Exported so it can be checked against a file without running a prebuild.
 *
 * @param {string} contents ExpoCameraView.kt source
 * @returns {{contents: string, patched: boolean, reason?: string}}
 */
function patchCameraSource(contents) {
  if (contents.includes(MARKER)) return { contents, patched: false, reason: 'already patched' };
  if (!contents.includes(ANCHOR)) {
    return { contents, patched: false, reason: 'anchor not found (expo-camera changed its source)' };
  }
  return { contents: contents.replace(ANCHOR, PATCHED), patched: true };
}

module.exports = function withCameraTexturePreview(config) {
  return withDangerousMod(config, [
    'android',
    (cfg) => {
      const file = path.join(cfg.modRequest.projectRoot, CAMERA_VIEW_RELATIVE_PATH);
      if (!fs.existsSync(file)) {
        console.warn(
          `[withCameraTexturePreview] ${CAMERA_VIEW_RELATIVE_PATH} not found — the camera ` +
            'preview keeps CameraX\'s default SurfaceView, so camera pages may record as black.',
        );
        return cfg;
      }

      const source = fs.readFileSync(file, 'utf8');
      const { contents, patched, reason } = patchCameraSource(source);
      if (patched) {
        fs.writeFileSync(file, contents, 'utf8');
        console.log('[withCameraTexturePreview] camera preview switched to a screen-recordable TextureView.');
        return cfg;
      }
      // Idempotent prebuild (or a clean one) is the normal path — only an
      // unexpected source shape deserves a warning.
      if (reason !== 'already patched') {
        console.warn(`[withCameraTexturePreview] camera preview left unchanged: ${reason}.`);
      }
      return cfg;
    },
  ]);
};

module.exports.patchCameraSource = patchCameraSource;
module.exports.CAMERA_VIEW_RELATIVE_PATH = CAMERA_VIEW_RELATIVE_PATH;
module.exports.MARKER = MARKER;

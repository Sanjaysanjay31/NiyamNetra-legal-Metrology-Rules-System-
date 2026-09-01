// Duplicate module — NOT the implementation.
//
// Both offline/SyncProvider.js and offline/SyncProvider.jsx existed, and Metro
// resolves `./offline/SyncProvider` to the .js file (sourceExts order is
// js, jsx, json, ts, tsx). So this file was dead code that still looked live,
// and it had drifted: it posted to `/inspections/` and `/scans/`, neither of
// which the backend serves, and it exported a different context shape than
// components/SyncStrip.jsx consumes.
//
// It now re-exports the real provider, so the two can never diverge again.
// Safe to delete this file outright.
export * from './SyncProvider.js';

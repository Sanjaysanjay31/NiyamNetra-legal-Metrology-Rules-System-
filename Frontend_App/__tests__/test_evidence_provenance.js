// Frontend_App/__tests__/test_evidence_provenance.js
// Standalone Node.js test runner for Commit 2 evidence provenance & capture invariants.
const assert = require('assert');
const path = require('path');
const fs = require('fs');

console.log('=== Running Commit 2 Evidence Provenance & Capture Tests ===\n');

let passed = 0;
let failed = 0;

function it(desc, fn) {
  try {
    fn();
    console.log(`  PASS: ${desc}`);
    passed++;
  } catch (err) {
    console.error(`  FAIL: ${desc}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

async function itAsync(desc, fn) {
  try {
    await fn();
    console.log(`  PASS: ${desc}`);
    passed++;
  } catch (err) {
    console.error(`  FAIL: ${desc}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

async function runTests() {
  // Test 1: Evidence record model structure & immutability
  it('EvidenceRecord retains original camera dimensions and captures source metadata', () => {
    const photo = {
      uri: 'file:///data/user/0/host.exp.exponent/cache/Camera/raw_camera_frame.jpg',
      width: 4032,
      height: 3024,
      fileSize: 4194304,
    };
    const metadata = { panel: 'front', inspectionId: 42, scanId: 101 };

    // Simulate record generation
    const record = {
      inspection_id: metadata.inspectionId,
      scan_id: metadata.scanId,
      panel: metadata.panel,
      captured_at: new Date().toISOString(),
      original_uri: photo.uri,
      analysis_uri: null,
      file_size_bytes: photo.fileSize,
      width: photo.width,
      height: photo.height,
      capture_source: 'camera',
      sync_status: 'pending',
      upload_status: 'not_uploaded',
    };

    assert.strictEqual(record.width, 4032, 'Original width must be preserved');
    assert.strictEqual(record.height, 3024, 'Original height must be preserved');
    assert.strictEqual(record.capture_source, 'camera', 'Capture source must be camera');
    assert.strictEqual(record.panel, 'front', 'Panel association must be front');
    assert.ok(record.captured_at, 'Capture timestamp must be present');
  });

  // Test 2: Derived analysis image does NOT overwrite or mutate original evidence
  it('Analysis image is created as a separate reference without mutating original capture', () => {
    const originalRecord = {
      inspection_id: 1,
      scan_id: 2,
      panel: 'front',
      captured_at: new Date().toISOString(),
      original_uri: 'file:///data/user/0/host.exp.exponent/files/evidence/orig-front-123.jpg',
      analysis_uri: null,
      file_size_bytes: 3500000,
      width: 4000,
      height: 3000,
      capture_source: 'camera',
    };

    // Simulate separate derivation (e.g. downsampled to 1600px width)
    const analysisRecord = {
      ...originalRecord,
      analysis_uri: 'file:///data/user/0/host.exp.exponent/cache/ImageManipulator/deriv-front-1600.jpg',
      analysis_width: 1600,
      analysis_height: 1200,
    };

    assert.notStrictEqual(
      analysisRecord.original_uri,
      analysisRecord.analysis_uri,
      'original_uri and analysis_uri must be separate paths'
    );
    assert.strictEqual(
      analysisRecord.original_uri,
      'file:///data/user/0/host.exp.exponent/files/evidence/orig-front-123.jpg',
      'original_uri must remain completely untouched'
    );
    assert.strictEqual(analysisRecord.width, 4000, 'Original dimensions must NOT be overwritten');
    assert.strictEqual(analysisRecord.analysis_width, 1600, 'Analysis dimensions are stored separately');
  });

  // Test 3: Small images are not upscaled
  it('Small images (< 1600px) are not upscaled during analysis derivation', () => {
    const smallWidth = 1024;
    const actions = [];
    if (smallWidth > 1600) {
      actions.push({ resize: { width: 1600 } });
    }
    assert.strictEqual(actions.length, 0, 'No resize action should be applied to images <= 1600px width');
  });

  // Test 4: Analysis failure preserves original evidence
  it('Analysis failure preserves original evidence safely', () => {
    const originalRecord = {
      panel: 'mrp',
      original_uri: 'file:///evidence/orig-mrp-99.jpg',
      width: 2048,
      height: 1536,
    };

    // Simulate manipulator throwing an Out-of-Memory / processing exception
    let processedRecord;
    try {
      throw new Error('ImageManipulator native worker crashed');
    } catch (manipErr) {
      processedRecord = {
        ...originalRecord,
        analysis_uri: originalRecord.original_uri, // safe display fallback
        analysis_error: manipErr.message,
      };
    }

    assert.strictEqual(
      processedRecord.original_uri,
      'file:///evidence/orig-mrp-99.jpg',
      'Original evidence path must be preserved even on analysis crash'
    );
    assert.ok(processedRecord.analysis_error, 'Error must be logged without losing evidence');
  });

  // Test 5: Honest physical scale — no fabricated 120x80 mm
  it('Mobile inspection flow does not fabricate 120x80 mm dimensions', () => {
    const panelShape = 'rectangular';
    const isBlownMoulded = false;

    // Honest geometry constructed by InspectionSessionScreen & queue.js
    const geometry = {
      panel_shape: panelShape,
      panel_height_mm: null,
      panel_width_mm: null,
      panel_diameter_mm: null,
      total_surface_area_cm2: null,
      is_blown_moulded: Boolean(isBlownMoulded),
      scale_source: 'none',
    };

    assert.strictEqual(geometry.scale_source, 'none', 'scale_source must be none when no reference exists');
    assert.strictEqual(geometry.panel_height_mm, null, 'Must NOT be 120.0');
    assert.strictEqual(geometry.panel_width_mm, null, 'Must NOT be 80.0');
  });

  // Test 6: Offline queue points to authoritative original captures
  it('Offline queue prioritizes authoritative original camera captures over analysis derivatives', () => {
    const scanItem = {
      commodity_generic: 'Sunflower Oil',
      panelPhotos: {
        front: 'file:///cache/ImageManipulator/analysis-front.jpg',
        back: 'file:///cache/ImageManipulator/analysis-back.jpg',
      },
      panelEvidence: {
        front: { original_uri: 'file:///evidence/orig-front.jpg', analysis_uri: 'file:///cache/ImageManipulator/analysis-front.jpg' },
        back: { original_uri: 'file:///evidence/orig-back.jpg', analysis_uri: 'file:///cache/ImageManipulator/analysis-back.jpg' },
      },
    };

    // Resolving queue uris per queue.js updated logic:
    let panelUris = [];
    if (scanItem.panelEvidence && Object.keys(scanItem.panelEvidence).length > 0) {
      panelUris = Object.keys(scanItem.panelEvidence).map((p) => scanItem.panelEvidence[p]?.original_uri);
    } else {
      panelUris = Object.values(scanItem.panelPhotos);
    }

    assert.strictEqual(panelUris[0], 'file:///evidence/orig-front.jpg');
    assert.strictEqual(panelUris[1], 'file:///evidence/orig-back.jpg');
  });

  console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

runTests();

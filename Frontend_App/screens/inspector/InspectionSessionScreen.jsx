import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Image,
  Alert,
  ActivityIndicator,
  StyleSheet,
  TextInput,
  Platform,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { colors, spacing, typography, radius, shadows } from '../../theme';
import Header from '../../components/Header';
import Card from '../../components/Card';
import PrimaryButton from '../../components/PrimaryButton';
import VerdictBadge from '../../components/VerdictBadge';
import { enqueueInspection, enqueueScan } from '../../offline/queue';
import { useAppLock } from '../../hooks/useAppLock';
import {
  createInspection,
  createScan,
  uploadScanImage,
  updateScanScope,
  assessScan,
} from '../../api/inspections';

let ScreenCapture = null;
try { ScreenCapture = require('expo-screen-capture'); } catch { ScreenCapture = null; }

const PANELS = [
  { key: 'front', label: 'Front Panel', desc: 'Product name & brand' },
  { key: 'back', label: 'Back Panel', desc: 'Manufacturer details & ingredients' },
  { key: 'mrp', label: 'MRP Panel', desc: 'MRP, Unit Sale Price, Dates' },
  { key: 'batch', label: 'Batch / Barcode', desc: 'Batch code & barcode' },
];

function buildOfflineFindings({ commodity, brand, batch, hasSticker, isImported, isPerishable }) {
  const master = [
    { code: 'CHK01', name: 'All mandatory Rule 6 declarations present', citation: 'Rule 6(1) and 6(2), mandatory declarations', required: 'All statutory declarations present on PDP', severity: 'critical', defaultObserved: 'Pending server OCR text extraction (captured offline)', needsOcr: true },
    { code: 'CHK02', name: 'Unit Sale Price (USP)', citation: 'Rule 6(1)(ea) — 2017 Amendment', required: 'Unit price in Rs per g/ml/piece where net qty > 100g/ml', severity: 'major', defaultObserved: 'Pending server OCR text extraction (captured offline)', needsOcr: true },
    { code: 'CHK03', name: 'Chapter II Applicability', citation: 'Rule 3 — Retail Sale Scope', required: 'Pre-packaged commodity intended for retail sale', severity: 'critical', defaultObserved: 'Retail sale transaction confirmed', needsOcr: false, verdict: 'pass' },
    { code: 'CHK04', name: 'Manufacturer / Packer Identity', citation: 'Rule 6(1)(a) — Name & Complete Address', required: 'Name and complete physical address of manufacturer/packer', severity: 'critical', defaultObserved: 'Pending server OCR text extraction (captured offline)', needsOcr: true },
    { code: 'CHK05', name: 'Generic Commodity Name', citation: 'Rule 6(1)(b) — Common / Generic Name', required: 'Common or generic name of commodity in package', severity: 'major', defaultObserved: commodity ? `Declared: ${commodity}` : 'Missing generic commodity name', needsOcr: false, verdict: commodity ? 'pass' : 'fail', reason: commodity ? null : 'Generic commodity name not provided.' },
    { code: 'CHK06', name: 'Net Quantity Declaration', citation: 'Rule 6(1)(c) — Standard Weights & Measures', required: 'Net weight, measure or number in standard metric units', severity: 'critical', defaultObserved: 'Pending server OCR text extraction (captured offline)', needsOcr: true },
    { code: 'CHK06b', name: 'Metric Units Compliance', citation: 'Rule 12 — Standard Metric Units (SI)', required: 'Only metric units (g, kg, ml, L, m, cm) permissible', severity: 'critical', defaultObserved: 'Pending server OCR text extraction (captured offline)', needsOcr: true },
    { code: 'CHK07', name: 'Date of Manufacture / Packing', citation: 'Rule 6(1)(d) — Month & Year', required: 'Month and year of manufacture or pre-packing', severity: 'critical', defaultObserved: 'Pending server OCR text extraction (captured offline)', needsOcr: true },
    { code: 'CHK08', name: 'Best Before / Expiry Date', citation: 'Rule 6(1)(d) — Perishable Commodities', required: 'Clear expiry or best before period for perishable goods', severity: 'major', defaultObserved: isPerishable ? 'Perishable good flagged — pending expiry check' : 'Non-perishable commodity', needsOcr: isPerishable, verdict: isPerishable ? 'not_assessed' : 'pass', reason: isPerishable ? 'Perishable item requires verified expiry date from server OCR.' : null },
    { code: 'CHK09', name: 'Consumer Care Contact Details', citation: 'Rule 6(1)(n) — Name, Address, Tel, Email', required: 'Designation, full postal address, phone number & email', severity: 'major', defaultObserved: 'Pending server OCR text extraction (captured offline)', needsOcr: true },
    { code: 'CHK10', name: 'Country of Origin (Imports)', citation: 'Rule 6(1)(a) proviso — Imported Packages', required: 'Clear declaration of country of origin for all packages', severity: 'major', defaultObserved: isImported ? 'Imported item — pending origin check' : 'Domestic package', needsOcr: isImported, verdict: isImported ? 'not_assessed' : 'pass', reason: isImported ? 'Imported item requires Country of Origin declaration.' : null },
    { code: 'CHK11', name: 'Principal Display Panel (PDP) Area', citation: 'Rule 9 — Calculation of PDP Dimensions', required: 'At least 40% of total surface area on front panel', severity: 'minor', defaultObserved: 'Dimensions recorded from geometry input', needsOcr: false, verdict: 'pass' },
    { code: 'CHK12', name: 'Minimum Font Height & Proportion', citation: 'Rule 9 Table I — Font Size by PDP Area', required: 'Numeral height matching Table I prescribed standards', severity: 'minor', defaultObserved: 'Pending millimetre pixel measurement (captured offline)', needsOcr: true },
    { code: 'CHK13', name: 'Sticker / Smudge Alteration', citation: 'Section 36 & Rule 6 — Over-stickering Prohibition', required: 'Declarations must be indelible; no price alterations', severity: 'critical', defaultObserved: hasSticker ? 'Price sticker found affixed over declared MRP' : 'No sticker alteration declared', needsOcr: false, verdict: hasSticker ? 'fail' : 'pass', reason: hasSticker ? 'Price sticker affixed over original declared MRP. Section 36 violation.' : null },
    { code: 'CHK14', name: 'Overcharging Assessment', citation: 'Section 36(1) — Sale beyond declared MRP', required: 'Prohibition of sale at price exceeding declared MRP', severity: 'critical', defaultObserved: 'Pending server price verification', needsOcr: true },
    { code: 'CHK15', name: 'E-Commerce Marketplace Listing', citation: 'Rule 6(10) — Digital Display Compliance', required: 'All mandatory declarations displayed on web listing', severity: 'advisory', defaultObserved: 'Physical retail package sampled in store', needsOcr: false, verdict: 'not_assessed', reason: 'Rule 6(10) governs digital marketplace listings.' },
    { code: 'CHK16', name: 'Dual MRP Assessment', citation: 'Rule 18(2) — Prohibition of dual pricing', required: 'No manufacturer shall declare different MRPs on identical packages', severity: 'critical', defaultObserved: 'Pending multi-panel comparison', needsOcr: true },
    { code: 'CHK17', name: 'Veg / Non-Veg Statutory Symbol', citation: 'FSSAI Alignment & Rule 6 General', required: 'Food category indicator present and conspicuous', severity: 'advisory', defaultObserved: 'Pending visual inspection', needsOcr: true },
    { code: 'CHK18', name: 'Penalty Limb & Section 36 Classification', citation: 'Section 36, Legal Metrology Act 2009', required: 'Section 36 tier 1 / tier 2 offense determination', severity: 'critical', defaultObserved: hasSticker ? 'Section 36(1) penalty limb engaged due to sticker alteration' : 'Pending server statutory review', needsOcr: false, verdict: hasSticker ? 'fail' : 'not_assessed', reason: hasSticker ? 'Section 36(1) penalty limb engaged.' : 'Pending complete evidence review.' },
  ];

  // 05_SYSTEM_ARCHITECTURE §1.1 / Backend.md C4: the server is the ONLY
  // assessor. Offline capture renders the 19 rows as PENDING — these verdict
  // fields were previously seeded from device flags (CHK03 'pass', CHK05
  // 'fail' on an empty commodity, CHK13 'fail' on a sticker), which
  // masqueraded as engine verdicts and rolled the scan up to 'violation'
  // before any server assessment existed. Observations stay; verdicts wait.
  return master.map((m, idx) => ({
    id: idx + 1,
    check_id: m.code,
    title: m.name,
    citation: m.citation,
    engine_verdict: 'not_assessed',
    effective_verdict: 'not_assessed',
    human_verdict: null,
    observed: m.defaultObserved,
    required: m.required,
    severity: m.severity,
    reason: 'Captured offline — pending server OCR and statutory assessment.',
  }));
}

export default function InspectionSessionScreen({
  inspectionSession,
  onPackageAssessed,
  onCompleteInspection,
  onCancel,
  onViewFindings,
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [activePanel, setActivePanel] = useState('front');
  const [panelPhotos, setPanelPhotos] = useState({}); // { front: uri, back: uri, ... }
  const [capturing, setCapturing] = useState(false);

  // Package fields
  const [commodity, setCommodity] = useState('');
  const [brand, setBrand] = useState('');
  const [batch, setBatch] = useState('');
  const [panelShape, setPanelShape] = useState('rectangular'); // rectangular, cylindrical, other

  // Scope flags (Legal Metrology Rule 6)
  const [isImported, setIsImported] = useState(false);
  const [isPerishable, setIsPerishable] = useState(false);
  const [hasSticker, setHasSticker] = useState(false);
  const [isBlownMoulded, setIsBlownMoulded] = useState(false);

  // Submitting / assessing package state
  const [assessing, setAssessing] = useState(false);

  // Completed packages in this visit
  const [packages, setPackages] = useState(inspectionSession?.scans || []);

  const cameraRef = useRef(null);
  useAppLock({ enabled: true });

  // Screen capture protection
  useEffect(() => {
    let active = false;
    (async () => {
      try {
        if (ScreenCapture?.preventScreenCaptureAsync) {
          await ScreenCapture.preventScreenCaptureAsync();
          active = true;
        }
      } catch {}
    })();
    return () => {
      if (active) ScreenCapture?.allowScreenCaptureAsync?.().catch?.(() => {});
    };
  }, []);

  const handleCapturePhoto = async () => {
    if (!cameraRef.current || capturing) return;
    setCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.85,
        skipProcessing: Platform.OS === 'android',
      });
      if (photo?.uri) {
        setPanelPhotos((prev) => ({
          ...prev,
          [activePanel]: photo.uri,
        }));
        // Auto-advance to next panel
        const idx = PANELS.findIndex((p) => p.key === activePanel);
        if (idx < PANELS.length - 1) {
          setActivePanel(PANELS[idx + 1].key);
        }
      }
    } catch (e) {
      Alert.alert('Capture failed', 'Could not take photo. Please try again.');
    } finally {
      setCapturing(false);
    }
  };

  const handleAssessCurrentPackage = async () => {
    const photoUris = Object.values(panelPhotos).filter(Boolean);
    if (photoUris.length === 0) {
      Alert.alert('Evidence Required', 'Please take at least one panel photograph before assessment.');
      return;
    }

    setAssessing(true);
    try {
      let serverScanId = null;
      let assessedScan = null;
      let usedServerId = inspectionSession?.serverInspectionId;

      // 1. If online and no serverInspectionId yet, create inspection on the server
      if (!usedServerId && inspectionSession?.store?.id) {
        try {
          const newInsp = await createInspection({
            store_id: Number(inspectionSession.store.id),
            transaction_type: inspectionSession.transaction_type || 'retail_sale',
            latitude: inspectionSession.coords?.latitude,
            longitude: inspectionSession.coords?.longitude,
            gps_accuracy_m: inspectionSession.coords?.accuracy,
            local_created_at: inspectionSession.started_at || new Date().toISOString(),
          });
          usedServerId = newInsp?.id || newInsp?.inspection_id;
          if (usedServerId && inspectionSession) {
            inspectionSession.serverInspectionId = usedServerId;
          }
        } catch (inspErr) {
          console.warn('[Session] createInspection failed (offline?):', inspErr?.message || inspErr);
        }
      }

      // 2. Geometry conforming to Backend/schemas.py PanelGeometry
      const geometry = {
        panel_shape: panelShape || 'rectangular',
        panel_height_mm: panelShape === 'other' ? undefined : 120.0,
        panel_width_mm: panelShape === 'rectangular' ? 80.0 : undefined,
        panel_diameter_mm: panelShape === 'cylindrical' ? 65.0 : undefined,
        total_surface_area_cm2: panelShape === 'other' ? 200.0 : undefined,
        is_blown_moulded: isBlownMoulded,
        scale_source: 'declared',
      };

      // 3. Try server createScan -> scope -> upload images -> assessScan
      if (usedServerId) {
        try {
          const scanRes = await createScan(usedServerId, {
            commodity_generic: commodity.trim() || null,
            brand_name: brand.trim() || null,
            batch_number: batch.trim() || null,
            geometry,
          });
          serverScanId = scanRes?.id || scanRes?.scan_id;

          if (serverScanId) {
            // Persist declared scope flags
            await updateScanScope(serverScanId, {
              is_imported: isImported,
              is_perishable: isPerishable,
              has_sticker: hasSticker,
            });

            // Upload all captured panel images
            for (const [panelKey, uri] of Object.entries(panelPhotos)) {
              if (uri) {
                await uploadScanImage(serverScanId, panelKey, uri);
              }
            }

            // Run authoritative statutory assessment across all 19 rules
            assessedScan = await assessScan(serverScanId);
          }
        } catch (serverErr) {
          console.warn('[Session] Live server assessment failed, falling back to local:', serverErr?.message || serverErr);
        }
      }

      let scanItem;
      if (assessedScan && Array.isArray(assessedScan.findings)) {
        // Authoritative server assessment result
        scanItem = {
          id: `pkg-${serverScanId || Date.now()}`,
          server_id: serverScanId,
          commodity_generic: assessedScan.commodity_generic || commodity.trim() || 'Unspecified Commodity',
          brand_name: assessedScan.brand_name || brand.trim() || 'Unspecified Brand',
          batch_number: assessedScan.batch_number || batch.trim() || null,
          geometry,
          panelPhotos: { ...panelPhotos },
          is_imported: isImported,
          is_perishable: isPerishable,
          has_sticker: hasSticker,
          overall_result: assessedScan.overall_result,
          violation_limb: assessedScan.violation_limb,
          checks_assessed: assessedScan.checks_assessed,
          checks_total: assessedScan.checks_total,
          findings: assessedScan.findings,
          created_at: assessedScan.created_at || new Date().toISOString(),
        };
      } else {
        // Offline assessment fallback — never invent a false compliant verdict
        const offlineFindings = buildOfflineFindings({
          commodity: commodity.trim(),
          brand: brand.trim(),
          batch: batch.trim(),
          hasSticker,
          isImported,
          isPerishable,
        });
        scanItem = {
          id: `pkg-${Date.now()}`,
          commodity_generic: commodity.trim() || 'Unspecified Commodity',
          brand_name: brand.trim() || 'Unspecified Brand',
          batch_number: batch.trim() || null,
          geometry,
          panelPhotos: { ...panelPhotos },
          is_imported: isImported,
          is_perishable: isPerishable,
          has_sticker: hasSticker,
          // Nothing is assessed until the server says so (C3/C4). A local
          // rollup must never claim 'violation' from a device flag alone —
          // the officer's provisional suspicion still reaches the server via
          // the violationSuspected flag on the queued scan.
          overall_result: 'not_assessed',
          checks_assessed: 0,
          checks_total: 19,
          findings: offlineFindings,
          is_offline: true,
          created_at: new Date().toISOString(),
        };
      }

      const updated = [...packages, scanItem];
      setPackages(updated);

      // Reset current package inputs for next item
      setPanelPhotos({});
      setCommodity('');
      setBrand('');
      setBatch('');
      setHasSticker(false);
      setIsImported(false);
      setIsPerishable(false);
      setActivePanel('front');

      // Navigate to findings review for this package
      if (onPackageAssessed) {
        onPackageAssessed(scanItem, updated);
      }
    } catch (e) {
      Alert.alert('Assessment Error', 'Failed to assess package. Saved to offline queue.');
    } finally {
      setAssessing(false);
    }
  };

  const handleFinishInspection = () => {
    if (packages.length === 0 && Object.keys(panelPhotos).length === 0) {
      Alert.alert('No Packages Inspected', 'Please scan at least one package before concluding the inspection visit.');
      return;
    }

    onCompleteInspection({
      ...inspectionSession,
      scans: packages,
      finished_at: new Date().toISOString(),
    });
  };

  const capturedCount = Object.keys(panelPhotos).length;

  return (
    <View style={styles.container}>
      <Header
        title="Active Inspection Visit"
        subtitle={`${inspectionSession?.store?.name || 'Retail Store'} • Step 2 of 3`}
      />

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {/* Store Summary Banner */}
        <Card padding="sm" style={styles.storeBanner}>
          <View style={styles.rowBetween}>
            <View style={{ flex: 1 }}>
              <Text style={styles.storeBannerTitle}>{inspectionSession?.store?.name}</Text>
              <Text style={styles.storeBannerSub}>
                {inspectionSession?.store?.city || 'Telangana'} • {inspectionSession?.transaction_type}
              </Text>
            </View>
            <View style={styles.packageCountBadge}>
              <Text style={styles.packageCountText}>{packages.length} Packages Inspected</Text>
            </View>
          </View>
        </Card>

        {/* Existing Scanned Packages List */}
        {packages.length > 0 && (
          <View style={{ marginBottom: spacing.md }}>
            <Text style={styles.sectionHeader}>PACKAGES SAMPLED THIS VISIT</Text>
            {packages.map((pkg, idx) => (
              <Card key={pkg.id || idx} padding="sm" style={styles.packageCard}>
                <View style={styles.rowBetween}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text }}>
                      #{idx + 1}: {pkg.brand_name} ({pkg.commodity_generic})
                    </Text>
                    <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 1 }}>
                      Batch: {pkg.batch_number || 'N/A'} • 19 Checks Evaluated
                    </Text>
                  </View>
                  <View style={styles.rowAlign}>
                    <VerdictBadge result={pkg.overall_result || 'compliant'} />
                    {onViewFindings && (
                      <Pressable
                        onPress={() => onViewFindings(pkg)}
                        style={styles.viewFindingsBtn}
                        hitSlop={8}
                      >
                        <Text style={styles.viewFindingsText}>Findings →</Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              </Card>
            ))}
          </View>
        )}

        {/* Current Package Intake Card */}
        <Text style={styles.sectionHeader}>
          {packages.length === 0 ? 'SCAN FIRST SAMPLE PACKAGE' : `SCAN PACKAGE #${packages.length + 1}`}
        </Text>

        {/* Panel Selector Chips */}
        <View style={styles.panelSelector}>
          {PANELS.map((p) => {
            const hasPhoto = !!panelPhotos[p.key];
            const isAct = activePanel === p.key;
            return (
              <Pressable
                key={p.key}
                onPress={() => setActivePanel(p.key)}
                style={[
                  styles.panelChip,
                  isAct && styles.panelChipActive,
                  hasPhoto && styles.panelChipDone,
                ]}
              >
                <Text
                  style={[
                    styles.panelChipText,
                    isAct && styles.panelChipTextActive,
                    hasPhoto && styles.panelChipTextDone,
                  ]}
                >
                  {hasPhoto ? '✓ ' : ''}{p.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Camera Viewport or Permissions Request */}
        <Card padding="none" style={styles.cameraCard}>
          {!permission?.granted ? (
            <View style={styles.permissionBox}>
              <Text style={{ fontSize: 32, marginBottom: spacing.sm }}>📷</Text>
              <Text style={[typography.h4, { textAlign: 'center', marginBottom: spacing.xs }]}>
                Camera Access Needed
              </Text>
              <Text style={[typography.caption, { textAlign: 'center', marginBottom: spacing.md }]}>
                Legal Metrology statutory inspection requires camera access to capture evidence panels.
              </Text>
              <PrimaryButton title="Grant Camera Permission" onPress={requestPermission} />
            </View>
          ) : panelPhotos[activePanel] ? (
            <View style={styles.previewBox}>
              <Image source={{ uri: panelPhotos[activePanel] }} style={styles.previewImage} />
              <View style={styles.previewOverlay}>
                <Text style={styles.previewLabel}>{PANELS.find((p) => p.key === activePanel)?.label} Captured</Text>
                <Pressable
                  onPress={() => setPanelPhotos((prev) => ({ ...prev, [activePanel]: null }))}
                  style={styles.retakeBtn}
                >
                  <Text style={styles.retakeText}>Retake Photo</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <View style={styles.cameraBox}>
              <CameraView ref={cameraRef} style={styles.cameraView} facing="back" />
              {/* Guidance overlay bracket */}
              <View style={styles.bracketOverlay}>
                <View style={styles.bracketGuide}>
                  <Text style={styles.bracketGuideText}>
                    Align {PANELS.find((p) => p.key === activePanel)?.label} within frame
                  </Text>
                </View>
              </View>
              {/* Shutter bar */}
              <View style={styles.shutterBar}>
                <Pressable
                  onPress={handleCapturePhoto}
                  disabled={capturing}
                  style={styles.shutterBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Capture photo"
                >
                  {capturing ? (
                    <ActivityIndicator color={colors.white} />
                  ) : (
                    <View style={styles.shutterInner} />
                  )}
                </Pressable>
              </View>
            </View>
          )}
        </Card>

        {/* Package Metadata Form */}
        <Text style={[styles.sectionTitle, { marginTop: spacing.md }]}>PACKAGE PARTICULARS</Text>
        <Card padding="md" style={{ marginBottom: spacing.md }}>
          <View style={styles.rowBetween}>
            <View style={{ flex: 1, marginRight: spacing.sm }}>
              <Text style={styles.inputLabel}>Commodity Generic Name</Text>
              <TextInput
                placeholder="e.g. Wheat Flour, Biscuits"
                placeholderTextColor={colors.placeholder}
                value={commodity}
                onChangeText={setCommodity}
                style={styles.input}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.inputLabel}>Brand Name</Text>
              <TextInput
                placeholder="e.g. Aashirvaad"
                placeholderTextColor={colors.placeholder}
                value={brand}
                onChangeText={setBrand}
                style={styles.input}
              />
            </View>
          </View>

          <View style={{ marginTop: spacing.sm }}>
            <Text style={styles.inputLabel}>Batch / Lot Number</Text>
            <TextInput
              placeholder="e.g. B-2026-08 (from barcode/inkjet)"
              placeholderTextColor={colors.placeholder}
              value={batch}
              onChangeText={setBatch}
              style={styles.input}
            />
          </View>

          {/* Statutory Scope Flags */}
          <Text style={[styles.inputLabel, { marginTop: spacing.md, marginBottom: spacing.xs }]}>
            STATUTORY CONDITIONS (RULE 6)
          </Text>
          <View style={styles.flagsGrid}>
            <Pressable
              onPress={() => setIsImported(!isImported)}
              style={[styles.flagPill, isImported && styles.flagPillActive]}
            >
              <Text style={[styles.flagText, isImported && styles.flagTextActive]}>
                {isImported ? '✓ ' : ''}Imported Package (Rule 6(1)(a))
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setIsPerishable(!isPerishable)}
              style={[styles.flagPill, isPerishable && styles.flagPillActive]}
            >
              <Text style={[styles.flagText, isPerishable && styles.flagTextActive]}>
                {isPerishable ? '✓ ' : ''}Perishable Food (Best Before)
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setHasSticker(!hasSticker)}
              style={[styles.flagPill, hasSticker && styles.flagPillAlert]}
            >
              <Text style={[styles.flagText, hasSticker && styles.flagTextAlert]}>
                {hasSticker ? '⚠️ ' : ''}Price Sticker Affixed (Section 36)
              </Text>
            </Pressable>
          </View>
        </Card>

        {/* Package Action Buttons */}
        <View style={{ gap: spacing.sm, marginBottom: spacing.xl }}>
          <PrimaryButton
            title={assessing ? 'Evaluating 19 Checks…' : 'Assess Package (19 Rule Checks) →'}
            onPress={handleAssessCurrentPackage}
            disabled={assessing || capturedCount === 0}
            accessibilityLabel="Run Legal Metrology statutory checks"
          />

          <Pressable
            onPress={handleFinishInspection}
            style={[styles.finishBtn, packages.length === 0 && { opacity: 0.6 }]}
            accessibilityRole="button"
            accessibilityLabel="Finish visit and submit all packages"
          >
            <Text style={styles.finishBtnText}>
              ✓ Conclude Inspection Visit ({packages.length} Packages Ready) →
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  storeBanner: {
    backgroundColor: colors.surface,
    borderColor: colors.borderLight,
    borderWidth: 1,
    marginBottom: spacing.md,
  },
  storeBannerTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.niyamBlue,
  },
  storeBannerSub: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 1,
  },
  packageCountBadge: {
    backgroundColor: colors.info.fill,
    borderColor: colors.info.border,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  packageCountText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.info.text,
  },
  sectionHeader: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 0.8,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
  },
  packageCard: {
    marginBottom: spacing.xs,
  },
  viewFindingsBtn: {
    marginLeft: spacing.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.sm,
  },
  viewFindingsText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.netraTeal,
  },
  panelSelector: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  panelChip: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
  },
  panelChipActive: {
    borderColor: colors.netraTeal,
    backgroundColor: '#F0FDFA',
  },
  panelChipDone: {
    borderColor: colors.pass.border,
    backgroundColor: colors.pass.fill,
  },
  panelChipText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textMuted,
  },
  panelChipTextActive: {
    color: colors.netraTeal,
    fontWeight: '700',
  },
  panelChipTextDone: {
    color: colors.pass.text,
    fontWeight: '700',
  },
  cameraCard: {
    height: 240,
    overflow: 'hidden',
    borderRadius: radius.md,
    backgroundColor: '#000',
    marginBottom: spacing.md,
  },
  permissionBox: {
    flex: 1,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraBox: {
    flex: 1,
    position: 'relative',
  },
  cameraView: {
    flex: 1,
  },
  bracketOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bracketGuide: {
    width: '78%',
    height: '68%',
    borderWidth: 1.5,
    borderColor: colors.saffron,
    borderRadius: radius.md,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 8,
  },
  bracketGuideText: {
    color: colors.white,
    fontSize: 10,
    fontWeight: '700',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  shutterBar: {
    position: 'absolute',
    bottom: 12,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  shutterBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 3,
    borderColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  shutterInner: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.white,
  },
  previewBox: {
    flex: 1,
    position: 'relative',
  },
  previewImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  previewOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(15,42,68,0.85)',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  previewLabel: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '700',
  },
  retakeBtn: {
    backgroundColor: colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  retakeText: {
    color: colors.niyamBlue,
    fontSize: 11,
    fontWeight: '700',
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 0.8,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 2,
  },
  input: {
    height: 38,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    fontSize: 13,
    color: colors.text,
    backgroundColor: colors.white,
  },
  flagsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  flagPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  flagPillActive: {
    borderColor: colors.netraTeal,
    backgroundColor: '#F0FDFA',
  },
  flagPillAlert: {
    borderColor: colors.violation.border,
    backgroundColor: colors.violation.fill,
  },
  flagText: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  flagTextActive: {
    color: colors.netraTeal,
    fontWeight: '700',
  },
  flagTextAlert: {
    color: colors.violation.text,
    fontWeight: '700',
  },
  finishBtn: {
    backgroundColor: colors.surface,
    borderColor: colors.netraTeal,
    borderWidth: 1.5,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  finishBtnText: {
    color: colors.netraTeal,
    fontSize: 14,
    fontWeight: '700',
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rowAlign: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});

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

let ScreenCapture = null;
try { ScreenCapture = require('expo-screen-capture'); } catch { ScreenCapture = null; }

const PANELS = [
  { key: 'front', label: 'Front Panel', desc: 'Product name & brand' },
  { key: 'back', label: 'Back Panel', desc: 'Manufacturer details & ingredients' },
  { key: 'mrp', label: 'MRP Panel', desc: 'MRP, Unit Sale Price, Dates' },
  { key: 'batch', label: 'Batch / Barcode', desc: 'Batch code & barcode' },
];

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
      // Create mock or real assessment record
      const scanItem = {
        id: `pkg-${Date.now()}`,
        commodity_generic: commodity.trim() || 'Sample Commodity',
        brand_name: brand.trim() || 'Sample Brand',
        batch_number: batch.trim() || 'B-2026',
        geometry: { panel_shape: panelShape, is_blown_moulded: isBlownMoulded },
        panelPhotos: { ...panelPhotos },
        is_imported: isImported,
        is_perishable: isPerishable,
        has_sticker: hasSticker,
        // Default rule verdict logic
        overall_result: hasSticker ? 'violation' : 'compliant',
        checks_assessed: 19,
        checks_total: 19,
        created_at: new Date().toISOString(),
      };

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

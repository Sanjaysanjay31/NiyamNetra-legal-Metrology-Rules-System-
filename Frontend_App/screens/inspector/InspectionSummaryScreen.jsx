import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  Alert,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { colors, spacing, typography, radius, shadows } from '../../theme';
import Header from '../../components/Header';
import Card from '../../components/Card';
import VerdictBadge from '../../components/VerdictBadge';
import PrimaryButton from '../../components/PrimaryButton';
import { enqueueInspection } from '../../offline/queue';
import { submitInspection } from '../../api/inspections';

const SIGNATURE_STATUSES = [
  { key: 'signed', label: 'Signed by Merchant / Representative', icon: '✍️' },
  { key: 'refused', label: 'Refused to Sign (Endorsement Noted)', icon: '🚫' },
  { key: 'unavailable', label: 'Store Keeper Unavailable', icon: '⏳' },
];

export default function InspectionSummaryScreen({
  inspectionSession,
  onInspectionFinalized,
  onBackToSession,
}) {
  const [signatureStatus, setSignatureStatus] = useState('signed');
  const [officerNotes, setOfficerNotes] = useState('');
  const [recordSeizure, setRecordSeizure] = useState(false);
  const [seizedUnits, setSeizedUnits] = useState('');
  const [witnessDetails, setWitnessDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submittedId, setSubmittedId] = useState(null);

  const packages = inspectionSession?.scans || [];
  const compliantCount = packages.filter((p) => p.overall_result === 'compliant').length;
  const violationCount = packages.filter((p) => p.overall_result === 'violation').length;
  const notAssessedCount = packages.filter((p) => p.overall_result === 'not_assessed').length;
  const overallInspectionVerdict = violationCount > 0 ? 'violation' : (compliantCount > 0 && notAssessedCount === 0 ? 'compliant' : 'not_assessed');

  const handleSubmit = async () => {
    if (!inspectionSession?.store?.id) {
      Alert.alert('Store Required', 'Please select a valid registered store before finalizing the inspection.');
      return;
    }

    setSubmitting(true);
    try {
      let liveSubmitted = false;

      // 1. Direct API submission if server inspection already created
      if (inspectionSession.serverInspectionId) {
        try {
          await submitInspection(inspectionSession.serverInspectionId, {
            signature_status: signatureStatus,
            notes: officerNotes,
          });
          liveSubmitted = true;
        } catch (subErr) {
          console.warn('[Summary] Live submit failed, enqueuing for sync:', subErr?.message || subErr);
        }
      }

      // 2. Enqueue to storage. If live submission already succeeded, mark is_synced: true
      // so SyncProvider does not submit a duplicate inspection to the server.
      const localId = await enqueueInspection({
        store_id: Number(inspectionSession.store.id),
        transaction_type: inspectionSession.transaction_type || 'retail_sale',
        latitude: inspectionSession.coords?.latitude,
        longitude: inspectionSession.coords?.longitude,
        gps_accuracy_m: inspectionSession.coords?.accuracy,
        signature_status: signatureStatus,
        notes: officerNotes,
        is_synced: liveSubmitted,
        scans: packages.map((p) => ({
          panelUris: Object.values(p.panelPhotos || {}),
          commodity_generic: p.commodity_generic,
          brand_name: p.brand_name,
          batch_number: p.batch_number,
          geometry: p.geometry || {
            panel_shape: 'rectangular',
            panel_height_mm: 120.0,
            panel_width_mm: 80.0,
            is_blown_moulded: false,
            scale_source: 'declared',
          },
          is_imported: p.is_imported,
          is_perishable: p.is_perishable,
          has_sticker: p.has_sticker,
        })),
        result: overallInspectionVerdict,
      });

      setSubmittedId(
        inspectionSession.serverInspectionId
          ? `INSP-${inspectionSession.serverInspectionId}`
          : localId
      );
    } catch (e) {
      setSubmittedId('INSP-QUEUED');
    } finally {
      setSubmitting(false);
    }
  };

  if (submittedId) {
    return (
      <View style={styles.container}>
        <Header title="Inspection Finalized" subtitle="Official Record Stored" />
        <View style={styles.successBox}>
          <View style={styles.successIconCircle}>
            <Text style={{ fontSize: 36 }}>✓</Text>
          </View>
          <Text style={[typography.h2, { textAlign: 'center', marginTop: spacing.md }]}>
            Inspection Recorded
          </Text>
          <Text style={[typography.caption, { textAlign: 'center', marginTop: 4, marginBottom: spacing.lg }]}>
            Reference ID: {submittedId}
          </Text>

          <Card padding="md" style={{ width: '100%', marginBottom: spacing.lg }}>
            <View style={styles.rowBetween}>
              <Text style={styles.summaryLabel}>Establishment:</Text>
              <Text style={styles.summaryValue}>{inspectionSession?.store?.name}</Text>
            </View>
            <View style={[styles.rowBetween, { marginTop: 6 }]}>
              <Text style={styles.summaryLabel}>Packages Assessed:</Text>
              <Text style={styles.summaryValue}>{packages.length}</Text>
            </View>
            <View style={[styles.rowBetween, { marginTop: 6 }]}>
              <Text style={styles.summaryLabel}>Final Verdict:</Text>
              <VerdictBadge result={overallInspectionVerdict} />
            </View>
            <View style={[styles.rowBetween, { marginTop: 6 }]}>
              <Text style={styles.summaryLabel}>Merchant Signature:</Text>
              <Text style={styles.summaryValue}>{signatureStatus.toUpperCase()}</Text>
            </View>
          </Card>

          <PrimaryButton
            title="Return to Inspector Dashboard"
            onPress={onInspectionFinalized}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header
        title="Inspection Review & Closure"
        subtitle="Step 3 of 3: Verification & Merchant Acknowledgement"
      />

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {/* Establishment & Verdict Overview */}
        <Card padding="md" style={styles.summaryCard}>
          <View style={styles.rowBetween}>
            <View style={{ flex: 1 }}>
              <Text style={styles.storeTitle}>{inspectionSession?.store?.name}</Text>
              <Text style={styles.storeSub}>
                {inspectionSession?.store?.address || inspectionSession?.store?.city || 'Telangana'} • {inspectionSession?.transaction_type}
              </Text>
            </View>
            <VerdictBadge result={overallInspectionVerdict} />
          </View>

          {/* Counts */}
          <View style={[styles.rowAlign, { marginTop: spacing.md }]}>
            <View style={[styles.statChip, { backgroundColor: colors.pass.fill, borderColor: colors.pass.border }]}>
              <Text style={[styles.statChipText, { color: colors.pass.text }]}>✓ {compliantCount} Compliant</Text>
            </View>
            <View
              style={[
                styles.statChip,
                violationCount > 0
                  ? { backgroundColor: colors.violation.fill, borderColor: colors.violation.border }
                  : { backgroundColor: colors.notAssessed.fill, borderColor: colors.notAssessed.border },
              ]}
            >
              <Text
                style={[
                  styles.statChipText,
                  { color: violationCount > 0 ? colors.violation.text : colors.textMuted },
                ]}
              >
                ⚠️ {violationCount} Violations
              </Text>
            </View>
          </View>
        </Card>

        {/* Packages Breakdown */}
        <Text style={styles.sectionTitle}>PACKAGES CHECKED IN THIS VISIT</Text>
        <Card padding="sm" style={{ marginBottom: spacing.md }}>
          {packages.map((pkg, idx) => (
            <View key={pkg.id || idx} style={[styles.pkgRow, idx > 0 && styles.pkgRowBorder]}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text }}>
                  #{idx + 1}: {pkg.brand_name} ({pkg.commodity_generic})
                </Text>
                <Text style={{ fontSize: 10, color: colors.textMuted }}>
                  Batch: {pkg.batch_number || 'N/A'}
                </Text>
              </View>
              <VerdictBadge result={pkg.overall_result || 'compliant'} />
            </View>
          ))}
        </Card>

        {/* Panchnama / Seizure Memo Section (if violations found) */}
        {violationCount > 0 && (
          <Card padding="md" style={styles.seizureCard}>
            <View style={styles.rowBetween}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: colors.violation.text }}>
                  ⚠️ Seizure Memo / Panchnama Form
                </Text>
                <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: 1 }}>
                  Section 36 penalty limb invoked. Seizure of non-conforming sample packages.
                </Text>
              </View>
              <Pressable
                onPress={() => setRecordSeizure(!recordSeizure)}
                style={[styles.toggleBtn, recordSeizure && styles.toggleBtnActive]}
              >
                <Text style={[styles.toggleBtnText, recordSeizure && styles.toggleBtnTextActive]}>
                  {recordSeizure ? 'Enabled' : 'Draft'}
                </Text>
              </Pressable>
            </View>

            {recordSeizure && (
              <View style={{ marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.borderLight }}>
                <Text style={styles.inputLabel}>Number of Units Seized for Evidence:</Text>
                <TextInput
                  value={seizedUnits}
                  onChangeText={setSeizedUnits}
                  keyboardType="numeric"
                  style={styles.textInput}
                />
                <Text style={[styles.inputLabel, { marginTop: spacing.sm }]}>Independent Witnesses (Names & Addresses):</Text>
                <TextInput
                  placeholder="e.g. 1. Ramesh Kumar (Adjacent shop), 2. P. Venu"
                  placeholderTextColor={colors.placeholder}
                  value={witnessDetails}
                  onChangeText={setWitnessDetails}
                  style={styles.textInput}
                />
              </View>
            )}
          </Card>
        )}

        {/* Merchant Signature / Acknowledgement */}
        <Text style={styles.sectionTitle}>MERCHANT SIGNATURE & ACKNOWLEDGEMENT</Text>
        <Card padding="md" style={{ marginBottom: spacing.md }}>
          {SIGNATURE_STATUSES.map((s) => {
            const isSel = signatureStatus === s.key;
            return (
              <Pressable
                key={s.key}
                onPress={() => setSignatureStatus(s.key)}
                style={[styles.sigOption, isSel && styles.sigOptionSelected]}
              >
                <Text style={{ fontSize: 18, marginRight: spacing.sm }}>{s.icon}</Text>
                <Text style={[styles.sigLabel, isSel && styles.sigLabelSelected]}>{s.label}</Text>
                <View style={[styles.radioOuter, isSel && styles.radioOuterSelected]}>
                  {isSel && <View style={styles.radioInner} />}
                </View>
              </Pressable>
            );
          })}
        </Card>

        {/* Officer Statutory Notes */}
        <Text style={styles.sectionTitle}>OFFICER FIELD REMARKS</Text>
        <Card padding="md" style={{ marginBottom: spacing.lg }}>
          <TextInput
            placeholder="Optional statutory notes, condition of pre-packaged goods, or merchant representations…"
            placeholderTextColor={colors.placeholder}
            value={officerNotes}
            onChangeText={setOfficerNotes}
            multiline
            numberOfLines={3}
            style={styles.notesInput}
          />
        </Card>

        {/* Submit Actions */}
        <View style={{ gap: spacing.sm, marginBottom: spacing.xxl }}>
          <PrimaryButton
            title={submitting ? 'Submitting & Sealing…' : '✓ Seal & Submit Official Inspection Record'}
            onPress={handleSubmit}
            disabled={submitting}
          />
          {onBackToSession && (
            <Pressable onPress={onBackToSession} style={styles.backBtn}>
              <Text style={styles.backBtnText}>← Back to Add More Packages</Text>
            </Pressable>
          )}
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
  summaryCard: {
    marginBottom: spacing.md,
  },
  storeTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.niyamBlue,
  },
  storeSub: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  statChip: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radius.sm,
    borderWidth: 1,
    marginRight: spacing.sm,
  },
  statChipText: {
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
  pkgRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  pkgRowBorder: {
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  seizureCard: {
    borderColor: colors.violation.border,
    backgroundColor: colors.violation.fill,
    marginBottom: spacing.md,
  },
  toggleBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  toggleBtnActive: {
    backgroundColor: colors.violation.text,
    borderColor: colors.violation.text,
  },
  toggleBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  toggleBtnTextActive: {
    color: colors.white,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 2,
  },
  textInput: {
    height: 38,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    fontSize: 12,
    color: colors.text,
    backgroundColor: colors.white,
  },
  sigOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  sigOptionSelected: {
    backgroundColor: colors.info.fill,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.xs,
  },
  sigLabel: {
    fontSize: 13,
    color: colors.text,
    flex: 1,
  },
  sigLabelSelected: {
    fontWeight: '700',
    color: colors.niyamBlue,
  },
  radioOuter: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOuterSelected: {
    borderColor: colors.netraTeal,
  },
  radioInner: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: colors.netraTeal,
  },
  notesInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: spacing.sm,
    fontSize: 12,
    color: colors.text,
    backgroundColor: colors.white,
    height: 60,
    textAlignVertical: 'top',
  },
  backBtn: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  backBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.netraTeal,
  },
  successBox: {
    flex: 1,
    padding: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.pass.fill,
    borderColor: colors.pass.border,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryLabel: {
    fontSize: 12,
    color: colors.textMuted,
  },
  summaryValue: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
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

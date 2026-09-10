import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Modal,
  TextInput,
  Alert,
  StyleSheet,
} from 'react-native';
import { colors, spacing, typography, radius, shadows } from '../../theme';
import Header from '../../components/Header';
import Card from '../../components/Card';
import VerdictBadge from '../../components/VerdictBadge';
import PrimaryButton from '../../components/PrimaryButton';
import { overrideFinding } from '../../api/inspections';

// The 19 statutory checks under Legal Metrology (Packaged Commodities) Rules 2011
const STATUTORY_CHECKS_MASTER = [
  {
    code: 'CHK01',
    name: 'Maximum Retail Price (MRP)',
    citation: 'Rule 6(1)(e) — Inclusive of all taxes',
    defaultObserved: 'Pending OCR extraction from MRP panel',
    required: 'MRP in Indian Rupees inclusive of all taxes',
    severity: 'critical',
  },
  {
    code: 'CHK02',
    name: 'Unit Sale Price (USP)',
    citation: 'Rule 6(1)(ea) — 2017 Amendment',
    defaultObserved: 'Pending OCR extraction of unit sale price',
    required: 'Unit price in Rs per g/ml/piece where net qty > 100g/ml',
    severity: 'major',
  },
  {
    code: 'CHK03',
    name: 'Chapter II Applicability',
    citation: 'Rule 3 — Retail Sale Scope',
    defaultObserved: 'Retail sale transaction verification',
    required: 'Pre-packaged commodity intended for retail sale',
    severity: 'critical',
  },
  {
    code: 'CHK04',
    name: 'Manufacturer / Packer Identity',
    citation: 'Rule 6(1)(a) — Name & Complete Address',
    defaultObserved: 'Pending OCR extraction of manufacturer/packer address',
    required: 'Name and complete physical address of manufacturer/packer',
    severity: 'critical',
  },
  {
    code: 'CHK05',
    name: 'Generic Commodity Name',
    citation: 'Rule 6(1)(b) — Common / Generic Name',
    defaultObserved: 'Pending declared generic name verification',
    required: 'Common or generic name of commodity in package',
    severity: 'major',
  },
  {
    code: 'CHK06',
    name: 'Net Quantity Declaration',
    citation: 'Rule 6(1)(c) — Standard Weights & Measures',
    defaultObserved: 'Pending OCR extraction of net quantity',
    required: 'Net weight, measure or number in standard metric units',
    severity: 'critical',
  },
  {
    code: 'CHK06b',
    name: 'Metric Units Compliance',
    citation: 'Rule 12 — Standard Metric Units (SI)',
    defaultObserved: 'Pending metric unit verification',
    required: 'Only metric units (g, kg, ml, L, m, cm) permissible',
    severity: 'critical',
  },
  {
    code: 'CHK07',
    name: 'Date of Manufacture / Packing',
    citation: 'Rule 6(1)(d) — Month & Year',
    defaultObserved: 'Pending OCR extraction of date of manufacture/packing',
    required: 'Month and year of manufacture or pre-packing',
    severity: 'critical',
  },
  {
    code: 'CHK08',
    name: 'Best Before / Expiry Date',
    citation: 'Rule 6(1)(d) — Perishable Commodities',
    defaultObserved: 'Pending expiry / best-before verification',
    required: 'Clear expiry or best before period for perishable goods',
    severity: 'major',
  },
  {
    code: 'CHK09',
    name: 'Consumer Care Contact Details',
    citation: 'Rule 6(1)(n) — Name, Address, Tel, Email',
    defaultObserved: 'Pending OCR extraction of consumer care details',
    required: 'Designation, full postal address, phone number & email',
    severity: 'major',
  },
  {
    code: 'CHK10',
    name: 'Country of Origin (Imports)',
    citation: 'Rule 6(1)(a) proviso — Imported Packages',
    defaultObserved: 'Pending country of origin declaration check',
    required: 'Clear declaration of country of origin for all packages',
    severity: 'major',
  },
  {
    code: 'CHK11',
    name: 'Principal Display Panel (PDP) Area',
    citation: 'Rule 9 — Calculation of PDP Dimensions',
    defaultObserved: 'Pending PDP area calculation from panel geometry',
    required: 'At least 40% of total surface area on front panel',
    severity: 'minor',
  },
  {
    code: 'CHK12',
    name: 'Minimum Font Height & Proportion',
    citation: 'Rule 9 Table I — Font Size by PDP Area',
    defaultObserved: 'Pending optical font height verification',
    required: 'Numeral height matching Table I prescribed standards',
    severity: 'minor',
  },
  {
    code: 'CHK13',
    name: 'Sticker / Smudge Alteration',
    citation: 'Section 36 & Rule 6 — Over-stickering Prohibition',
    defaultObserved: 'Declared sticker inspection',
    required: 'Declarations must be indelible; no price alterations',
    severity: 'critical',
  },
  {
    code: 'CHK14',
    name: 'Overcharging Assessment',
    citation: 'Section 36(1) — Sale beyond declared MRP',
    defaultObserved: 'Pending POS price vs stamped MRP comparison',
    required: 'Prohibition of sale at price exceeding declared MRP',
    severity: 'critical',
  },
  {
    code: 'CHK15',
    name: 'E-Commerce Marketplace Listing',
    citation: 'Rule 6(10) — Digital Display Compliance',
    defaultObserved: 'Physical retail package sampled',
    required: 'All mandatory declarations displayed on web listing',
    severity: 'advisory',
  },
  {
    code: 'CHK16',
    name: 'Dual MRP Assessment',
    citation: 'Rule 18(2) — Prohibition of dual pricing',
    defaultObserved: 'Pending multi-panel MRP comparison',
    required: 'No manufacturer shall declare different MRPs on identical packages',
    severity: 'critical',
  },
  {
    code: 'CHK17',
    name: 'Veg / Non-Veg Statutory Symbol',
    citation: 'FSSAI Alignment & Rule 6 General',
    defaultObserved: 'Pending food category indicator check',
    required: 'Food category indicator present and conspicuous',
    severity: 'advisory',
  },
  {
    code: 'CHK18',
    name: 'Penalty Limb & Section 36 Classification',
    citation: 'Section 36, Legal Metrology Act 2009',
    defaultObserved: 'Pending statutory review',
    required: 'Section 36 tier 1 / tier 2 offense determination',
    severity: 'critical',
  },
];

export default function FindingsScreen({ scan, onBack, onSaveFindings }) {
  const [findings, setFindings] = useState(() => {
    // If scan has real findings from server or offline assessment, use them!
    if (Array.isArray(scan?.findings) && scan.findings.length > 0) {
      return scan.findings.map((f, idx) => ({
        id: f.id || idx + 1,
        server_id: typeof f.id === 'number' && f.id > 0 ? f.id : null,
        check_id: f.check_id || f.code,
        title: f.title || f.name,
        citation: f.citation || '',
        engine_verdict: f.engine_verdict || f.verdict || 'not_assessed',
        effective_verdict: f.effective_verdict || f.human_verdict || f.engine_verdict || f.verdict || 'not_assessed',
        human_verdict: f.human_verdict || null,
        override_reason: f.override_reason || null,
        observed: f.observed || 'Pending observation',
        required: f.required || '',
        severity: f.severity || 'critical',
        reason: f.reason || null,
        confidence: f.confidence,
      }));
    }

    const hasSticker = scan?.has_sticker;
    return STATUTORY_CHECKS_MASTER.map((m, idx) => {
      let engineVerdict = 'not_assessed';
      let reason = null;

      if (m.code === 'CHK13' && hasSticker) {
        engineVerdict = 'fail';
        reason = 'Price sticker affixed over original declared MRP. Section 36 violation.';
      }

      return {
        id: idx + 1,
        server_id: null,
        check_id: m.code,
        title: m.name,
        citation: m.citation,
        engine_verdict: engineVerdict,
        effective_verdict: engineVerdict,
        human_verdict: null,
        observed: m.code === 'CHK13' && hasSticker ? 'Sticker found covering original price' : m.defaultObserved,
        required: m.required,
        severity: m.severity,
        reason,
      };
    });
  });

  // Override modal state
  const [selectedFinding, setSelectedFinding] = useState(null);
  const [overrideVerdict, setOverrideVerdict] = useState('pass');
  const [overrideReason, setOverrideReason] = useState('');
  const [submittingOverride, setSubmittingOverride] = useState(false);

  const handleOpenOverride = (f) => {
    setSelectedFinding(f);
    setOverrideVerdict(f.effective_verdict === 'pass' ? 'fail' : 'pass');
    setOverrideReason('');
  };

  const handleSaveOverride = async () => {
    if (overrideReason.trim().length < 10) {
      Alert.alert('Justification Required', 'Statutory audit requires an override reason of at least 10 characters.');
      return;
    }

    setSubmittingOverride(true);
    try {
      if (selectedFinding.server_id) {
        await overrideFinding(selectedFinding.server_id, overrideVerdict, overrideReason.trim());
      }

      const updated = findings.map((item) =>
        item.check_id === selectedFinding.check_id
          ? {
              ...item,
              human_verdict: overrideVerdict,
              effective_verdict: overrideVerdict,
              override_reason: overrideReason.trim(),
            }
          : item
      );
      setFindings(updated);
      if (onSaveFindings) {
        onSaveFindings(updated);
      }
      setSelectedFinding(null);
    } catch (e) {
      // Local fallback
      const updated = findings.map((item) =>
        item.check_id === selectedFinding.check_id
          ? {
              ...item,
              human_verdict: overrideVerdict,
              effective_verdict: overrideVerdict,
              override_reason: overrideReason.trim(),
            }
          : item
      );
      setFindings(updated);
      if (onSaveFindings) {
        onSaveFindings(updated);
      }
      setSelectedFinding(null);
    } finally {
      setSubmittingOverride(false);
    }
  };

  const passCount = findings.filter((f) => f.effective_verdict === 'pass').length;
  const failCount = findings.filter((f) => f.effective_verdict === 'fail').length;
  const notAssessedCount = findings.filter((f) => f.effective_verdict === 'not_assessed').length;
  const overallResult = failCount > 0 ? 'violation' : (passCount > 0 && notAssessedCount === 0 ? 'compliant' : 'not_assessed');

  return (
    <View style={styles.container}>
      <Header
        title="19 Statutory Rule Checks"
        subtitle={`${scan?.brand_name || 'Package'} (${scan?.commodity_generic || 'Sample'})`}
      />

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {/* Package Header Card */}
        <Card padding="md" style={styles.headerCard}>
          <View style={styles.rowBetween}>
            <View style={{ flex: 1 }}>
              <Text style={styles.packageTitle}>{scan?.brand_name} {scan?.commodity_generic}</Text>
              <Text style={styles.packageSub}>
                Batch: {scan?.batch_number || 'N/A'} • {findings.length} Checks Evaluated
              </Text>
            </View>
            <VerdictBadge result={overallResult} />
          </View>

          <View style={[styles.rowAlign, { marginTop: spacing.md, flexWrap: 'wrap', gap: 6 }]}>
            <View style={[styles.statBadge, { backgroundColor: colors.pass.fill, borderColor: colors.pass.border }]}>
              <Text style={[styles.statBadgeText, { color: colors.pass.text }]}>✓ {passCount} Compliant</Text>
            </View>
            {failCount > 0 && (
              <View
                style={[
                  styles.statBadge,
                  { backgroundColor: colors.violation.fill, borderColor: colors.violation.border },
                ]}
              >
                <Text
                  style={[
                    styles.statBadgeText,
                    { color: colors.violation.text },
                  ]}
                >
                  ⚠️ {failCount} Violations
                </Text>
              </View>
            )}
            {notAssessedCount > 0 && (
              <View
                style={[
                  styles.statBadge,
                  { backgroundColor: colors.notAssessed.fill, borderColor: colors.notAssessed.border },
                ]}
              >
                <Text
                  style={[
                    styles.statBadgeText,
                    { color: colors.notAssessed.text },
                  ]}
                >
                  ⏳ {notAssessedCount} Pending
                </Text>
              </View>
            )}
          </View>
        </Card>

        {/* List of 19 Checks */}
        <Text style={styles.sectionTitle}>CHECKLIST BREAKDOWN (RULE 6 & 9)</Text>
        {findings.map((f) => {
          return (
            <Card key={f.check_id} padding="md" style={styles.findingCard}>
              <View style={styles.rowBetween}>
                <View style={{ flex: 1 }}>
                  <View style={styles.rowAlign}>
                    <Text style={styles.checkCode}>{f.check_id}</Text>
                    <Text style={styles.checkName}>{f.title}</Text>
                  </View>
                  <Text style={styles.citationText}>{f.citation}</Text>
                </View>
                <VerdictBadge checkVerdict={f.effective_verdict} />
              </View>

              {/* Observed & Required Details */}
              <View style={styles.detailsBox}>
                <View style={{ marginBottom: 4 }}>
                  <Text style={styles.detailLabel}>Observed on package:</Text>
                  <Text style={styles.detailValue}>{f.observed}</Text>
                </View>
                <View>
                  <Text style={styles.detailLabel}>Statutory requirement:</Text>
                  <Text style={styles.detailRequired}>{f.required}</Text>
                </View>
                {f.reason && (
                  <View style={{ marginTop: 4 }}>
                    <Text style={[styles.detailLabel, { color: colors.violation.text }]}>Non-compliance ground:</Text>
                    <Text style={{ fontSize: 11, color: colors.violation.text }}>{f.reason}</Text>
                  </View>
                )}
                {f.human_verdict && (
                  <View style={styles.overrideNotice}>
                    <Text style={styles.overrideNoticeText}>
                      👤 Officer Override ({f.human_verdict.toUpperCase()}): {f.override_reason}
                    </Text>
                  </View>
                )}
              </View>

              {/* Override Button */}
              <View style={styles.cardActions}>
                <Pressable
                  onPress={() => handleOpenOverride(f)}
                  style={styles.overrideBtn}
                  hitSlop={6}
                >
                  <Text style={styles.overrideBtnText}>⚙️ Override Verdict…</Text>
                </Pressable>
              </View>
            </Card>
          );
        })}

        {/* Back / Confirm Action */}
        <View style={{ marginTop: spacing.md, marginBottom: spacing.xxl }}>
          <PrimaryButton
            title="✓ Confirm & Return to Package List"
            onPress={() => {
              if (onSaveFindings) onSaveFindings(findings);
              if (onBack) onBack();
            }}
          />
        </View>
      </ScrollView>

      {/* Officer Override Modal */}
      <Modal visible={!!selectedFinding} animationType="slide" transparent onRequestClose={() => setSelectedFinding(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Officer Finding Override</Text>
            <Text style={styles.modalSub}>
              {selectedFinding?.check_id}: {selectedFinding?.title}
            </Text>

            <Text style={[styles.sectionTitle, { marginTop: spacing.md }]}>NEW VERDICT</Text>
            <View style={styles.verdictRow}>
              <Pressable
                onPress={() => setOverrideVerdict('pass')}
                style={[
                  styles.verdictBtn,
                  overrideVerdict === 'pass' && {
                    backgroundColor: colors.pass.fill,
                    borderColor: colors.pass.border,
                  },
                ]}
              >
                <Text style={{ color: colors.pass.text, fontWeight: '700' }}>✓ Compliant (Pass)</Text>
              </Pressable>
              <Pressable
                onPress={() => setOverrideVerdict('fail')}
                style={[
                  styles.verdictBtn,
                  overrideVerdict === 'fail' && {
                    backgroundColor: colors.violation.fill,
                    borderColor: colors.violation.border,
                  },
                ]}
              >
                <Text style={{ color: colors.violation.text, fontWeight: '700' }}>⚠️ Violation (Fail)</Text>
              </Pressable>
            </View>

            <Text style={[styles.sectionTitle, { marginTop: spacing.md }]}>
              STATUTORY JUSTIFICATION (MIN 10 CHARS)
            </Text>
            <TextInput
              placeholder="State clear legal reasoning for overriding automated engine verdict…"
              placeholderTextColor={colors.placeholder}
              value={overrideReason}
              onChangeText={setOverrideReason}
              multiline
              numberOfLines={3}
              style={styles.reasonInput}
            />

            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg }}>
              <Pressable
                onPress={() => setSelectedFinding(null)}
                style={styles.modalCancelBtn}
              >
                <Text style={{ color: colors.textSecondary, fontWeight: '600' }}>Cancel</Text>
              </Pressable>
              <View style={{ flex: 1 }}>
                <PrimaryButton
                  title={submittingOverride ? 'Saving…' : 'Record Override'}
                  onPress={handleSaveOverride}
                  disabled={submittingOverride}
                />
              </View>
            </View>
          </View>
        </View>
      </Modal>
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
  headerCard: {
    marginBottom: spacing.md,
    backgroundColor: colors.surface,
  },
  packageTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.niyamBlue,
  },
  packageSub: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  statBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radius.sm,
    borderWidth: 1,
    marginRight: spacing.sm,
  },
  statBadgeText: {
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
  findingCard: {
    marginBottom: spacing.sm,
  },
  checkCode: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.netraTeal,
    backgroundColor: '#F0FDFA',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.sm,
    marginRight: spacing.xs,
  },
  checkName: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
    flex: 1,
  },
  citationText: {
    fontSize: 10,
    color: colors.textMuted,
    marginTop: 2,
  },
  detailsBox: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  detailLabel: {
    fontSize: 10,
    color: colors.textMuted,
    fontWeight: '600',
  },
  detailValue: {
    fontSize: 12,
    color: colors.text,
    fontWeight: '600',
  },
  detailRequired: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  overrideNotice: {
    marginTop: 4,
    padding: 6,
    backgroundColor: colors.info.fill,
    borderRadius: radius.sm,
  },
  overrideNoticeText: {
    fontSize: 10,
    color: colors.info.text,
    fontWeight: '600',
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: spacing.xs,
  },
  overrideBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  overrideBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.netraTeal,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.niyamBlue,
  },
  modalSub: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  verdictRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  verdictBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  reasonInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.sm,
    fontSize: 12,
    color: colors.text,
    backgroundColor: colors.white,
    height: 70,
    textAlignVertical: 'top',
    marginTop: spacing.xs,
  },
  modalCancelBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
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

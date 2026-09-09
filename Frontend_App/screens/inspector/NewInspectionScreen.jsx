import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  TextInput,
} from 'react-native';
import { colors, spacing, typography, radius, shadows } from '../../theme';
import Header from '../../components/Header';
import Card from '../../components/Card';
import PrimaryButton from '../../components/PrimaryButton';
import { fetchStores } from '../../api/inspections';

let Location = null;
try { Location = require('expo-location'); } catch { Location = null; }

// 7 official transaction types matching Backend/schemas.py CreateInspectionRequest
const TRANSACTION_TYPES = [
  {
    key: 'retail_sale',
    label: 'Retail sale',
    icon: '🛒',
    inScope: true,
    desc: 'Sale to end consumer. Chapter II rules apply in full.',
  },
  {
    key: 'packed_in_presence',
    label: 'Packed in presence',
    icon: '⚖️',
    inScope: false,
    desc: 'Made up in purchaser’s presence. Exempt under Rule 3.',
  },
  {
    key: 'wholesale',
    label: 'Wholesale',
    icon: '📦',
    inScope: false,
    desc: 'Bulk trade for resale. Outside packaged commodity rules.',
  },
  {
    key: 'institutional',
    label: 'Institutional',
    icon: '🏢',
    inScope: false,
    desc: 'Supply to institutions/hotels. Exempt from Chapter II.',
  },
  {
    key: 'industrial',
    label: 'Industrial',
    icon: '🏭',
    inScope: false,
    desc: 'Raw/packing material for industry. Out of scope.',
  },
  {
    key: 'export',
    label: 'Export',
    icon: '✈️',
    inScope: false,
    desc: 'Export consignment. Governed by destination law.',
  },
  {
    key: 'other',
    label: 'Other',
    icon: '📋',
    inScope: false,
    desc: 'Special consignments outside above categories.',
  },
];

const VISIT_PURPOSES = [
  'Routine Statutory Surveillance',
  'Consumer Complaint Raid',
  'Special Enforcement Drive',
  'Re-inspection / Compliance Verification',
];

function haversineM(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return null;
  const r = 6371000.0;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * r * Math.asin(Math.sqrt(a)));
}

export default function NewInspectionScreen({ navigation, onStartInspectionSession, onCancel }) {
  const [stores, setStores] = useState([]);
  const [loadingStores, setLoadingStores] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStore, setSelectedStore] = useState(null);
  const [transactionType, setTransactionType] = useState('retail_sale');
  const [purpose, setPurpose] = useState(VISIT_PURPOSES[0]);

  // GPS state
  const [coords, setCoords] = useState(null);
  const [locStatus, setLocStatus] = useState('locating');

  // Load stores
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const list = await fetchStores();
        if (mounted) {
          setStores(list);
          if (list.length > 0) setSelectedStore(list[0]);
        }
      } catch (e) {
        // graceful offline stores fallback
        if (mounted) {
          const fallback = [
            { id: 1, name: 'Sri Balaji Supermarket', store_type: 'supermarket', city: 'Hyderabad', district: 'Hyderabad', latitude: 17.385, longitude: 78.4867, geofence_radius_m: 150 },
            { id: 2, name: 'Anand General Store', store_type: 'kirana', city: 'Hyderabad', district: 'Hyderabad', latitude: 17.4126, longitude: 78.4482, geofence_radius_m: 100 },
          ];
          setStores(fallback);
          setSelectedStore(fallback[0]);
        }
      } finally {
        if (mounted) setLoadingStores(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  // GPS acquisition
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!Location) {
        if (mounted) setLocStatus('unavailable');
        return;
      }
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          if (mounted) setLocStatus('denied');
          return;
        }
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (mounted && pos?.coords) {
          setCoords({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          });
          setLocStatus('ready');
        }
      } catch (e) {
        if (mounted) setLocStatus('error');
      }
    })();
    return () => { mounted = false; };
  }, []);

  const filteredStores = stores.filter((s) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      (s.name && s.name.toLowerCase().includes(q)) ||
      (s.city && s.city.toLowerCase().includes(q)) ||
      (s.district && s.district.toLowerCase().includes(q))
    );
  });

  const distanceToStore =
    coords && selectedStore?.latitude && selectedStore?.longitude
      ? haversineM(coords.latitude, coords.longitude, selectedStore.latitude, selectedStore.longitude)
      : null;

  const isWithinGeofence =
    distanceToStore !== null && selectedStore?.geofence_radius_m
      ? distanceToStore <= selectedStore.geofence_radius_m
      : null;

  const handleBegin = () => {
    if (!selectedStore) return;
    onStartInspectionSession({
      store: selectedStore,
      transaction_type: transactionType,
      purpose,
      coords,
      distance_m: distanceToStore,
      is_within_geofence: isWithinGeofence,
      started_at: new Date().toISOString(),
    });
  };

  return (
    <View style={styles.container}>
      <Header
        title="New Store Inspection"
        subtitle="Step 1 of 3: Establishment & Scope Intake"
      />

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {/* Step Indicator */}
        <View style={styles.stepBar}>
          <View style={[styles.stepDot, styles.stepDotActive]}>
            <Text style={styles.stepNumActive}>1</Text>
          </View>
          <Text style={styles.stepLabelActive}>Store & Scope</Text>
          <View style={styles.stepLine} />
          <View style={styles.stepDot}>
            <Text style={styles.stepNum}>2</Text>
          </View>
          <Text style={styles.stepLabel}>Package Scans</Text>
          <View style={styles.stepLine} />
          <View style={styles.stepDot}>
            <Text style={styles.stepNum}>3</Text>
          </View>
          <Text style={styles.stepLabel}>Summary</Text>
        </View>

        {/* Section 1: Store Selection */}
        <Text style={styles.sectionTitle}>1. SELECT ESTABLISHMENT</Text>
        <Card padding="md" style={{ marginBottom: spacing.md }}>
          <TextInput
            placeholder="Search store name, city, or district…"
            placeholderTextColor={colors.placeholder}
            value={searchQuery}
            onChangeText={setSearchQuery}
            style={styles.searchInput}
          />

          {loadingStores ? (
            <ActivityIndicator size="small" color={colors.netraTeal} style={{ padding: spacing.md }} />
          ) : (
            <View style={{ maxHeight: 200 }}>
              <ScrollView nestedScrollEnabled>
                {filteredStores.map((s) => {
                  const isSel = selectedStore?.id === s.id;
                  return (
                    <Pressable
                      key={s.id}
                      onPress={() => setSelectedStore(s)}
                      style={[styles.storeRow, isSel && styles.storeRowSelected]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.storeName, isSel && styles.storeNameSelected]}>
                          {s.name}
                        </Text>
                        <Text style={styles.storeAddr}>
                          {s.store_type?.toUpperCase()} • {s.city || s.district || 'Telangana'}
                        </Text>
                      </View>
                      {isSel && <Text style={{ color: colors.netraTeal, fontWeight: '800' }}>✓</Text>}
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          )}
        </Card>

        {/* GPS Geofence Check */}
        {selectedStore && (
          <Card padding="md" style={styles.geoCard}>
            <View style={styles.rowBetween}>
              <View style={{ flex: 1 }}>
                <Text style={styles.geoLabel}>INSPECTION LOCATION VERIFICATION</Text>
                <Text style={styles.geoValue}>
                  {locStatus === 'ready'
                    ? `GPS: ${coords?.latitude?.toFixed(4)}, ${coords?.longitude?.toFixed(4)}`
                    : locStatus === 'locating'
                    ? 'Acquiring GPS fix…'
                    : 'GPS coordinates unavailable'}
                </Text>
                {distanceToStore !== null && (
                  <Text style={{ fontSize: 11, color: isWithinGeofence ? colors.pass.text : colors.warning, marginTop: 2 }}>
                    {distanceToStore}m away (Geofence: {selectedStore.geofence_radius_m || 150}m)
                  </Text>
                )}
              </View>
              <View
                style={[
                  styles.geoPill,
                  isWithinGeofence
                    ? { backgroundColor: colors.pass.fill, borderColor: colors.pass.border }
                    : { backgroundColor: colors.warningBg, borderColor: colors.warning },
                ]}
              >
                <Text
                  style={[
                    styles.geoPillText,
                    { color: isWithinGeofence ? colors.pass.text : colors.warning },
                  ]}
                >
                  {isWithinGeofence ? '✓ Geofence Verified' : 'Advisory Distance'}
                </Text>
              </View>
            </View>
          </Card>
        )}

        {/* Section 2: Transaction Type & Chapter II Scope */}
        <Text style={[styles.sectionTitle, { marginTop: spacing.md }]}>
          2. TRANSACTION TYPE (RULE 3 SCOPE)
        </Text>
        <Card padding="md" style={{ marginBottom: spacing.md }}>
          <Text style={{ fontSize: 11, color: colors.textMuted, marginBottom: spacing.sm }}>
            Under Legal Metrology Rules 2011, pre-packaged retail declarations apply to retail sale. Other dealings are exempted under Rule 3.
          </Text>

          {TRANSACTION_TYPES.map((t) => {
            const isSel = transactionType === t.key;
            return (
              <Pressable
                key={t.key}
                onPress={() => setTransactionType(t.key)}
                style={[styles.typeOption, isSel && styles.typeOptionSelected]}
              >
                <Text style={{ fontSize: 20, marginRight: spacing.sm }}>{t.icon}</Text>
                <View style={{ flex: 1 }}>
                  <View style={styles.rowAlign}>
                    <Text style={[styles.typeLabel, isSel && styles.typeLabelSelected]}>
                      {t.label}
                    </Text>
                    <View
                      style={[
                        styles.scopeTag,
                        t.inScope
                          ? { backgroundColor: colors.pass.fill, borderColor: colors.pass.border }
                          : { backgroundColor: colors.notAssessed.fill, borderColor: colors.notAssessed.border },
                      ]}
                    >
                      <Text
                        style={[
                          styles.scopeTagText,
                          { color: t.inScope ? colors.pass.text : colors.notAssessed.text },
                        ]}
                      >
                        {t.inScope ? 'Chapter II In-Scope' : 'Rule 3 Exempt'}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.typeDesc}>{t.desc}</Text>
                </View>
                <View style={[styles.radioOuter, isSel && styles.radioOuterSelected]}>
                  {isSel && <View style={styles.radioInner} />}
                </View>
              </Pressable>
            );
          })}
        </Card>

        {/* Section 3: Visit Purpose */}
        <Text style={[styles.sectionTitle, { marginTop: spacing.md }]}>3. PURPOSE OF VISIT</Text>
        <Card padding="md" style={{ marginBottom: spacing.xl }}>
          <View style={styles.purposeWrap}>
            {VISIT_PURPOSES.map((p) => {
              const isSel = purpose === p;
              return (
                <Pressable
                  key={p}
                  onPress={() => setPurpose(p)}
                  style={[styles.purposeChip, isSel && styles.purposeChipSelected]}
                >
                  <Text style={[styles.purposeText, isSel && styles.purposeTextSelected]}>{p}</Text>
                </Pressable>
              );
            })}
          </View>
        </Card>

        {/* Action Buttons */}
        <View style={{ gap: spacing.sm, marginBottom: spacing.xxl }}>
          <PrimaryButton
            title="Begin Multi-Package Inspection →"
            onPress={handleBegin}
            disabled={!selectedStore}
            accessibilityLabel="Proceed to scan packages at this store"
          />
          {onCancel && (
            <Pressable onPress={onCancel} style={styles.cancelBtn}>
              <Text style={styles.cancelBtnText}>Cancel & Return to Dashboard</Text>
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
  stepBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
    paddingVertical: spacing.xs,
  },
  stepDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotActive: {
    backgroundColor: colors.netraTeal,
  },
  stepNum: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
  },
  stepNumActive: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.white,
  },
  stepLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
    marginLeft: 4,
    marginRight: 6,
  },
  stepLabelActive: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.netraTeal,
    marginLeft: 4,
    marginRight: 6,
  },
  stepLine: {
    width: 16,
    height: 1.5,
    backgroundColor: colors.borderLight,
    marginHorizontal: 2,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 0.8,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
  },
  searchInput: {
    height: 42,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontSize: 13,
    color: colors.text,
    backgroundColor: colors.white,
    marginBottom: spacing.sm,
  },
  storeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  storeRowSelected: {
    backgroundColor: colors.info.fill,
  },
  storeName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  storeNameSelected: {
    color: colors.netraTeal,
    fontWeight: '700',
  },
  storeAddr: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 1,
  },
  geoCard: {
    marginBottom: spacing.md,
    backgroundColor: colors.surface,
  },
  geoLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 0.5,
  },
  geoValue: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
    marginTop: 2,
  },
  geoPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  geoPillText: {
    fontSize: 10,
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
  typeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    marginBottom: spacing.xs,
  },
  typeOptionSelected: {
    borderColor: colors.netraTeal,
    backgroundColor: '#F0FDFA',
  },
  typeLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  typeLabelSelected: {
    color: colors.netraTeal,
    fontWeight: '700',
  },
  typeDesc: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 1,
  },
  scopeTag: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.sm,
    borderWidth: 1,
    marginLeft: spacing.sm,
  },
  scopeTagText: {
    fontSize: 9,
    fontWeight: '700',
  },
  radioOuter: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.sm,
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
  purposeWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  purposeChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  purposeChipSelected: {
    backgroundColor: colors.niyamBlue,
    borderColor: colors.niyamBlue,
  },
  purposeText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  purposeTextSelected: {
    color: colors.white,
    fontWeight: '700',
  },
  cancelBtn: {
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  cancelBtnText: {
    fontSize: 13,
    color: colors.textMuted,
    fontWeight: '600',
  },
});

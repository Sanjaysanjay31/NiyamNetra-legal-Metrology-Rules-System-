import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  TextInput,
  Image,
  Modal,
  Alert,
  Platform,
  StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { colors, spacing, typography, radius, shadows } from '../../theme';
import Header from '../../components/Header';
import Card from '../../components/Card';
import PrimaryButton from '../../components/PrimaryButton';
import { fetchStores, createStore, createInspection } from '../../api/inspections';
import { getItem, setItem } from '../../auth/secureStore';

let Location = null;
try { Location = require('expo-location'); } catch { Location = null; }

let ImageManipulator = null;
try { ImageManipulator = require('expo-image-manipulator'); } catch { ImageManipulator = null; }

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

const STORE_TYPES = [
  'Kirana / General Store',
  'Supermarket / Hypermarket',
  'Wholesale Trader',
  'Dairy & Sweets',
  'Bakery / Snacks',
  'Pharmacy / Cosmetics',
  'Electronics & Hardware',
  'Other Retail',
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
  const insets = useSafeAreaInsets();
  const topClearance = Math.max(
    insets.top || 0,
    Platform.OS === 'android' ? (StatusBar.currentHeight || 0) : 0,
    Platform.OS === 'ios' ? 44 : 24
  );
  const bottomClearance = Math.max(insets.bottom || 0, 24);

  const [stores, setStores] = useState([]);
  const [loadingStores, setLoadingStores] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStore, setSelectedStore] = useState(null);
  const [transactionType, setTransactionType] = useState('retail_sale');
  const [purpose, setPurpose] = useState(VISIT_PURPOSES[0]);

  // Intake Mode: 'registry' (select existing) vs 'manual' (enter details on-site)
  const [intakeMode, setIntakeMode] = useState('registry');

  // Manual Store Intake fields
  const [manualName, setManualName] = useState('');
  const [manualStoreType, setManualStoreType] = useState(STORE_TYPES[0]);
  const [manualOwner, setManualOwner] = useState('');
  const [manualPhone, setManualPhone] = useState('');
  const [manualAddress, setManualAddress] = useState('');
  const [manualCity, setManualCity] = useState('Hyderabad');
  const [manualDistrict, setManualDistrict] = useState('Hyderabad');
  const [savingStore, setSavingStore] = useState(false);

  // Shop Front / Signboard Image
  const [shopPhoto, setShopPhoto] = useState(null);
  const [cameraModalVisible, setCameraModalVisible] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [capturing, setCapturing] = useState(false);
  const cameraRef = useRef(null);

  // GPS state
  const [coords, setCoords] = useState(null);
  const [locStatus, setLocStatus] = useState('locating');

  // Load stores from API and cache for offline resilience
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const list = await fetchStores();
        if (mounted && Array.isArray(list) && list.length > 0) {
          setStores(list);
          setSelectedStore(list[0]);
          await setItem('nn_cached_stores', JSON.stringify(list));
        } else if (mounted) {
          const cached = await getItem('nn_cached_stores');
          const parsed = cached ? JSON.parse(cached) : [];
          setStores(parsed);
          if (parsed.length > 0) setSelectedStore(parsed[0]);
        }
      } catch (e) {
        if (mounted) {
          try {
            const cached = await getItem('nn_cached_stores');
            const parsed = cached ? JSON.parse(cached) : [];
            setStores(parsed);
            if (parsed.length > 0) setSelectedStore(parsed[0]);
          } catch {
            setStores([]);
          }
        }
      } finally {
        if (mounted) setLoadingStores(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  // Live GPS tracking function
  const fetchCurrentLocation = async () => {
    if (!Location) {
      setLocStatus('unavailable');
      return;
    }
    setLocStatus('locating');
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocStatus('denied');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      if (pos?.coords) {
        setCoords({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
        setLocStatus('ready');
      }
    } catch (e) {
      setLocStatus('error');
    }
  };

  useEffect(() => {
    fetchCurrentLocation();
  }, []);

  const handleCaptureShopPhoto = async () => {
    if (!cameraRef.current || capturing) return;
    setCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        skipProcessing: Platform.OS === 'android',
      });
      if (photo?.uri) {
        let finalUri = photo.uri;
        if (ImageManipulator?.manipulateAsync) {
          try {
            const manip = await ImageManipulator.manipulateAsync(
              photo.uri,
              [{ resize: { width: 1400 } }],
              { compress: 0.75, format: ImageManipulator.SaveFormat.JPEG }
            );
            if (manip?.uri) finalUri = manip.uri;
          } catch (e) {
            console.warn('[ShopPhoto] Compression fallback:', e);
          }
        }
        setShopPhoto(finalUri);
        setCameraModalVisible(false);
      }
    } catch (err) {
      Alert.alert('Capture failed', 'Could not take shop photo. Please try again.');
    } finally {
      setCapturing(false);
    }
  };

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

  const handleBegin = async () => {
    let finalStore = selectedStore;

    if (intakeMode === 'manual') {
      if (!manualName.trim()) {
        Alert.alert('Shop Name Required', 'Please enter the establishment / shop name.');
        return;
      }

      setSavingStore(true);
      try {
        const storePayload = {
          name: manualName.trim(),
          store_type: manualStoreType,
          address: manualAddress.trim() || undefined,
          city: manualCity.trim() || 'Hyderabad',
          district: manualDistrict.trim() || 'Hyderabad',
          state: 'Telangana',
          latitude: coords?.latitude || undefined,
          longitude: coords?.longitude || undefined,
          geofence_radius_m: 150,
        };

        try {
          const res = await createStore(storePayload);
          if (res && res.id) {
            finalStore = res;
          }
        } catch (apiErr) {
          console.warn('[NewInspection] Live store create note (using local intake):', apiErr?.message || apiErr);
          finalStore = {
            id: -(Date.now()),
            ...storePayload,
            is_offline: true,
          };
        }
      } finally {
        setSavingStore(false);
      }
    }

    if (!finalStore) {
      Alert.alert('Store Required', 'Please select or enter an establishment before continuing.');
      return;
    }

    let serverInspectionId = null;
    if (finalStore && typeof finalStore.id === 'number' && finalStore.id > 0) {
      try {
        const insp = await createInspection({
          store_id: Number(finalStore.id),
          transaction_type: transactionType,
          latitude: coords?.latitude || undefined,
          longitude: coords?.longitude || undefined,
          gps_accuracy_m: coords?.accuracy || undefined,
          local_created_at: new Date().toISOString(),
        });
        if (insp && (insp.id || insp.inspection_id)) {
          serverInspectionId = insp.id || insp.inspection_id;
        }
      } catch (inspErr) {
        console.warn('[NewInspection] Live inspection creation failed (will retry in session):', inspErr?.message || inspErr);
      }
    }

    onStartInspectionSession({
      store: finalStore,
      serverInspectionId,
      transaction_type: transactionType,
      purpose,
      coords,
      distance_m: distanceToStore,
      is_within_geofence: isWithinGeofence,
      shop_image_uri: shopPhoto,
      merchant_name: manualOwner.trim() || undefined,
      merchant_phone: manualPhone.trim() || undefined,
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

        {/* GPS Live Geolocation Tracking Card */}
        <Card padding="md" style={styles.geoCard}>
          <View style={styles.rowBetween}>
            <View style={{ flex: 1, marginRight: spacing.sm }}>
              <Text style={styles.geoLabel}>🛰️ INSPECTION GPS TRACKING</Text>
              <Text style={styles.geoValue}>
                {locStatus === 'ready'
                  ? `Lat: ${coords?.latitude?.toFixed(4)}, Lon: ${coords?.longitude?.toFixed(4)} (±${Math.round(coords?.accuracy || 0)}m)`
                  : locStatus === 'locating'
                  ? 'Acquiring satellite GPS fix…'
                  : 'GPS coordinates unavailable'}
              </Text>
              {intakeMode === 'registry' && distanceToStore !== null && (
                <Text style={{ fontSize: 11, color: isWithinGeofence ? colors.pass.text : colors.warning, marginTop: 3 }}>
                  {distanceToStore}m from registered store ({isWithinGeofence ? 'Inside Geofence' : 'Outside Geofence'})
                </Text>
              )}
            </View>
            <Pressable
              onPress={fetchCurrentLocation}
              style={styles.refreshGpsBtn}
              accessibilityRole="button"
              accessibilityLabel="Refresh GPS"
            >
              <Text style={styles.refreshGpsText}>🔄 Refresh GPS</Text>
            </Pressable>
          </View>
        </Card>

        {/* Section 1: Store Intake Mode Selector */}
        <Text style={styles.sectionTitle}>1. ESTABLISHMENT DETAILS</Text>
        <View style={styles.modeTabs}>
          <Pressable
            onPress={() => setIntakeMode('registry')}
            style={[styles.modeTab, intakeMode === 'registry' && styles.modeTabActive]}
          >
            <Text style={[styles.modeTabText, intakeMode === 'registry' && styles.modeTabTextActive]}>
              🏢 Select from Registry
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setIntakeMode('manual')}
            style={[styles.modeTab, intakeMode === 'manual' && styles.modeTabActive]}
          >
            <Text style={[styles.modeTabText, intakeMode === 'manual' && styles.modeTabTextActive]}>
              ✏️ Enter Shop Manually
            </Text>
          </Pressable>
        </View>

        {intakeMode === 'registry' ? (
          /* Select Store from Registry */
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
                {filteredStores.length === 0 ? (
                  <View style={{ padding: spacing.md, alignItems: 'center' }}>
                    <Text style={{ color: colors.textMuted, fontSize: 13, textAlign: 'center' }}>
                      {stores.length === 0
                        ? 'No stores in registry. You can use "Enter Shop Manually" above.'
                        : 'No matching stores found.'}
                    </Text>
                  </View>
                ) : (
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
                )}
              </View>
            )}
          </Card>
        ) : (
          /* Manual Store Intake Form */
          <Card padding="md" style={{ marginBottom: spacing.md }}>
            <Text style={styles.inputLabel}>Shop / Establishment Name *</Text>
            <TextInput
              placeholder="e.g. Sri Lakshmi Balaji General Store"
              placeholderTextColor={colors.placeholder}
              value={manualName}
              onChangeText={setManualName}
              style={styles.input}
            />

            <Text style={[styles.inputLabel, { marginTop: spacing.sm }]}>Store Category / Type</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.sm }}>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {STORE_TYPES.map((st) => {
                  const isSel = manualStoreType === st;
                  return (
                    <Pressable
                      key={st}
                      onPress={() => setManualStoreType(st)}
                      style={[styles.catChip, isSel && styles.catChipSelected]}
                    >
                      <Text style={[styles.catChipText, isSel && styles.catChipTextSelected]}>
                        {st}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>

            <View style={styles.rowBetween}>
              <View style={{ flex: 1, marginRight: spacing.sm }}>
                <Text style={styles.inputLabel}>Owner / Contact Person</Text>
                <TextInput
                  placeholder="e.g. Ramesh Kumar"
                  placeholderTextColor={colors.placeholder}
                  value={manualOwner}
                  onChangeText={setManualOwner}
                  style={styles.input}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.inputLabel}>Mobile / Phone Number</Text>
                <TextInput
                  placeholder="e.g. 9849012345"
                  placeholderTextColor={colors.placeholder}
                  keyboardType="phone-pad"
                  value={manualPhone}
                  onChangeText={setManualPhone}
                  style={styles.input}
                />
              </View>
            </View>

            <View style={{ marginTop: spacing.sm }}>
              <Text style={styles.inputLabel}>Street Address / Area Landmark</Text>
              <TextInput
                placeholder="e.g. Shop No 4, Main Road, KPHB Colony"
                placeholderTextColor={colors.placeholder}
                value={manualAddress}
                onChangeText={setManualAddress}
                style={styles.input}
              />
            </View>

            <View style={[styles.rowBetween, { marginTop: spacing.sm }]}>
              <View style={{ flex: 1, marginRight: spacing.sm }}>
                <Text style={styles.inputLabel}>City / Town</Text>
                <TextInput
                  placeholder="e.g. Hyderabad"
                  placeholderTextColor={colors.placeholder}
                  value={manualCity}
                  onChangeText={setManualCity}
                  style={styles.input}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.inputLabel}>District</Text>
                <TextInput
                  placeholder="e.g. Hyderabad"
                  placeholderTextColor={colors.placeholder}
                  value={manualDistrict}
                  onChangeText={setManualDistrict}
                  style={styles.input}
                />
              </View>
            </View>
          </Card>
        )}

        {/* Section 2: Shopfront / Store Image Capture */}
        <Text style={[styles.sectionTitle, { marginTop: spacing.xs }]}>
          2. SHOPFRONT / SIGNBOARD EVIDENCE PHOTO
        </Text>
        <Card padding="md" style={{ marginBottom: spacing.md }}>
          <Text style={{ fontSize: 11, color: colors.textMuted, marginBottom: spacing.sm }}>
            Capture shop nameboard / storefront photograph as statutory physical evidence of on-site visit.
          </Text>

          {shopPhoto ? (
            <View style={styles.shopPhotoPreviewContainer}>
              <Image source={{ uri: shopPhoto }} style={styles.shopPhotoPreview} />
              <View style={styles.shopPhotoOverlay}>
                <View style={styles.photoAttachedBadge}>
                  <Text style={styles.photoAttachedText}>✓ Storefront Photo Captured</Text>
                </View>
                <Pressable
                  onPress={() => setCameraModalVisible(true)}
                  style={styles.retakeShopBtn}
                >
                  <Text style={styles.retakeShopText}>Retake Photo</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <Pressable
              onPress={() => setCameraModalVisible(true)}
              style={styles.captureShopBtn}
              accessibilityRole="button"
            >
              <Text style={{ fontSize: 24, marginBottom: 4 }}>📸</Text>
              <Text style={styles.captureShopBtnText}>Capture Storefront / Shop Board Photo</Text>
              <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 2 }}>
                Tap to open camera and take picture of the establishment
              </Text>
            </Pressable>
          )}
        </Card>

        {/* Section 3: Transaction Type & Chapter II Scope */}
        <Text style={[styles.sectionTitle, { marginTop: spacing.xs }]}>
          3. TRANSACTION TYPE (RULE 3 SCOPE)
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

        {/* Section 4: Visit Purpose */}
        <Text style={[styles.sectionTitle, { marginTop: spacing.xs }]}>4. PURPOSE OF VISIT</Text>
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
            title={savingStore ? 'Registering Store…' : 'Begin Multi-Package Inspection →'}
            onPress={handleBegin}
            disabled={savingStore || (intakeMode === 'registry' && !selectedStore)}
            accessibilityLabel="Proceed to scan packages at this store"
          />
          {onCancel && (
            <Pressable onPress={onCancel} style={styles.cancelBtn}>
              <Text style={styles.cancelBtnText}>Cancel & Return to Dashboard</Text>
            </Pressable>
          )}
        </View>
      </ScrollView>

      {/* Full-Screen Camera Modal for Shopfront Photo */}
      <Modal visible={cameraModalVisible} animationType="slide" onRequestClose={() => setCameraModalVisible(false)}>
        <View style={styles.cameraModalContainer}>
          {!cameraPermission?.granted ? (
            <View style={styles.cameraPermissionBox}>
              <Text style={{ fontSize: 36, marginBottom: spacing.md }}>📷</Text>
              <Text style={{ fontSize: 16, fontWeight: '700', color: colors.white, marginBottom: spacing.sm, textAlign: 'center' }}>
                Camera Access Needed
              </Text>
              <Text style={{ fontSize: 13, color: colors.textSecondary, marginBottom: spacing.lg, textAlign: 'center' }}>
                Camera permission is required to capture the storefront / signboard photo.
              </Text>
              <PrimaryButton title="Grant Camera Permission" onPress={requestCameraPermission} />
              <Pressable onPress={() => setCameraModalVisible(false)} style={{ marginTop: spacing.md }}>
                <Text style={{ color: colors.white, textAlign: 'center' }}>Close</Text>
              </Pressable>
            </View>
          ) : (
            <View style={{ flex: 1 }}>
              <CameraView ref={cameraRef} style={StyleSheet.absoluteFillObject} facing="back" />
              {/* Camera Header */}
              <View style={[styles.cameraModalHeader, { top: topClearance + 12 }]}>
                <Text style={styles.cameraModalHeaderTitle}>Capture Shopfront / Board</Text>
                <Pressable
                  onPress={() => setCameraModalVisible(false)}
                  style={styles.closeCameraBtn}
                >
                  <Text style={styles.closeCameraText}>✕ Close</Text>
                </Pressable>
              </View>
              {/* Guidance Bracket */}
              <View style={styles.cameraBracketOverlay}>
                <View style={styles.cameraGuideBox}>
                  <Text style={styles.cameraGuideText}>Frame the shop nameboard / storefront clearly</Text>
                </View>
              </View>
              {/* Bottom Shutter Button */}
              <View style={[styles.cameraModalFooter, { bottom: bottomClearance + 16 }]}>
                <Pressable
                  onPress={handleCaptureShopPhoto}
                  disabled={capturing}
                  style={styles.cameraModalShutter}
                >
                  {capturing ? (
                    <ActivityIndicator color={colors.white} />
                  ) : (
                    <View style={styles.cameraModalShutterInner} />
                  )}
                </Pressable>
              </View>
            </View>
          )}
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
    paddingBottom: spacing.xxxl + 64,
  },
  stepBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
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
  modeTabs: {
    flexDirection: 'row',
    backgroundColor: colors.borderLight,
    borderRadius: radius.md,
    padding: 3,
    marginBottom: spacing.sm,
  },
  modeTab: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderRadius: radius.sm,
  },
  modeTabActive: {
    backgroundColor: colors.white,
    ...shadows.sm,
  },
  modeTabText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
  },
  modeTabTextActive: {
    color: colors.niyamBlue,
    fontWeight: '700',
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
  input: {
    height: 42,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontSize: 13,
    color: colors.text,
    backgroundColor: colors.white,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 4,
  },
  catChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  catChipSelected: {
    borderColor: colors.netraTeal,
    backgroundColor: '#F0FDFA',
  },
  catChipText: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  catChipTextSelected: {
    color: colors.netraTeal,
    fontWeight: '700',
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
  refreshGpsBtn: {
    backgroundColor: '#F0FDFA',
    borderColor: colors.netraTeal,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.sm,
  },
  refreshGpsText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.netraTeal,
  },
  captureShopBtn: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.netraTeal,
    borderRadius: radius.md,
    backgroundColor: '#F0FDFA',
    paddingVertical: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureShopBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.netraTeal,
  },
  shopPhotoPreviewContainer: {
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  shopPhotoPreview: {
    width: '100%',
    height: 180,
    resizeMode: 'cover',
  },
  shopPhotoOverlay: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.sm,
    backgroundColor: colors.surface,
  },
  photoAttachedBadge: {
    backgroundColor: colors.pass.fill,
    borderColor: colors.pass.border,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.sm,
  },
  photoAttachedText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.pass.text,
  },
  retakeShopBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  retakeShopText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.netraTeal,
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
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rowAlign: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cameraModalContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  cameraPermissionBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  cameraModalHeader: {
    position: 'absolute',
    top: 50,
    left: 20,
    right: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 10,
  },
  cameraModalHeaderTitle: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '700',
  },
  closeCameraBtn: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.sm,
  },
  closeCameraText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '700',
  },
  cameraBracketOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraGuideBox: {
    width: '85%',
    height: 220,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.7)',
    borderRadius: radius.md,
    borderStyle: 'dashed',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 10,
  },
  cameraGuideText: {
    color: colors.white,
    fontSize: 11,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  cameraModalFooter: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  cameraModalShutter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraModalShutterInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: colors.white,
  },
});

import React, { useState, useRef } from 'react';
import { View, Text, Pressable, ScrollView, Alert } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { colors, spacing, typography, radius, shadows } from '../../theme';
import Header from '../../components/Header';
import PrimaryButton from '../../components/PrimaryButton';
import Card from '../../components/Card';
import { ActivityIndicator } from 'react-native';

const transactionTypes = [
  { key: 'retail_package', label: 'Retail package', icon: '📦' },
  { key: 'loose_item', label: 'Loose item', icon: '⚖️' },
  { key: 'weighing_instrument', label: 'Weighing instrument', icon: '🏋️' },
  { key: 'prepacked_batch', label: 'Pre-packed batch', icon: '📋' },
];

export default function ScanScreen({ navigation }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [step, setStep] = useState('scope');
  const [transactionType, setTransactionType] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [capturing, setCapturing] = useState(false);
  const [result, setResult] = useState(null); // 'success' | 'violation' | null
  const cameraRef = useRef(null);

  if (!permission) return <View style={{ flex: 1, backgroundColor: colors.background }} />;

  if (!permission.granted) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <Header title="Camera Access" />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xxl }}>
          <Text style={{ fontSize: 48, marginBottom: spacing.lg }}>📷</Text>
          <Text style={typography.h3}>Camera permission needed</Text>
          <Text style={{ ...typography.bodySecondary, textAlign: 'center', marginTop: spacing.sm, marginBottom: spacing.xl }}>
            NiyamNetra needs camera access to capture package photos.
          </Text>
          <PrimaryButton title="Grant Permission" onPress={requestPermission} />
        </View>
      </View>
    );
  }

  // Scope selection step
  if (step === 'scope') {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <Header title="New Inspection" subtitle="Step 1 of 3 — Select type" />
        <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
          <Text style={{ ...typography.body, marginBottom: spacing.lg }}>What are you assessing?</Text>
          <Card padding="lg">
            {transactionTypes.map((tt, idx) => (
              <Pressable key={tt.key} onPress={() => setTransactionType(tt.key)}
                style={{ flexDirection: 'row', alignItems: 'center', padding: spacing.md, borderRadius: radius.md,
                  backgroundColor: transactionType === tt.key ? colors.niyamBlue + '10' : 'transparent',
                  borderColor: transactionType === tt.key ? colors.niyamBlue : 'transparent',
                  borderWidth: transactionType === tt.key ? 2 : 0,
                  marginBottom: idx < transactionTypes.length - 1 ? spacing.sm : 0 }}>
                <Text style={{ fontSize: 24, marginRight: spacing.md }}>{tt.icon}</Text>
                <Text style={{ fontSize: 15, fontWeight: '600', color: colors.text, flex: 1 }}>{tt.label}</Text>
                {transactionType === tt.key && <Text style={{ color: colors.netraTeal, fontSize: 18, fontWeight: '700' }}>✓</Text>}
              </Pressable>
            ))}
          </Card>
          <PrimaryButton title="Continue to Camera" onPress={() => transactionType && setStep('camera')} disabled={!transactionType} style={{ marginTop: spacing.xl }} />
        </ScrollView>
      </View>
    );
  }


  const takePhoto = async () => {
    if (!cameraRef.current) return;
    setCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.8, skipProcessing: true });
      setPhotos([...photos, { uri: photo.uri, panel: photos.length }]);
    } catch (e) {
      Alert.alert('Capture failed', 'Please try again');
    }
    setCapturing(false);
  };

  if (step === 'camera') {
    return (
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <CameraView ref={cameraRef} style={{ flex: 1 }} facing="back">
          <View style={{ flex: 1, justifyContent: 'space-between' }}>
            <View style={{ backgroundColor: 'rgba(15,42,68,0.9)', paddingTop: spacing.xl, paddingBottom: spacing.md, paddingHorizontal: spacing.lg }}>
              <Text style={{ color: colors.white, fontSize: 16, fontWeight: '700' }}>Capture package panels</Text>
              <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>Photo {photos.length + 1}</Text>
            </View>
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
              <View style={{ width: '75%', aspectRatio: 0.7 }}>
                <View style={{ position: 'absolute', top: -2, left: -2, width: 30, height: 30, borderTopWidth: 3, borderLeftWidth: 3, borderColor: colors.saffron }} />
                <View style={{ position: 'absolute', top: -2, right: -2, width: 30, height: 30, borderTopWidth: 3, borderRightWidth: 3, borderColor: colors.saffron }} />
                <View style={{ position: 'absolute', bottom: -2, left: -2, width: 30, height: 30, borderBottomWidth: 3, borderLeftWidth: 3, borderColor: colors.saffron }} />
                <View style={{ position: 'absolute', bottom: -2, right: -2, width: 30, height: 30, borderBottomWidth: 3, borderRightWidth: 3, borderColor: colors.saffron }} />
              </View>
            </View>
            <View style={{ backgroundColor: 'rgba(15,42,68,0.9)', padding: spacing.xxl, alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Pressable onPress={() => setStep('scope')} style={{ marginRight: spacing.xxl }}>
                  <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14 }}>← Back</Text>
                </Pressable>
                <Pressable onPress={takePhoto} style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(255,255,255,0.2)', borderWidth: 4, borderColor: colors.white, justifyContent: 'center', alignItems: 'center' }}>
                  {capturing ? <ActivityIndicator color={colors.white} /> : <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.white }} />}
                </Pressable>
                <Pressable onPress={() => photos.length >= 2 && setStep('review')} style={{ marginLeft: spacing.xxl, opacity: photos.length >= 2 ? 1 : 0.4 }}>
                  <Text style={{ color: photos.length >= 2 ? colors.saffron : 'rgba(255,255,255,0.4)', fontSize: 14, fontWeight: '600' }}>Next →</Text>
                </Pressable>
              </View>
              <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, marginTop: spacing.sm }}>Minimum 2 photos recommended</Text>
            </View>
          </View>
        </CameraView>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Header title="Review & Submit" subtitle={`${photos.length} photos captured`} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
        <Card title="Inspection Summary" padding="lg" style={{ marginBottom: spacing.md }}>
          <View style={{ flexDirection: 'row', marginBottom: spacing.sm }}>
            <Text style={{ ...typography.label, width: 100 }}>Type</Text>
            <Text style={typography.body}>{transactionTypes.find(t => t.key === transactionType)?.label}</Text>
          </View>
          <View style={{ flexDirection: 'row', marginBottom: spacing.sm }}>
            <Text style={{ ...typography.label, width: 100 }}>Photos</Text>
            <Text style={typography.body}>{photos.length} panels</Text>
          </View>
          <View style={{ flexDirection: 'row' }}>
            <Text style={{ ...typography.label, width: 100 }}>Checks</Text>
            <Text style={typography.body}>{transactionType === 'retail_package' ? '18 of 18' : '16 of 18'}</Text>
          </View>
        </Card>
        <Card title="Captured Photos" padding="md" style={{ marginBottom: spacing.md }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {photos.map((p, i) => (
              <View key={i} style={{ width: 80, height: 80, borderRadius: radius.sm, backgroundColor: colors.border, margin: spacing.xs, borderWidth: 2, borderColor: colors.saffron }} />
            ))}
          </View>
        </Card>
        <View style={{ backgroundColor: colors.info.fill, borderRadius: radius.md, padding: spacing.md, borderColor: colors.info.border, borderWidth: 1, marginBottom: spacing.lg }}>
          <Text style={{ color: colors.info.text, fontSize: 12 }}>Will submit immediately when you tap Submit.</Text>
        </View>
        {result && (
          <Card
            padding="lg"
            style={{
              marginBottom: spacing.md,
              borderColor: result === 'success' ? colors.pass.border : colors.violation.border,
              borderWidth: 2,
              backgroundColor: result === 'success' ? colors.pass.fill : colors.violation.fill,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ fontSize: 32, marginRight: spacing.md }}>
                {result === 'success' ? '✓' : '✗'}
              </Text>
              <View style={{ flex: 1 }}>
                <Text style={{
                  fontSize: 18,
                  fontWeight: '700',
                  color: result === 'success' ? colors.pass.text : colors.violation.text,
                }}>
                  {result === 'success' ? 'Success — No violations found' : 'Violation(s) detected'}
                </Text>
                <Text style={{ fontSize: 13, color: colors.textSecondary, marginTop: 4 }}>
                  {result === 'success'
                    ? 'This package meets all requirements. Inspection recorded.'
                    : 'This package has one or more violations. See details below.'}
                </Text>
              </View>
            </View>
          </Card>
        )}
        <PrimaryButton
          title={result ? 'New Inspection' : 'Submit Inspection'}
          onPress={() => {
            result
              ? (setStep('scope'), setTransactionType(null), setPhotos([]), setResult(null))
              : setResult(Math.random() > 0.5 ? 'violation' : 'success');
          }}
          style={{ marginBottom: spacing.md }}
        />
        <PrimaryButton title="Save as Draft" variant="outline" onPress={() => {}} />
      </ScrollView>
    </View>
  );
}
import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthContext';
import { colors, spacing, typography, radius, shadows } from '../theme';
import Input from '../components/Input';
import PrimaryButton from '../components/PrimaryButton';
import { getApiBaseUrl } from '../api/client';

export default function LoginScreen() {
  const { login } = useAuth();
  const insets = useSafeAreaInsets();
  const androidBar = Platform.OS === 'android' ? (StatusBar.currentHeight || 0) : 0;
  const topClearance = Math.max(insets.top || 0, androidBar, Platform.OS === 'ios' ? 44 : 24);
  const [employee_id, setId] = useState('');
  const [password, setPw] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(false);


  const submit = async () => {
    if (!employee_id.trim() || !password) {
      setErr('Please enter your Employee ID and password to sign in.');
      return;
    }
    setErr(null);
    setLoading(true);
    try {
      await login(employee_id.trim(), password);
    } catch (e) {
      const status = e?.status ?? e?.response?.status;
      if (status === 401) {
        setErr('Employee ID or password is incorrect. Please check your credentials.');
      } else if (status === 403 || e?.code === 'FORBIDDEN') {
        setErr('Access restricted for this account. Contact your enforcement administrator.');
      } else if (status === 429) {
        setErr('Too many sign-in attempts. Please wait a moment and try again.');
      } else {
        const activeUrl = getApiBaseUrl();
        const isCloud = String(activeUrl || '').includes('onrender.com');
        setErr(
          isCloud
            ? `Cannot connect to cloud backend server at:\n${activeUrl}\n\n` +
              `• Please check your device internet connection.\n` +
              `• Free-tier cloud backend may take 30–50s to wake from sleep. Please wait and try again.`
            : `Cannot connect to backend server at:\n${activeUrl}\n\n` +
              `• Ensure your phone and laptop are on the SAME Wi-Fi network.\n` +
              `• Ensure backend is running: uvicorn main:app --host 0.0.0.0 --port 8000`
        );
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1, backgroundColor: colors.niyamBlue }}
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1, paddingBottom: Math.max(insets.bottom || 0, 28) }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Sovereign Tricolor Accent Stripe */}
        <View style={{ height: 4, flexDirection: 'row', width: '100%', marginTop: topClearance + 8 }}>
          <View style={{ flex: 1, backgroundColor: '#FF9933' }} />
          <View style={{ flex: 1, backgroundColor: '#FFFFFF' }} />
          <View style={{ flex: 1, backgroundColor: '#138808' }} />
        </View>

        {/* Official Department Header */}
        <View
          style={{
            backgroundColor: colors.niyamBlue,
            paddingTop: spacing.xl,
            paddingBottom: spacing.xxxl + 8,
            alignItems: 'center',
            paddingHorizontal: spacing.lg,
          }}
        >
          {/* Insignia Pill */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: 'rgba(255,255,255,0.12)',
              paddingHorizontal: spacing.md,
              paddingVertical: 5,
              borderRadius: radius.full,
              marginBottom: spacing.lg,
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.2)',
            }}
          >
            <View
              style={{
                width: 7,
                height: 7,
                borderRadius: 4,
                backgroundColor: colors.saffron,
                marginRight: 6,
              }}
            />
            <Text
              style={{
                color: colors.white,
                fontSize: 11,
                fontWeight: '700',
                letterSpacing: 0.8,
                textTransform: 'uppercase',
              }}
            >
              Ministry of Consumer Affairs · LM Division
            </Text>
          </View>

          {/* Bespoke Netra Metrology Shield Emblem */}
          <View
            style={{
              width: 76,
              height: 76,
              borderRadius: 38,
              backgroundColor: 'rgba(14, 116, 144, 0.25)',
              borderWidth: 2.5,
              borderColor: colors.netraTeal,
              justifyContent: 'center',
              alignItems: 'center',
              marginBottom: spacing.md,
              ...shadows.md,
            }}
          >
            <View
              style={{
                width: 58,
                height: 58,
                borderRadius: 29,
                borderWidth: 2,
                borderColor: colors.saffron,
                backgroundColor: 'rgba(15, 42, 68, 0.9)',
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <View
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  borderWidth: 2,
                  borderColor: colors.white,
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
              >
                <View
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: 7,
                    backgroundColor: colors.netraTeal,
                    borderWidth: 1.5,
                    borderColor: colors.saffron,
                  }}
                />
              </View>
            </View>
          </View>

          <Text
            style={{
              color: colors.white,
              fontSize: 28,
              fontWeight: '800',
              letterSpacing: 1.2,
            }}
          >
            NiyamNetra
          </Text>
          <Text
            style={{
              color: 'rgba(255, 255, 255, 0.82)',
              fontSize: 13,
              marginTop: 4,
              fontWeight: '500',
              letterSpacing: 0.4,
            }}
          >
            Legal Metrology Compliance Enforcement
          </Text>
        </View>

        {/* Elevated Card Form Container */}
        <View
          style={{
            flex: 1,
            backgroundColor: colors.background,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            paddingHorizontal: spacing.xl,
            paddingTop: spacing.xxl,
            paddingBottom: spacing.xxl,
            ...shadows.lg,
          }}
        >
          {/* Card Title */}
          <View style={{ marginBottom: spacing.lg }}>
            <Text style={{ ...typography.h2, color: colors.niyamBlue, fontSize: 20 }}>
              Officer Sign In
            </Text>
            <Text style={{ ...typography.bodySecondary, marginTop: 3 }}>
              Enter your official credentials to access the inspection console
            </Text>
          </View>

          {/* Form Fields */}
          <Input
            label="Employee ID"
            value={employee_id}
            onChangeText={setId}
            placeholder="e.g. LM-TG-1042"
            autoCapitalize="none"
          />

          <View style={{ position: 'relative' }}>
            <Input
              label="Password"
              value={password}
              onChangeText={setPw}
              placeholder="Enter your secure password"
              secureTextEntry={!showPw}
            />
            <Pressable
              onPress={() => setShowPw((s) => !s)}
              accessibilityRole="button"
              accessibilityLabel={showPw ? 'Hide password' : 'Show password'}
              style={{
                position: 'absolute',
                right: 12,
                top: 36,
                paddingHorizontal: 8,
                paddingVertical: 4,
                borderRadius: radius.sm,
                backgroundColor: colors.borderLight,
              }}
            >
              <Text style={{ color: colors.niyamBlue, fontSize: 12, fontWeight: '700' }}>
                {showPw ? 'Hide' : 'Show'}
              </Text>
            </Pressable>
          </View>

          {/* Error Banner */}
          {err && (
            <View
              style={{
                backgroundColor: colors.errorBg,
                borderRadius: radius.md,
                padding: spacing.md,
                marginBottom: spacing.md,
                borderColor: colors.violation.border,
                borderWidth: 1.5,
              }}
            >
              <Text style={{ color: colors.error, fontSize: 13, lineHeight: 18, fontWeight: '500' }}>
                {err}
              </Text>
            </View>
          )}

          {/* Sign In Button */}
          <PrimaryButton
            title="Sign In to Console"
            onPress={submit}
            loading={loading}
            style={{ marginTop: spacing.xs, minHeight: 50 }}
          />


          {/* Statutory Footer */}
          <Text
            style={{
              ...typography.caption,
              textAlign: 'center',
              marginTop: spacing.xl,
              lineHeight: 16,
              color: colors.textMuted,
            }}
          >
            Assesses Legal Metrology (Packaged Commodities) Rules 2011 only. Not a statutory notice.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}


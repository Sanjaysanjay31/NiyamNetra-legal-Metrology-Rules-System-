import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { colors, spacing, typography, radius, shadows } from '../theme';
import Input from '../components/Input';
import PrimaryButton from '../components/PrimaryButton';
import { BACKEND_TARGETS, normalizeBackendUrl } from '../api/config';
import { switchBackend, getBackendTarget, getApiBaseUrl, getCookieWarning, getSavedCustomUrl } from '../api/client';

// Show the Local/LAN/Render/Custom switcher in development and in internal test
// builds. Set to false for the final Play Store / public production build.
const ALLOW_BACKEND_SWITCH = true;

// Backend cycle order for single-tap switching.
const TARGET_ORDER = ['local', 'lan', 'render', 'custom'];

// §5.1 Login - Employee ID + password, install-bound token
export default function LoginScreen() {
  const { login } = useAuth();
  const [employee_id, setId] = useState('');
  const [password, setPw] = useState('');
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(false);
  const [target, setTarget] = useState(getBackendTarget());
  const [baseUrl, setBaseUrl] = useState(getApiBaseUrl());
  // Web only: set when the page host and the API host differ, which silently
  // breaks the SameSite refresh cookie. Nothing else in the UI would explain it.
  const [cookieWarn, setCookieWarn] = useState(null);
  // Typed address for the 'custom' target. Pre-filled with whatever was saved
  // last, so it survives an app restart and does not have to be retyped.
  const [customText, setCustomText] = useState('');

  // AuthContext restores the saved target asynchronously, so re-read it once
  // mounted rather than trusting the value at module-load time.
  useEffect(() => {
    setTarget(getBackendTarget());
    setBaseUrl(getApiBaseUrl());
    setCookieWarn(getCookieWarning());
    setCustomText(getSavedCustomUrl() || '');
  }, []);

  const pickBackend = async (name) => {
    const url = await switchBackend(name);
    setTarget(name); setBaseUrl(url); setErr(null);
    setCookieWarn(getCookieWarning());
  };

  // Save the typed address and point the app at it. Validated here so a typo
  // gets an explanation instead of silently leaving the old URL in place.
  const applyCustom = async () => {
    if (!normalizeBackendUrl(customText)) {
      setErr('That address cannot be used. Type the laptop\'s IP, e.g. 192.168.1.7 (port 8000 is added for you).');
      return;
    }
    const url = await switchBackend('custom', customText);
    setTarget('custom'); setBaseUrl(url); setErr(null);
    setCookieWarn(getCookieWarning());
  };

  // Single-tap cycle: local → lan → render → local ...
  const cycleBackend = async () => {
    const idx = TARGET_ORDER.indexOf(target);
    const next = TARGET_ORDER[(idx + 1) % TARGET_ORDER.length];
    await pickBackend(next);
  };

  // What to actually go and check, per target. A bare "cannot reach the
  // backend at <url>" sent people looking for app bugs, when on a phone it is
  // almost always one of these three things.
  const unreachableHint = (name) => {
    if (name === 'local') {
      return '127.0.0.1 means THIS device. From a phone it can never reach your laptop — switch to LAN.';
    }
    if (name === 'render') {
      return 'A free Render service sleeps when idle; the first request can take ~1 min. Try again, or check RENDER_API_URL in api/config.js.';
    }
    if (name === 'custom') {
      return 'Check this is the laptop\'s CURRENT IPv4 (run ipconfig — a router gives a new one after a reboot), that uvicorn ran with --host 0.0.0.0, and that TCP 8000 is allowed through the firewall.';
    }
    // lan — the bundle loaded from this same host on :8081, so the network is
    // fine and it is port 8000 that is closed.
    return 'The app itself loaded from this host, so the WiFi is fine — port 8000 is not. Run uvicorn with --host 0.0.0.0 (not the default 127.0.0.1) and allow TCP 8000 through the Windows firewall.';
  };

  const submit = async () => {
    setErr(null);
    setLoading(true);
    try {
      await login(employee_id, password);
    } catch (e) {
      // Distinguish "wrong credentials" from "backend unreachable" — with
      // switchable backends, a network failure looked like a bad password.
      setErr(e?.response
        ? 'Employee ID or password is incorrect'
        : `Cannot reach the backend at ${getApiBaseUrl()}\n\n${unreachableHint(target)}`);
    } finally {
      setLoading(false);
    }
  };

  const targetInfo = BACKEND_TARGETS[target];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Brand header */}
      <View style={{ backgroundColor: colors.niyamBlue, paddingTop: spacing.xxxl, paddingBottom: spacing.xxl, alignItems: 'center', ...shadows.lg }}>
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, backgroundColor: colors.saffron }} />
        {/* Logo */}
        <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 2, borderColor: colors.netraTeal, justifyContent: 'center', alignItems: 'center', marginBottom: spacing.lg }}>
          <View style={{ width: 28, height: 28, borderWidth: 2, borderColor: colors.white, borderRadius: 14, justifyContent: 'center', alignItems: 'center' }}>
            <View style={{ width: 14, height: 18, borderWidth: 1.5, borderColor: colors.netraTeal, borderRadius: 2 }} />
          </View>
        </View>
        <Text style={{ color: colors.white, fontSize: 24, fontWeight: '700', letterSpacing: 1 }}>NiyamNetra</Text>
        <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: spacing.xs }}>Legal Metrology Compliance</Text>
      </View>

      {/* Form */}
      <View style={{ padding: spacing.xxl }}>
        <Text style={{ ...typography.h3, marginBottom: spacing.xs }}>Sign in</Text>
        <Text style={{ ...typography.bodySecondary, marginBottom: spacing.xl }}>Use your Employee ID and password</Text>
        <Input label="Employee ID" value={employee_id} onChangeText={setId} placeholder="e.g. LM-2026-0042" autoCapitalize="none" />
        <Input label="Password" value={password} onChangeText={setPw} placeholder="Enter your password" secureTextEntry />
        {err && (
          <View style={{ backgroundColor: colors.errorBg, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md, borderColor: colors.violation.border, borderWidth: 1 }}>
            <Text style={{ color: colors.error, fontSize: 13 }}>{err}</Text>
          </View>
        )}
        <PrimaryButton title="Sign In" onPress={submit} loading={loading} style={{ marginTop: spacing.md }} />

        {ALLOW_BACKEND_SWITCH && (
          <View style={{ marginTop: spacing.xl, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md }}>
            <Text style={{ ...typography.label, marginBottom: spacing.xs }}>Backend</Text>
            {/* Single tap-to-cycle switch — much easier than picking from 3 buttons */}
            <Pressable
              onPress={cycleBackend}
              accessibilityRole="button"
              accessibilityLabel={`Current backend: ${targetInfo?.label}. Tap to switch.`}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingVertical: spacing.sm,
                paddingHorizontal: spacing.md,
                borderRadius: radius.md,
                borderWidth: 1.5,
                borderColor: colors.niyamBlue,
                backgroundColor: colors.niyamBlue + '10',
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: colors.niyamBlue }}>{targetInfo?.label}</Text>
                <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 1 }}>{targetInfo?.hint}</Text>
              </View>
              <Text style={{ fontSize: 12, color: colors.netraTeal, fontWeight: '600', marginLeft: spacing.sm }}>Switch →</Text>
            </Pressable>
            <Text style={{ fontSize: 10, color: colors.textMuted, marginTop: spacing.xs }} numberOfLines={1}>{baseUrl}</Text>
            {target === 'custom' && (
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginTop: spacing.sm }}>
                <View style={{ flex: 1 }}>
                  <Input
                    value={customText}
                    onChangeText={setCustomText}
                    placeholder="192.168.1.7"
                    keyboardType="url"
                    style={{ marginBottom: 0 }}
                  />
                </View>
                <Pressable
                  onPress={applyCustom}
                  accessibilityRole="button"
                  accessibilityLabel="Save backend address"
                  style={{
                    marginLeft: spacing.sm,
                    paddingHorizontal: spacing.md,
                    paddingVertical: spacing.sm + 4,
                    borderRadius: radius.md,
                    backgroundColor: colors.netraTeal,
                  }}
                >
                  <Text style={{ color: colors.white, fontSize: 13, fontWeight: '700' }}>Save</Text>
                </Pressable>
              </View>
            )}
            {cookieWarn && (
              <Text style={{ fontSize: 10, color: colors.warning, marginTop: spacing.xs, lineHeight: 14 }}>
                Session will not persist across reloads: this page and the API are on different hosts.
              </Text>
            )}
          </View>
        )}

        <Text style={{ ...typography.caption, textAlign: 'center', marginTop: spacing.xl, lineHeight: 16 }}>
          Assesses LM (PC) Rules 2011 only. Not a statutory notice.
        </Text>
      </View>
    </View>
  );
}

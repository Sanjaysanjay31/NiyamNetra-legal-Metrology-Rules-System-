import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, Alert } from 'react-native';
import { colors, spacing, typography, radius } from '../../theme';
import Header from '../../components/Header';
import Card from '../../components/Card';
import { useAuth } from '../../auth/AuthContext';
import { useSync } from '../../offline/SyncProvider';
import { fetchMe } from '../../api/admin';

// Minimal en/hi strings for the header only — full localization is roadmap,
// not shipped. The toggle below is honest about that (no fake Switch).
const STR = {
  en: { more: 'More', signOut: 'Sign Out' },
  hi: { more: 'अधिक', signOut: 'साइन आउट' },
};

// §5.6 More - profile, queue, language, logout (live profile from /auth/me)
export default function MoreScreen({ navigation }) {
  const { logout, role } = useAuth();
  const { pending, isSyncing, syncNow } = useSync();
  const [lang, setLang] = useState('en');
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const data = await fetchMe();
        if (mounted) setMe(data);
      } catch { /* leave me null — neutral fallback below */ }
      finally { if (mounted) setLoading(false); }
    })();
    return () => { mounted = false; };
  }, []);

  const t = STR[lang] || STR.en;
  const name = me?.full_name || 'Officer';
  const empId = me?.employee_id || '—';
  const area = me?.jurisdiction || 'Field Division';
  const initials = name.trim().split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase() || 'O';

  const openLang = () => {
    Alert.alert(
      'Language',
      'Full Hindi localization is on the roadmap. The header can preview Hindi today.',
      [
        { text: 'English', onPress: () => setLang('en') },
        { text: 'हिन्दी (header)', onPress: () => setLang('hi') },
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  };

  const menuAction = (key) => {
    if (key === 'help') {
      Alert.alert('Help & Guidance', 'Capture front, back, MRP and batch panels. The server assesses 19 checks (CHK01–CHK18 + CHK06b) after sync.');
    } else {
      Alert.alert('About NiyamNetra', 'NiyamNetra v1.0 • Assesses LM (PC) Rules 2011 only. Not a statutory notice.');
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Header title={t.more} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
        {/* Profile card */}
        <Card padding="lg" style={{ marginBottom: spacing.md }}>
          {loading ? (
            <ActivityIndicator color={colors.netraTeal} />
          ) : (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.niyamBlue, justifyContent: 'center', alignItems: 'center', marginRight: spacing.md }}>
                  <Text style={{ color: colors.white, fontSize: 20, fontWeight: '700' }}>{initials}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>{name}</Text>
                  <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 2 }}>{empId}</Text>
                  <View style={{ backgroundColor: colors.info.fill, borderRadius: radius.sm, paddingHorizontal: 6, paddingVertical: 1, marginTop: 4, alignSelf: 'flex-start' }}>
                    <Text style={{ color: colors.info.text, fontSize: 10, fontWeight: '600' }}>{(me?.role || role || 'inspector').toUpperCase()}</Text>
                  </View>
                </View>
              </View>
              <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.divider }}>
                {area}
              </Text>
            </>
          )}
        </Card>

        {/* Sync queue */}
        {pending > 0 && (
          <Pressable onPress={syncNow} accessibilityRole="button" accessibilityLabel={`Sync now, ${pending} pending`}>
            <Card padding="md" style={{ marginBottom: spacing.md, borderColor: colors.info.border, borderWidth: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={{ fontSize: 20, marginRight: spacing.md }}>↻</Text>
                  <View>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text }}>{isSyncing ? 'Syncing...' : `${pending} pending`}</Text>
                    <Text style={{ fontSize: 12, color: colors.textMuted }}>{isSyncing ? 'Uploading to server' : 'Tap to sync now'}</Text>
                  </View>
                </View>
                <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.info.fill, justifyContent: 'center', alignItems: 'center' }}>
                  <Text style={{ color: colors.info.text, fontWeight: '700', fontSize: 14 }}>{pending}</Text>
                </View>
              </View>
            </Card>
          </Pressable>
        )}

        {/* Menu items */}
        <Card padding="none" style={{ marginBottom: spacing.md }}>
          {[
            { key: 'help', label: 'Help & Guidance', icon: '?' },
            { key: 'about', label: 'About NiyamNetra', icon: 'ⓘ' },
          ].map((item, idx, arr) => (
            <Pressable
              key={item.key}
              onPress={() => menuAction(item.key)}
              accessibilityRole="button"
              accessibilityLabel={item.label}
              style={{ flexDirection: 'row', alignItems: 'center', padding: spacing.md, borderBottomWidth: idx < arr.length - 1 ? 1 : 0, borderBottomColor: colors.divider }}
            >
              <Text style={{ fontSize: 18, marginRight: spacing.md, width: 24, textAlign: 'center' }}>{item.icon}</Text>
              <Text style={{ flex: 1, fontSize: 14, color: colors.text }}>{item.label}</Text>
              <Text style={{ color: '#64748B', fontSize: 16 }}>›</Text>
            </Pressable>
          ))}
        </Card>

        {/* Language — honest roadmap note, not a fake working switch */}
        <Card title="Language" padding="md" style={{ marginBottom: spacing.md }}>
          <Pressable onPress={openLang} accessibilityRole="button" accessibilityLabel="Choose language">
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View>
                <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text }}>
                  {lang === 'hi' ? 'हिन्दी (header preview)' : 'English'}
                </Text>
                <Text style={{ fontSize: 12, color: colors.textMuted }}>Full localization is on the roadmap</Text>
              </View>
              <Text style={{ color: '#64748B', fontSize: 16 }}>›</Text>
            </View>
          </Pressable>
        </Card>

        {/* Logout */}
        <Pressable onPress={logout} accessibilityRole="button" accessibilityLabel={t.signOut} style={{ marginTop: spacing.lg }}>
          <View style={{ backgroundColor: colors.errorBg, borderRadius: radius.md, padding: spacing.md, alignItems: 'center', borderColor: colors.violation.border, borderWidth: 1 }}>
            <Text style={{ color: colors.error, fontWeight: '600', fontSize: 14 }}>{t.signOut}</Text>
          </View>
        </Pressable>
        <Text style={{ ...typography.caption, textAlign: 'center', marginTop: spacing.xxl }}>NiyamNetra v1.0 • Assesses LM (PC) Rules 2011 only</Text>
      </ScrollView>
    </View>
  );
}

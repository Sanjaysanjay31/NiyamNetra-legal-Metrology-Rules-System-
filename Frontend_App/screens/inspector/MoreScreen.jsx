import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, Switch } from 'react-native';
import { colors, spacing, typography, radius } from '../../theme';
import Header from '../../components/Header';
import Card from '../../components/Card';
import { useAuth } from '../../auth/AuthContext';
import { useSync } from '../../offline/SyncProvider';

// §5.6 More - profile, queue, language, logout
export default function MoreScreen({ navigation }) {
  const { logout, role } = useAuth();
  const { pending, isSyncing, syncNow } = useSync();
  const [language, setLanguage] = useState('en');

  const profile = {
    name: 'Rajesh Kumar',
    employeeId: 'LM-2026-0042',
    role: role || 'inspector',
    area: 'Zone 3 — MG Road Division',
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Header title="More" />
      <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
        {/* Profile card */}
        <Card padding="lg" style={{ marginBottom: spacing.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.niyamBlue, justifyContent: 'center', alignItems: 'center', marginRight: spacing.md }}>
              <Text style={{ color: colors.white, fontSize: 20, fontWeight: '700' }}>RK</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>{profile.name}</Text>
              <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 2 }}>{profile.employeeId}</Text>
              <View style={{ backgroundColor: colors.info.fill, borderRadius: radius.sm, paddingHorizontal: 6, paddingVertical: 1, marginTop: 4, alignSelf: 'flex-start' }}>
                <Text style={{ color: colors.info.text, fontSize: 10, fontWeight: '600' }}>{profile.role.toUpperCase()}</Text>
              </View>
            </View>
          </View>
          <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.divider }}>
            {profile.area}
          </Text>
        </Card>

        {/* Sync queue */}
        {pending > 0 && (
          <Pressable onPress={syncNow}>
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
            <Pressable key={item.key} style={{ flexDirection: 'row', alignItems: 'center', padding: spacing.md, borderBottomWidth: idx < arr.length - 1 ? 1 : 0, borderBottomColor: colors.divider }}>
              <Text style={{ fontSize: 18, marginRight: spacing.md, width: 24, textAlign: 'center' }}>{item.icon}</Text>
              <Text style={{ flex: 1, fontSize: 14, color: colors.text }}>{item.label}</Text>
              <Text style={{ color: colors.textFaint, fontSize: 16 }}>›</Text>
            </Pressable>
          ))}
        </Card>

        {/* Language toggle */}
        <Card title="Language" padding="md" style={{ marginBottom: spacing.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View>
              <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text }}>हिन्दी</Text>
              <Text style={{ fontSize: 12, color: colors.textMuted }}>Devanagari script</Text>
            </View>
            <Switch value={language === 'hi'} onValueChange={(v) => setLanguage(v ? 'hi' : 'en')} trackColor={{ true: colors.netraTeal, false: colors.border }} />
          </View>
        </Card>

        {/* Logout */}
        <Pressable onPress={logout} style={{ marginTop: spacing.lg }}>
          <View style={{ backgroundColor: colors.errorBg, borderRadius: radius.md, padding: spacing.md, alignItems: 'center', borderColor: colors.violation.border, borderWidth: 1 }}>
            <Text style={{ color: colors.error, fontWeight: '600', fontSize: 14 }}>Sign Out</Text>
          </View>
        </Pressable>
        <Text style={{ ...typography.caption, textAlign: 'center', marginTop: spacing.xxl }}>NiyamNetra v1.0 • Assesses LM (PC) Rules 2011 only</Text>
      </ScrollView>
    </View>
  );
}

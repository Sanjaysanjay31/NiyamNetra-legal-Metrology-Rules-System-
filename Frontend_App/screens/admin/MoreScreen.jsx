import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { colors, spacing, typography, radius } from '../../theme';
import Header from '../../components/Header';
import Card from '../../components/Card';
import { useAuth } from '../../auth/AuthContext';
import { fetchMe } from '../../api/admin';

// §5.11 Admin More - profile, settings, logout (live profile from /auth/me)
export default function MoreScreen({ navigation }) {
  const { logout } = useAuth();
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const data = await fetchMe();
        if (mounted) setMe(data);
      } catch { /* leave me null — falls back to a neutral header */ }
      finally { if (mounted) setLoading(false); }
    })();
    return () => { mounted = false; };
  }, []);

  const name = me?.full_name || 'Administrator';
  const empId = me?.employee_id || '—';
  const area = me?.jurisdiction || 'State Legal Metrology Department';
  const initial = name.trim().charAt(0).toUpperCase() || 'A';

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Header title="More" />
      <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
        <Card padding="lg" style={{ marginBottom: spacing.md }}>
          {loading ? (
            <ActivityIndicator color={colors.netraTeal} />
          ) : (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.netraTeal, justifyContent: 'center', alignItems: 'center', marginRight: spacing.md }}>
                  <Text style={{ color: colors.white, fontSize: 20, fontWeight: '700' }}>{initial}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>{name}</Text>
                  <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 2 }}>{empId}</Text>
                  <View style={{ backgroundColor: colors.netraTeal + '20', borderRadius: radius.sm, paddingHorizontal: 6, paddingVertical: 1, marginTop: 4, alignSelf: 'flex-start' }}>
                    <Text style={{ color: colors.netraTeal, fontSize: 10, fontWeight: '600' }}>{(me?.role || 'admin').toUpperCase()}</Text>
                  </View>
                </View>
              </View>
              <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.divider }}>
                {area}
              </Text>
            </>
          )}
        </Card>

        <Card padding="none" style={{ marginBottom: spacing.md }}>
          {[
            { key: 'settings', label: 'System Settings', icon: '⚙️' },
            { key: 'export', label: 'Export Data', icon: '📤' },
            { key: 'audit', label: 'Audit Log', icon: '📝' },
            { key: 'about', label: 'About NiyamNetra', icon: 'ⓘ' },
          ].map((item, idx, arr) => (
            <Pressable key={item.key} style={{ flexDirection: 'row', alignItems: 'center', padding: spacing.md, borderBottomWidth: idx < arr.length - 1 ? 1 : 0, borderBottomColor: colors.divider }}>
              <Text style={{ fontSize: 18, marginRight: spacing.md, width: 24, textAlign: 'center' }}>{item.icon}</Text>
              <Text style={{ flex: 1, fontSize: 14, color: colors.text }}>{item.label}</Text>
              <Text style={{ color: colors.textFaint, fontSize: 16 }}>{'›'}</Text>
            </Pressable>
          ))}
        </Card>

        <Pressable onPress={logout} style={{ marginTop: spacing.lg }}>
          <View style={{ backgroundColor: colors.errorBg, borderRadius: radius.md, padding: spacing.md, alignItems: 'center', borderColor: colors.violation.border, borderWidth: 1 }}>
            <Text style={{ color: colors.error, fontWeight: '600', fontSize: 14 }}>Sign Out</Text>
          </View>
        </Pressable>
        <Text style={{ ...typography.caption, textAlign: 'center', marginTop: spacing.xxl }}>NiyamNetra v1.0 • Admin Module</Text>
      </ScrollView>
    </View>
  );
}

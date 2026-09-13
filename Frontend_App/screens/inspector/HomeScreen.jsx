import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  RefreshControl,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { colors, spacing, typography, radius, shadows } from '../../theme';
import Header from '../../components/Header';
import Card from '../../components/Card';
import VerdictBadge from '../../components/VerdictBadge';
import PrimaryButton from '../../components/PrimaryButton';
import EmptyState from '../../components/EmptyState';
import { useSync } from '../../offline/SyncProvider';
import { fetchTodayStats, fetchInspectionsList } from '../../api/inspections';
import { fetchMe } from '../../api/admin';

export default function HomeScreen({ navigation, onStartInspection, onResumeInspection, activeInspection }) {
  const [officer, setOfficer] = useState(null);
  const [todayStats, setTodayStats] = useState(null);
  const [recentInspections, setRecentInspections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { pending, isSyncing, syncNow } = useSync();

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const [userRes, statsRes, inspRes] = await Promise.allSettled([
        fetchMe(),
        fetchTodayStats(),
        fetchInspectionsList(),
      ]);

      if (userRes.status === 'fulfilled' && userRes.value) {
        setOfficer(userRes.value);
      }
      if (statsRes.status === 'fulfilled' && statsRes.value) {
        setTodayStats(statsRes.value);
      }
      if (inspRes.status === 'fulfilled' && inspRes.value) {
        const list = Array.isArray(inspRes.value) ? inspRes.value : [];
        setRecentInspections(list.slice(0, 5));
      }
    } catch (e) {
      // offline fallback
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const counts = todayStats?.counts || {
    total: recentInspections.length,
    compliant: recentInspections.filter((i) => (i.result || i.overall_result) === 'compliant').length,
    violation: recentInspections.filter((i) => (i.result || i.overall_result) === 'violation').length,
    not_assessed: 0,
  };

  return (
    <View style={styles.container}>
      <Header
        title="Inspector Dashboard"
        subtitle={officer?.employee_id ? `${officer.employee_id} • ${officer.jurisdiction || 'Field Office'}` : 'Legal Metrology Enforcement'}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => loadData(true)} tintColor={colors.netraTeal} />
        }
      >
        {/* Active Inspection Banner (if a visit is in progress) */}
        {activeInspection && (
          <Card
            padding="md"
            style={{
              marginBottom: spacing.lg,
              borderColor: colors.saffron,
              borderWidth: 1.5,
              backgroundColor: '#FFFDF7',
            }}
          >
            <View style={styles.rowBetween}>
              <View style={{ flex: 1 }}>
                <View style={styles.rowAlign}>
                  <Text style={styles.activePill}>ACTIVE VISIT IN PROGRESS</Text>
                </View>
                <Text style={[typography.h3, { marginTop: spacing.xs }]}>
                  {activeInspection.store?.name || 'Inspection in progress'}
                </Text>
                <Text style={styles.captionText}>
                  {activeInspection.scans?.length || 0} packages sampled • {activeInspection.transaction_type}
                </Text>
              </View>
              <Pressable
                onPress={onResumeInspection}
                style={styles.resumeButton}
                accessibilityRole="button"
                accessibilityLabel="Resume active inspection"
              >
                <Text style={styles.resumeButtonText}>Resume →</Text>
              </Pressable>
            </View>
          </Card>
        )}

        {/* Primary Action Button */}
        <View style={{ marginBottom: spacing.lg }}>
          <PrimaryButton
            title="+ Start New Store Inspection"
            onPress={onStartInspection}
            accessibilityLabel="Start a new store inspection visit"
          />
        </View>

        {/* Daily Summary Statistics */}
        <Text style={styles.sectionHeader}>TODAY'S INSPECTION SUMMARY</Text>
        <View style={styles.statsGrid}>
          <Card padding="md" style={styles.statCard}>
            <Text style={styles.statLabel}>Total Inspected</Text>
            <Text style={[typography.statNumber, { color: colors.niyamBlue }]}>
              {counts.total ?? 0}
            </Text>
            <Text style={styles.statSub}>Stores/Visits</Text>
          </Card>

          <Card padding="md" style={styles.statCard}>
            <Text style={styles.statLabel}>Compliant (Pass)</Text>
            <Text style={[typography.statNumber, { color: colors.pass.text }]}>
              {counts.compliant ?? 0}
            </Text>
            <Text style={[styles.statSub, { color: colors.pass.text }]}>Rule 6 Conforming</Text>
          </Card>

          <Card padding="md" style={styles.statCard}>
            <Text style={styles.statLabel}>Violations Flagged</Text>
            <Text style={[typography.statNumber, { color: colors.violation.text }]}>
              {counts.violation ?? 0}
            </Text>
            <Text style={[styles.statSub, { color: colors.violation.text }]}>Section 36 Action</Text>
          </Card>

          <Card padding="md" style={styles.statCard}>
            <Text style={styles.statLabel}>Pending Sync</Text>
            <Text style={[typography.statNumber, { color: pending > 0 ? colors.warning : colors.textMuted }]}>
              {pending}
            </Text>
            <Text style={styles.statSub}>{isSyncing ? 'Syncing now…' : 'Queued offline'}</Text>
          </Card>
        </View>

        {/* Statutory Scope Info Card */}
        <Card padding="md" style={styles.infoCard}>
          <View style={styles.rowAlign}>
            <Text style={{ fontSize: 18, marginRight: spacing.sm }}>⚖️</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: colors.niyamBlue }}>
                Legal Metrology (Packaged Commodities) Rules 2011
              </Text>
              <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: 2, lineHeight: 15 }}>
                19 Automated Rule Checks (CHK01–CHK18 + CHK06b) active. Pre-packaged retail goods require all mandatory declarations before sale.
              </Text>
            </View>
          </View>
        </Card>

        {/* Recent Inspections Header */}
        <View style={[styles.rowBetween, { marginTop: spacing.lg, marginBottom: spacing.sm }]}>
          <Text style={styles.sectionHeader}>RECENT INSPECTIONS</Text>
          {recentInspections.length > 0 && (
            <Pressable onPress={() => navigation?.navigate?.('Pass')} hitSlop={8}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: colors.netraTeal }}>View All →</Text>
            </Pressable>
          )}
        </View>

        {/* Recent Inspections List */}
        {loading && !refreshing ? (
          <View style={{ paddingVertical: spacing.xl, alignItems: 'center' }}>
            <ActivityIndicator size="small" color={colors.netraTeal} />
          </View>
        ) : recentInspections.length === 0 ? (
          <EmptyState
            icon="📋"
            title="No inspections recorded today"
            subtitle="Tap '+ Start New Store Inspection' above to begin an establishment visit."
            variant="neutral"
          />
        ) : (
          recentInspections.map((item) => {
            const dateStr = item.date || item.created_at || item.local_created_at || '';
            const verdict = item.overall_result || item.result || 'not_assessed';
            return (
              <Card key={item.id || item.client_uuid} padding="md" style={styles.inspectionCard}>
                <View style={styles.rowBetween}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: 2 }}>
                      {item.store_name || item.store?.name || 'Retail Establishment'}
                    </Text>
                    <Text style={{ fontSize: 11, color: colors.textMuted }}>
                      {dateStr ? String(dateStr).slice(0, 10) : 'Today'} • {item.transaction_type || 'Retail Sale'}
                    </Text>
                  </View>
                  <VerdictBadge result={verdict} />
                </View>
              </Card>
            );
          })
        )}
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
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rowAlign: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  activePill: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: colors.warning,
    backgroundColor: colors.warningBg,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  resumeButton: {
    backgroundColor: colors.niyamBlue,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.md,
  },
  resumeButtonText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '700',
  },
  sectionHeader: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  statCard: {
    flexBasis: '48%',
    flexGrow: 1,
    alignItems: 'flex-start',
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 4,
  },
  statSub: {
    fontSize: 10,
    color: colors.textMuted,
    marginTop: 2,
  },
  infoCard: {
    backgroundColor: colors.info.fill,
    borderColor: colors.info.border,
    borderWidth: 1,
  },
  captionText: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  inspectionCard: {
    marginBottom: spacing.sm,
  },
});

// screens/inspector/ReviewQueueScreen.jsx — Phase 6A: Inspector Review Queue
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  RefreshControl,
  ActivityIndicator,
  TextInput,
  StyleSheet,
} from 'react-native';
import { colors, spacing, typography, radius, shadows } from '../../theme';
import Header from '../../components/Header';
import Card from '../../components/Card';
import EmptyState from '../../components/EmptyState';
import { fetchReviewQueue, fetchReviewSummary } from '../../api/review';
import { cacheReviewQueue, loadCachedReviewQueue } from '../../offline/queue';

const STATUS_FILTERS = [
  { id: 'ALL', label: 'All Status' },
  { id: 'OPEN', label: 'Open' },
  { id: 'IN_REVIEW', label: 'In Review' },
  { id: 'RESOLVED', label: 'Resolved' },
];

const REASON_FILTERS = [
  { id: 'ALL', label: 'All Reasons' },
  { id: 'violation', label: 'Violations' },
  { id: 'not_assessed', label: 'Incomplete' },
  { id: 'low_confidence', label: 'Low Conf' },
  { id: 'offline_edit', label: 'Offline Edits' },
];

export default function ReviewQueueScreen({ onSelectInspection, onBack }) {
  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [reasonFilter, setReasonFilter] = useState('ALL');
  const [areaSearch, setAreaSearch] = useState('');
  const [isOffline, setIsOffline] = useState(false);

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const [queueData, summaryData] = await Promise.all([
        fetchReviewQueue({
          status_filter: statusFilter,
          reason: reasonFilter,
          area: areaSearch,
        }),
        fetchReviewSummary(),
      ]);

      const queueItems = Array.isArray(queueData) ? queueData : queueData?.items || [];
      setItems(queueItems);
      setSummary(summaryData);
      setIsOffline(false);
      await cacheReviewQueue(queueItems);
    } catch (err) {
      // Offline fallback: load cached review items
      const cached = await loadCachedReviewQueue();
      if (cached && cached.length > 0) {
        let filtered = cached;
        if (statusFilter !== 'ALL') {
          filtered = filtered.filter((x) => x.status === statusFilter);
        }
        if (reasonFilter !== 'ALL') {
          filtered = filtered.filter((x) => x.reasons?.some((r) => r.type === reasonFilter));
        }
        setItems(filtered);
      }
      setIsOffline(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [statusFilter, reasonFilter, areaSearch]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const getPriorityStyle = (priority) => {
    switch (String(priority).toLowerCase()) {
      case 'critical':
      case 'high':
        return { bg: '#FEE2E2', border: '#FCA5A5', text: '#B91C1C' };
      case 'medium':
        return { bg: '#FEF3C7', border: '#FCD34D', text: '#B45309' };
      default:
        return { bg: '#F1F5F9', border: '#CBD5E1', text: '#475569' };
    }
  };

  const getStatusBadgeStyle = (status) => {
    switch (String(status).toUpperCase()) {
      case 'RESOLVED':
        return { bg: '#ECFDF5', border: '#A7F3D0', text: '#047857' };
      case 'IN_REVIEW':
        return { bg: '#EFF6FF', border: '#BFDBFE', text: '#1D4ED8' };
      default:
        return { bg: '#FFFBEB', border: '#FDE68A', text: '#B45309' };
    }
  };

  return (
    <View style={styles.container}>
      <Header
        title="Officer Review Queue"
        subtitle="Adjudication of flagged packages & incomplete evidence"
        leftAction={onBack ? { icon: '←', onPress: onBack, label: 'Back' } : null}
      />

      {isOffline && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineText}>
            ⚡ Offline mode: showing cached items. Adjudications will queue locally for sync.
          </Text>
        </View>
      )}

      {/* Summary Cards */}
      {summary && (
        <View style={styles.summaryRow}>
          <Card padding="sm" style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Total Queue</Text>
            <Text style={[styles.summaryValue, { color: colors.niyamBlue }]}>
              {summary.total ?? 0}
            </Text>
          </Card>
          <Card padding="sm" style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Violations</Text>
            <Text style={[styles.summaryValue, { color: colors.violation.text }]}>
              {summary.violations_pending ?? 0}
            </Text>
          </Card>
          <Card padding="sm" style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Incomplete</Text>
            <Text style={[styles.summaryValue, { color: colors.warning }]}>
              {summary.not_assessed ?? 0}
            </Text>
          </Card>
          <Card padding="sm" style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Low Conf</Text>
            <Text style={[styles.summaryValue, { color: colors.textSecondary }]}>
              {summary.low_confidence ?? 0}
            </Text>
          </Card>
        </View>
      )}

      {/* Filter Tabs */}
      <View style={styles.filterSection}>
        {/* Status Filters */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterBar}>
          {STATUS_FILTERS.map((f) => (
            <Pressable
              key={f.id}
              style={[styles.filterChip, statusFilter === f.id && styles.filterChipActive]}
              onPress={() => setStatusFilter(f.id)}
            >
              <Text style={[styles.filterChipText, statusFilter === f.id && styles.filterChipTextActive]}>
                {f.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* Reason Filters */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.filterBar, { marginTop: 6 }]}>
          {REASON_FILTERS.map((r) => (
            <Pressable
              key={r.id}
              style={[styles.subFilterChip, reasonFilter === r.id && styles.subFilterChipActive]}
              onPress={() => setReasonFilter(r.id)}
            >
              <Text style={[styles.subFilterChipText, reasonFilter === r.id && styles.subFilterChipTextActive]}>
                {r.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {/* Search Input */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Filter by city or district..."
          placeholderTextColor={colors.placeholder}
          value={areaSearch}
          onChangeText={setAreaSearch}
          onSubmitEditing={() => loadData()}
          returnKeyType="search"
        />
      </View>

      {/* Item List */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => loadData(true)} colors={[colors.netraTeal]} />
        }
      >
        {loading && !refreshing ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={colors.netraTeal} />
            <Text style={styles.loadingText}>Loading review queue...</Text>
          </View>
        ) : items.length === 0 ? (
          <EmptyState
            icon="⚖️"
            title="No inspections require review"
            subtitle="All recorded inspections have passed or have been fully adjudicated."
            variant="neutral"
          />
        ) : (
          items.map((item) => {
            const pStyle = getPriorityStyle(item.priority);
            const sStyle = getStatusBadgeStyle(item.status);
            const unconfirmedCount = item.findings?.filter((f) => f.needs_review)?.length || 0;

            return (
              <Pressable
                key={item.review_id || `${item.inspection_id}-${item.scan_id}`}
                onPress={() => onSelectInspection && onSelectInspection(item.inspection_id)}
              >
                <Card padding="md" style={styles.itemCard}>
                  {/* Top Header: ID, Priority, Status */}
                  <View style={styles.rowBetween}>
                    <Text style={styles.inspectionId}>
                      INSP #{item.inspection_id} • SCAN #{item.scan_id}
                    </Text>
                    <View style={styles.rowAlign}>
                      <View style={[styles.badge, { backgroundColor: pStyle.bg, borderColor: pStyle.border }]}>
                        <Text style={[styles.badgeText, { color: pStyle.text }]}>
                          {item.priority?.toUpperCase() || 'MEDIUM'}
                        </Text>
                      </View>
                      <View style={[styles.badge, { backgroundColor: sStyle.bg, borderColor: sStyle.border, marginLeft: 6 }]}>
                        <Text style={[styles.badgeText, { color: sStyle.text }]}>
                          {item.status || 'OPEN'}
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* Store & Date Info */}
                  <Text style={styles.storeName}>{item.store_name || 'Retail Establishment'}</Text>
                  <Text style={styles.metaText}>
                    {item.store_area ? `${item.store_area} • ` : ''}
                    {item.inspection_date ? String(item.inspection_date).slice(0, 10) : 'Recent'} • Officer: {item.inspector_name || 'Assigned Officer'}
                  </Text>

                  {/* Commodity / Product info */}
                  {item.commodity_generic && (
                    <Text style={styles.commodityText}>
                      📦 {item.commodity_generic} {item.brand_name ? `(${item.brand_name})` : ''}
                    </Text>
                  )}

                  {/* Reasons list */}
                  {item.reasons && item.reasons.length > 0 && (
                    <View style={styles.reasonsBox}>
                      {item.reasons.map((r, idx) => (
                        <View key={idx} style={styles.reasonRow}>
                          <Text style={styles.reasonBullet}>•</Text>
                          <Text style={styles.reasonDetail}>{r.detail}</Text>
                        </View>
                      ))}
                    </View>
                  )}

                  {/* Bottom Footer: unconfirmed count & Action CTA */}
                  <View style={[styles.rowBetween, { marginTop: spacing.sm, paddingTop: spacing.xs, borderTopWidth: 1, borderTopColor: colors.borderLight }]}>
                    <Text style={styles.unconfirmedText}>
                      {unconfirmedCount > 0 ? `⚠️ ${unconfirmedCount} finding(s) require review` : 'All findings verified'}
                    </Text>
                    <Text style={styles.actionCta}>Open Adjudication →</Text>
                  </View>
                </Card>
              </Pressable>
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
  offlineBanner: {
    backgroundColor: colors.warningBg,
    borderColor: colors.warning,
    borderBottomWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  offlineText: {
    fontSize: 11,
    color: colors.warning,
    fontWeight: '600',
    textAlign: 'center',
  },
  summaryRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    gap: spacing.xs,
  },
  summaryCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  summaryLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 2,
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: '800',
  },
  filterSection: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  filterBar: {
    gap: spacing.xs,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
  },
  filterChipActive: {
    backgroundColor: colors.niyamBlue,
    borderColor: colors.niyamBlue,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  filterChipTextActive: {
    color: colors.white,
  },
  subFilterChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    borderColor: colors.borderLight,
    borderWidth: 1,
  },
  subFilterChipActive: {
    backgroundColor: colors.netraTeal,
    borderColor: colors.netraTeal,
  },
  subFilterChipText: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.textMuted,
  },
  subFilterChipTextActive: {
    color: colors.white,
    fontWeight: '700',
  },
  searchContainer: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xs,
  },
  searchInput: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    fontSize: 12,
    color: colors.text,
  },
  scroll: {
    flex: 1,
  },
  listContent: {
    padding: spacing.md,
    paddingBottom: spacing.xxxl + 40,
    gap: spacing.md,
  },
  centerContainer: {
    paddingVertical: spacing.xxl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: spacing.sm,
    fontSize: 13,
    color: colors.textMuted,
  },
  itemCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    ...shadows.sm,
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
  inspectionId: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.netraTeal,
    letterSpacing: 0.5,
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  storeName: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    marginTop: 6,
  },
  metaText: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  commodityText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '600',
    marginTop: 4,
  },
  reasonsBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: radius.sm,
    padding: spacing.sm,
    marginTop: spacing.sm,
    gap: 3,
  },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  reasonBullet: {
    fontSize: 12,
    color: colors.warning,
    marginRight: 4,
    fontWeight: '700',
  },
  reasonDetail: {
    fontSize: 11,
    color: colors.textSecondary,
    flex: 1,
    lineHeight: 15,
  },
  unconfirmedText: {
    fontSize: 11,
    color: colors.warning,
    fontWeight: '600',
  },
  actionCta: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.netraTeal,
  },
});

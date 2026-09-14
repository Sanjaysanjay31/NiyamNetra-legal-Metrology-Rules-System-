import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, RefreshControl, ActivityIndicator } from 'react-native';
import { colors, spacing, typography, radius } from '../../theme';
import Header from '../../components/Header';
import Card from '../../components/Card';
import StatCard from '../../components/StatCard';
import SegmentControl from '../../components/SegmentControl';
import EmptyState from '../../components/EmptyState';
import VerdictBadge from '../../components/VerdictBadge';
import { fetchInspections } from '../../api/admin';

// §5.5 Inspector Reports — calendar + stats from live GET /inspections data.
// No fabricated numbers: counts come from the server (or an honest empty
// state when offline), and the calendar is the CURRENT month with navigation.
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// Local date (not toISOString/UTC): an inspection at 00:30 IST must bucket to
// the local day, not the previous UTC day.
function fmtLocal(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function itemDay(it) {
  const raw = it?.date || it?.inspection_date || it?.local_created_at || it?.created_at || '';
  return String(raw).slice(0, 10);
}

// Parse the item date into { y, m } for the month branch. Handles missing or
// malformed dates by returning null (row excluded from month stats, never
// silently counted as "this month").
function itemYearMonth(it) {
  const d = itemDay(it);
  const m = /^(\d{4})-(\d{2})-\d{2}/.exec(d);
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]) };
}

function bucket(it) {
  const isRefusal = it?.signature_status === 'refused' || it?.is_refusal || String(it?.result || it?.overall_result || '').toLowerCase() === 'refused';
  if (isRefusal) return 'refused';
  const r = String(it?.result || it?.overall_result || it?.verdict || it?.status || '').toLowerCase();
  if (['success', 'pass', 'compliant'].includes(r)) return 'success';
  if (['violation', 'fail', 'non_compliant', 'non-compliant'].includes(r)) return 'violation';
  return 'notAssessed';
}

export default function ReportsScreen({ navigation }) {
  const [period, setPeriod] = useState('today');
  const [outcomeFilter, setOutcomeFilter] = useState('all');
  const [inspections, setInspections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null); // null | 'forbidden' | 'network'
  const [dayFilter, setDayFilter] = useState(null); // YYYY-MM-DD or null
  // Displayed calendar month — starts at the current month, navigable.
  const now = new Date();
  const [monthCursor, setMonthCursor] = useState({ y: now.getFullYear(), m: now.getMonth() });

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      // Backend GET /inspections supports store_id/status/date range/q only —
      // no result filter, so fetch the range and filter client-side below.
      const data = await fetchInspections();
      setInspections(Array.isArray(data) ? data : data?.items || data?.results || []);
    } catch (e) {
      const status = e?.status ?? e?.response?.status;
      setError(status === 403 || e?.code === 'FORBIDDEN' ? 'forbidden' : 'network');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const today = fmtLocal(new Date());
  const yesterdayD = new Date();
  yesterdayD.setDate(yesterdayD.getDate() - 1);
  const yesterday = fmtLocal(yesterdayD);
  const weekStart = fmtLocal(new Date(Date.now() - 6 * 24 * 3600 * 1000));
  const last30Start = fmtLocal(new Date(Date.now() - 29 * 24 * 3600 * 1000));

  const inPeriod = useCallback((it) => {
    const d = itemDay(it);
    if (!d) return false;
    if (dayFilter) return d === dayFilter;
    if (period === 'today') return d === today;
    if (period === 'yesterday') return d === yesterday;
    if (period === 'week' || period === 'last7') return d >= weekStart;
    if (period === 'last30') return d >= last30Start;
    if (period === 'month') {
      const ym = itemYearMonth(it);
      if (!ym) return false;
      return ym.y === monthCursor.y && ym.m === monthCursor.m + 1;
    }
    return true;
  }, [period, today, yesterday, weekStart, last30Start, dayFilter, monthCursor]);

  const periodRows = useMemo(() => {
    return inspections.filter((i) => inPeriod(i));
  }, [inspections, inPeriod]);

  const currentStats = useMemo(() => {
    let success = 0;
    let violations = 0;
    let refusals = 0;
    periodRows.forEach((i) => {
      const b = bucket(i);
      if (b === 'refused') refusals += 1;
      else if (b === 'success') success += 1;
      else if (b === 'violation') violations += 1;
    });
    return {
      inspections: periodRows.length,
      success,
      violations,
      refusals,
      notAssessed: Math.max(0, periodRows.length - success - violations - refusals),
    };
  }, [periodRows]);

  const displayedRows = useMemo(() => {
    if (outcomeFilter === 'all') return periodRows;
    return periodRows.filter((i) => bucket(i) === outcomeFilter);
  }, [periodRows, outcomeFilter]);

  // ---- Dynamic calendar grid for the cursor month ----
  const { y, m } = monthCursor;
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const leadOffset = new Date(y, m, 1).getDay(); // 0=Sun … 6=Sat
  const isFutureMonth = y > now.getFullYear() || (y === now.getFullYear() && m > now.getMonth());
  const perDay = useMemo(() => {
    const map = {};
    inspections.forEach((i) => {
      const d = itemDay(i);
      if (!d.startsWith(`${y}-${String(m + 1).padStart(2, '0')}`)) return;
      const day = parseInt(d.slice(8, 10), 10);
      if (!map[day]) map[day] = { inspections: 0, hasViolation: false, hasRefusal: false };
      map[day].inspections += 1;
      const b = bucket(i);
      if (b === 'violation') map[day].hasViolation = true;
      if (b === 'refused') map[day].hasRefusal = true;
    });
    return map;
  }, [inspections, y, m]);

  const shiftMonth = (delta) => {
    setMonthCursor((c) => {
      const d = new Date(c.y, c.m + delta, 1);
      if (d > new Date(now.getFullYear(), now.getMonth(), 1)) return c;
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  };

  const selectedDay = now.getFullYear() === y && now.getMonth() === m ? now.getDate() : null;
  const assessableCount = Math.max(0, currentStats.inspections - currentStats.refusals);
  const rate = assessableCount > 0
    ? Math.round((currentStats.success / assessableCount) * 100)
    : 0;

  const toggleDay = (day) => {
    const key = `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    setDayFilter((f) => (f === key ? null : key));
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Header title="Reports" subtitle="Your inspection activity" />
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
      >
        {/* Period selector */}
        <SegmentControl
          selected={period}
          onSelect={(p) => { setPeriod(p); setDayFilter(null); }}
          options={[
            { key: 'today', label: 'Today' },
            { key: 'week', label: 'This Week' },
            { key: 'month', label: 'This Month' },
          ]}
        />
        {/* Quick presets */}
        <View style={{ flexDirection: 'row', marginTop: spacing.sm }}>
          {[
            { key: 'yesterday', label: 'Yesterday' },
            { key: 'last7', label: 'Last 7' },
            { key: 'last30', label: 'Last 30' },
          ].map((p) => (
            <Pressable
              key={p.key}
              onPress={() => { setPeriod(p.key); setDayFilter(null); }}
              accessibilityRole="button"
              accessibilityLabel={`Preset ${p.label}`}
              accessibilityState={{ selected: period === p.key }}
              style={{
                paddingVertical: 8, paddingHorizontal: 12, borderRadius: radius.full,
                borderWidth: 1, borderColor: period === p.key ? colors.niyamBlue : colors.border,
                backgroundColor: period === p.key ? colors.niyamBlue + '10' : 'transparent',
                marginRight: spacing.sm, minHeight: 44, justifyContent: 'center',
              }}
            >
              <Text style={{ fontSize: 12, fontWeight: '600', color: period === p.key ? colors.niyamBlue : colors.textSecondary }}>
                {p.label}
              </Text>
            </Pressable>
          ))}
        </View>
        {dayFilter && (
          <Pressable
            onPress={() => setDayFilter(null)}
            accessibilityRole="button"
            accessibilityLabel={`Clear day filter ${dayFilter}`}
            style={{ marginTop: spacing.sm, alignSelf: 'flex-start', paddingVertical: 8, paddingHorizontal: 12, borderRadius: radius.full, backgroundColor: colors.niyamBlue }}
          >
            <Text style={{ color: colors.white, fontSize: 12, fontWeight: '600' }}>Day: {dayFilter} ✕</Text>
          </Pressable>
        )}

        {loading ? (
          <View style={{ paddingVertical: spacing.xxl, alignItems: 'center' }}>
            <ActivityIndicator color={colors.netraTeal} />
          </View>
        ) : error && inspections.length === 0 ? (
          <View style={{ marginTop: spacing.lg }}>
            <EmptyState
              icon="⚠️"
              title={error === 'forbidden' ? 'Not permitted' : 'Could not load reports'}
              subtitle={error === 'forbidden'
                ? 'Your account cannot view these reports. Contact your administrator.'
                : 'Check your connection and pull to refresh.'}
            />
          </View>
        ) : (
          <>
            {/* Stats row with 4 cards including Refusals */}
            <View style={{ flexDirection: 'row', marginTop: spacing.lg, marginBottom: spacing.lg }}>
              <StatCard label="Inspections" value={currentStats.inspections} />
              <StatCard label="Success" value={currentStats.success} color={colors.pass.text} />
              <StatCard label="Violations" value={currentStats.violations} color={colors.violation.text} alert={currentStats.violations > 0} />
              <StatCard label="Refusals" value={currentStats.refusals} color={colors.review.text} alert={currentStats.refusals > 0} />
            </View>

            {/* Calendar */}
            <Card
              title={`${MONTH_NAMES[m]} ${y}`}
              subtitle="Tap a day to filter inspections"
              padding="md"
              style={{ marginBottom: spacing.md }}
              rightElement={(
                <View style={{ flexDirection: 'row' }}>
                  <Pressable onPress={() => shiftMonth(-1)} accessibilityRole="button" accessibilityLabel="Previous month" hitSlop={8} style={{ padding: 8, minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' }}>
                    <Text style={{ fontSize: 16, color: colors.netraTeal }}>‹</Text>
                  </Pressable>
                  <Pressable onPress={() => shiftMonth(1)} disabled={isFutureMonth} accessibilityRole="button" accessibilityLabel="Next month" hitSlop={8} style={{ padding: 8, opacity: isFutureMonth ? 0.3 : 1, minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' }}>
                    <Text style={{ fontSize: 16, color: colors.netraTeal }}>›</Text>
                  </Pressable>
                </View>
              )}
            >
              {/* Day headers */}
              <View style={{ flexDirection: 'row', marginBottom: spacing.sm }}>
                {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                  <Text key={i} style={{ flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '600', color: colors.textMuted }}>{d}</Text>
                ))}
              </View>
              {/* Calendar grid */}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                {Array.from({ length: leadOffset }, (_, i) => (
                  <View key={`empty-${i}`} style={{ width: `${100 / 7}%`, aspectRatio: 1, padding: 2 }} />
                ))}
                {Array.from({ length: daysInMonth }, (_, i) => {
                  const day = i + 1;
                  const info = perDay[day] || { inspections: 0, hasViolation: false, hasRefusal: false };
                  const isToday = day === selectedDay;
                  const dayKey = `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                  const isFiltered = dayFilter === dayKey;

                  const tileBg = isFiltered
                    ? colors.netraTeal
                    : isToday
                    ? colors.niyamBlue
                    : info.hasViolation
                    ? colors.violation.fill
                    : info.hasRefusal
                    ? colors.review.fill
                    : info.inspections > 0
                    ? colors.pass.fill
                    : 'transparent';

                  const dotColor = info.hasViolation
                    ? colors.violation.text
                    : info.hasRefusal
                    ? colors.review.text
                    : colors.pass.text;

                  return (
                    <View key={day} style={{ width: `${100 / 7}%`, aspectRatio: 1, padding: 2 }}>
                      <Pressable
                        onPress={() => toggleDay(day)}
                        accessibilityRole="button"
                        accessibilityLabel={`${dayKey}, ${info.inspections} inspections${info.hasViolation ? ', has violation' : ''}${info.hasRefusal ? ', has refusal' : ''}`}
                        accessibilityState={{ selected: isFiltered }}
                        hitSlop={2}
                        style={{
                          flex: 1,
                          borderRadius: radius.sm,
                          backgroundColor: tileBg,
                          justifyContent: 'center',
                          alignItems: 'center',
                          borderWidth: isToday || isFiltered ? 0 : 1,
                          borderColor: colors.borderLight,
                        }}
                      >
                        <Text style={{
                          fontSize: 12,
                          fontWeight: isToday || isFiltered ? '700' : '500',
                          color: isToday || isFiltered ? colors.white : colors.text,
                        }}>
                          {day}
                        </Text>
                        {info.inspections > 0 && !isToday && !isFiltered && (
                          <View style={{
                            position: 'absolute',
                            bottom: 3,
                            width: 4,
                            height: 4,
                            borderRadius: 2,
                            backgroundColor: dotColor,
                          }} />
                        )}
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            </Card>

            {/* Compliance rate */}
            <Card title="Compliance Rate" padding="lg">
              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 48, fontWeight: '700', color: colors.niyamBlue }}>
                  {rate}%
                </Text>
                <Text style={typography.bodySecondary}>
                  {currentStats.success} of {assessableCount} assessable inspections compliant
                  {currentStats.refusals > 0 ? ` • ${currentStats.refusals} refusal(s) excluded` : ''}
                </Text>
              </View>
              {/* Progress bar */}
              <View style={{ height: 8, backgroundColor: colors.borderLight, borderRadius: radius.full, marginTop: spacing.md, overflow: 'hidden' }}>
                <View style={{
                  width: `${rate}%`,
                  height: '100%',
                  backgroundColor: colors.pass.text,
                  borderRadius: radius.full,
                }} />
              </View>
            </Card>

            {/* Outcome Segment Filter & Inspection List */}
            <View style={{ marginTop: spacing.lg, marginBottom: spacing.sm }}>
              <Text style={[{ fontSize: 13, fontWeight: '700', color: colors.textSecondary, marginBottom: spacing.xs }]}>
                VISIT RECORDS ({displayedRows.length})
              </Text>
              <SegmentControl
                selected={outcomeFilter}
                onSelect={setOutcomeFilter}
                options={[
                  { key: 'all', label: `All (${periodRows.length})` },
                  { key: 'success', label: `Pass (${currentStats.success})` },
                  { key: 'violation', label: `Violations (${currentStats.violations})` },
                  { key: 'refused', label: `Refusals (${currentStats.refusals})` },
                ]}
              />
            </View>

            {displayedRows.length === 0 ? (
              <Card padding="md" style={{ marginTop: spacing.sm, alignItems: 'center' }}>
                <Text style={{ color: colors.textMuted, fontSize: 12, paddingVertical: spacing.sm }}>
                  No inspection records match this filter.
                </Text>
              </Card>
            ) : (
              displayedRows.map((item) => {
                const isRefusal = item.signature_status === 'refused' || item.is_refusal || String(item.result || item.overall_result || '').toLowerCase() === 'refused';
                const dateStr = itemDay(item);
                const storeName = item.store_name || item.store?.name || 'Retail Establishment';
                const verdict = isRefusal ? 'refused' : (item.overall_result || item.result || 'not_assessed');
                return (
                  <Card key={item.id || item.client_uuid} padding="md" style={{ marginTop: spacing.sm }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <View style={{ flex: 1, marginRight: spacing.sm }}>
                        <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: 2 }}>
                          {storeName}
                        </Text>
                        <Text style={{ fontSize: 11, color: colors.textMuted }}>
                          {dateStr} • {isRefusal ? 'Merchant Non-Cooperation' : (item.transaction_type || 'Retail Sale')}
                        </Text>
                        {isRefusal && (
                          <Text style={{ fontSize: 11, color: colors.review.text, fontStyle: 'italic', marginTop: 4 }}>
                            Reason: {item.notes || 'Merchant refused inspection / signature.'}
                          </Text>
                        )}
                      </View>
                      <VerdictBadge result={verdict} />
                    </View>
                  </Card>
                );
              })
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

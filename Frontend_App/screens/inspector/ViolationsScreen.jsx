import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, RefreshControl, ActivityIndicator, Image, Alert } from 'react-native';
import { colors, spacing, typography, radius } from '../../theme';
import Header from '../../components/Header';
import Card from '../../components/Card';
import VerdictBadge from '../../components/VerdictBadge';
import EmptyState from '../../components/EmptyState';
import FindingRow from '../../components/FindingRow';
import { fetchInspections } from '../../api/admin';

// §5.4 Violations list — live data from GET /inspections, with detail view.
function itemDate(it) {
  const raw = it?.date || it?.inspection_date || it?.local_created_at || it?.created_at || '';
  return String(raw).slice(0, 10);
}

function isViolation(it) {
  const r = String(it?.result || it?.overall_result || it?.verdict || it?.status || '').toLowerCase();
  if (['violation', 'fail', 'non_compliant', 'non-compliant'].includes(r)) return true;
  return Number(it?.result_counts?.violation || 0) > 0 || Number(it?.violation_count || 0) > 0;
}

function findingsOf(it) {
  if (Array.isArray(it?.findings)) return it.findings;
  if (Array.isArray(it?.checks)) {
    return it.checks
      .filter((c) => String(c?.verdict || c?.result || '').toLowerCase() !== 'pass')
      .map((c) => ({
        code: c.code || c.check_id || '',
        name: c.title || c.name || '',
        checkVerdict: c.verdict || c.result || 'fail',
        reason: c.reason || c.note || '',
        value: c.value != null ? String(c.value) : '',
      }));
  }
  return [];
}

export default function ViolationsScreen({ navigation }) {
  const [view, setView] = useState('list'); // list | detail
  const [selectedInspection, setSelectedInspection] = useState(null);
  const [violations, setViolations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null); // null | 'forbidden' | 'network'

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      // Backend GET /inspections supports store_id/status/date range/q only —
      // there is no result= filter, so fetch and filter client-side. Passing
      // { result } would be silently ignored and suggest filtering that never
      // happens.
      const data = await fetchInspections();
      const list = Array.isArray(data) ? data : data?.items || data?.results || [];
      setViolations(list.filter(isViolation));
    } catch (e) {
      const status = e?.status ?? e?.response?.status;
      setError(status === 403 || e?.code === 'FORBIDDEN' ? 'forbidden' : 'network');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (view === 'detail' && selectedInspection) {
    const v = selectedInspection;
    const findings = findingsOf(v);
    const violated = v.violated ?? v.violation_count ?? findings.length;
    const checks = v.checks ?? v.checks_total ?? v.total_checks ?? 0;
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <Header title="Violation Details" subtitle={v.store_name || v.store || ''} onBack={() => setView('list')} />
        <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
          {/* Violation summary */}
          <Card title={v.commodity || v.commodity_generic || 'Inspection'} subtitle={`${violated} of ${checks} checks violated`} padding="lg" style={{ marginBottom: spacing.md }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm }}>
              <View>
                <Text style={typography.label}>Store</Text>
                <Text style={typography.body}>{v.store_name || v.store || 'Unknown store'}</Text>
              </View>
              <VerdictBadge result="violation" />
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <View>
                <Text style={typography.label}>Date</Text>
                <Text style={typography.body}>{itemDate(v)}</Text>
              </View>
              <View>
                <Text style={typography.label}>Checks run</Text>
                <Text style={typography.body}>{checks ? `${checks} assessed` : '19 checks (CHK01–CHK18 + CHK06b) — assessed count from server'}</Text>
              </View>
            </View>
          </Card>

          {/* Findings */}
          <Text style={{ ...typography.h4, marginBottom: spacing.sm }}>Findings</Text>
          {findings.length === 0 ? (
            <Text style={{ fontSize: 13, color: colors.textMuted, marginBottom: spacing.md }}>
              Finding details were not returned for this inspection.
            </Text>
          ) : (
            findings.map((f, i) => <FindingRow key={i} finding={f} />)
          )}

          {/* Evidence link */}
          <Card title="Evidence" subtitle="Tap to view captured images" padding="md" style={{ marginTop: spacing.md }}>
            {(v.evidence_uris || v.photos || v.images || []).length === 0 ? (
              <Text style={{ fontSize: 12, color: colors.textMuted }}>No evidence images attached.</Text>
            ) : (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                {(v.evidence_uris || v.photos || v.images || []).map((u, i) => {
                  const uri = typeof u === 'string' ? u : u?.uri || u?.url || u?.file_path;
                  if (!uri) return null;
                  return (
                    <Pressable
                      key={i}
                      onPress={() => Alert.alert('Evidence', `Image ${i + 1} — full carousel is roadmap; file kept server-side.`)}
                      accessibilityRole="imagebutton"
                      accessibilityLabel={`Evidence image ${i + 1}`}
                    >
                      <Image
                        source={{ uri }}
                        style={{ width: 60, height: 60, borderRadius: radius.sm, backgroundColor: colors.border, margin: spacing.xs, borderWidth: 2, borderColor: colors.saffron }}
                      />
                    </Pressable>
                  );
                })}
              </View>
            )}
          </Card>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Header title="Violations" subtitle={`${violations.length} flagged`} />
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
      >
        {loading ? (
          <View style={{ paddingVertical: spacing.xxl, alignItems: 'center' }}>
            <ActivityIndicator color={colors.netraTeal} />
          </View>
        ) : error && violations.length === 0 ? (
          <EmptyState
            icon="⚠️"
            title={error === 'forbidden' ? 'Not permitted' : 'Could not load violations'}
            subtitle={error === 'forbidden'
              ? 'Your account cannot view violations. Contact your administrator.'
              : 'Check your connection and pull to refresh.'}
            variant="neutral"
          />
        ) : violations.length === 0 ? (
          <EmptyState
            icon="✓"
            title="No violations recorded today"
            subtitle="Finding no violations is a fact about the shelf, not a performance."
            variant="neutral"
          />
        ) : (
          violations.map((v) => {
            const violated = v.violated ?? v.violation_count ?? findingsOf(v).length;
            return (
              <Pressable key={v.id} onPress={() => { setSelectedInspection(v); setView('detail'); }}>
                <Card padding="md" style={{ marginBottom: spacing.sm }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 15, fontWeight: '600', color: colors.text, marginBottom: 4 }}>
                        {v.store_name || v.store || 'Unknown store'}
                      </Text>
                      <Text style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 4 }}>{v.commodity || v.commodity_generic || ''}</Text>
                      <Text style={{ fontSize: 12, color: colors.textMuted }}>{itemDate(v)}</Text>
                      <View style={{ flexDirection: 'row', marginTop: spacing.sm }}>
                        <View style={{ backgroundColor: colors.violation.fill, borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 2 }}>
                          <Text style={{ color: colors.violation.text, fontSize: 11, fontWeight: '600' }}>✗ {violated} violation{violated === 1 ? '' : 's'}</Text>
                        </View>
                      </View>
                    </View>
                    <VerdictBadge result="violation" />
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
